import path from "node:path";
import { loadConfig } from "./config/index.js";
import { BatchedEmbeddingProvider } from "./embedding/batched.js";
import { OpenAICompatibleEmbeddingProvider } from "./embedding/openaiCompatible.js";
import { KnowledgeIndexer } from "./indexing/indexer.js";
import { ChromaVectorStore } from "./storage/chroma.js";
import { SqliteStore } from "./storage/sqlite.js";
import { VectraVectorStore } from "./storage/vectra.js";
import type { IndexMode, IndexProgress } from "./types.js";

interface CliOptions {
  rootPath?: string;
  mode: IndexMode;
  estimateTotalChunks: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    mode: "incremental",
    estimateTotalChunks: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if ((token === "--root" || token === "-r") && argv[i + 1]) {
      options.rootPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--mode" && argv[i + 1]) {
      const value = argv[i + 1];
      if (value === "full" || value === "incremental") {
        options.mode = value;
      } else {
        throw new Error(`Invalid --mode value: ${value}. Expected 'full' or 'incremental'.`);
      }
      i += 1;
      continue;
    }
    if (token === "--no-total-chunks") {
      options.estimateTotalChunks = false;
      continue;
    }
    if (token === "--help" || token === "-h") {
      printHelpAndExit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

function printHelpAndExit(code: number): never {
  const lines = [
    "Manual index CLI",
    "",
    "Usage:",
    "  node dist/manualIndex.js [--root <path>] [--mode <incremental|full>] [--no-total-chunks]",
    "",
    "Options:",
    "  --root, -r          Override knowledge root path",
    "  --mode              incremental (default) or full",
    "  --no-total-chunks   Skip pre-counting all chunks before indexing",
    "  --help, -h          Show this help",
  ];
  console.error(lines.join("\n"));
  process.exit(code);
}

function formatChunkTotal(totalChunks: number | null): string {
  if (totalChunks === null) {
    return "?";
  }
  return String(totalChunks);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(process.cwd());
  const rootPath = path.resolve(args.rootPath ?? config.knowledgeBaseDir);

  const sqlite = new SqliteStore(config.sqlitePath);
  const rawEmbeddingProvider = new OpenAICompatibleEmbeddingProvider(
    config.embedding.baseUrl,
    config.embedding.apiKey,
    config.embedding.model,
    config.embedding.dimensions,
  );
  const embeddingProvider = new BatchedEmbeddingProvider(rawEmbeddingProvider, {
    maxBatchTexts: config.embedding.batchMaxTexts,
    maxConcurrency: config.embedding.batchConcurrency,
  });
  const vectorStore =
    config.vectorStore === "chroma"
      ? new ChromaVectorStore(config.chromaUrl, config.chromaCollection)
      : new VectraVectorStore(config.vectraPath);

  let latestProgress: IndexProgress = {
    processedFiles: 0,
    totalFiles: 0,
    processedChunks: 0,
    totalChunks: null,
    chunksPerSecond: 0,
    elapsedMs: 0,
    added: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };
  let hasProgress = false;
  let lastPrintedChunkCount = 0;
  let lastPrintedAtMs = Date.now();
  let stopped = false;
  const progressTimer = setInterval(() => {
    if (stopped || !hasProgress) {
      return;
    }
    const currentChunks = latestProgress.processedChunks;
    if (currentChunks <= lastPrintedChunkCount) {
      return;
    }
    const nowMs = Date.now();
    const elapsedSec = Math.max(0.001, (nowMs - lastPrintedAtMs) / 1000);
    const chunkRate = (currentChunks - lastPrintedChunkCount) / elapsedSec;
    lastPrintedChunkCount = currentChunks;
    lastPrintedAtMs = nowMs;
    const chunkTotal = formatChunkTotal(latestProgress.totalChunks);
    const totalElapsedSec = Math.round(latestProgress.elapsedMs / 1000);
    console.error(
      `[manual-index] ${chunkRate.toFixed(1)} chunk/s | chunks ${currentChunks}/${chunkTotal} | files ${latestProgress.processedFiles}/${latestProgress.totalFiles} | elapsed ${totalElapsedSec}s`,
    );
  }, 1000);

  try {
    console.error(`[manual-index] root=${rootPath}`);
    console.error(
      `[manual-index] mode=${args.mode} estimate_total_chunks=${args.estimateTotalChunks ? "on" : "off"}`,
    );
    if (args.estimateTotalChunks) {
      console.error("[manual-index] estimating total chunks before indexing...");
    }

    const indexer = new KnowledgeIndexer(sqlite, vectorStore, embeddingProvider, {
      ...config.chunking,
      fileConcurrency: config.indexing.fileConcurrency,
      estimateTotalChunks: args.estimateTotalChunks,
      onProgress: progress => {
        hasProgress = true;
        latestProgress = progress;
      },
    });

    const stats = await indexer.run(rootPath, args.mode);
    stopped = true;
    clearInterval(progressTimer);

    if (hasProgress) {
      const chunkTotal = formatChunkTotal(latestProgress.totalChunks);
      console.error(
        `[manual-index] done | chunks ${latestProgress.processedChunks}/${chunkTotal} | avg ${latestProgress.chunksPerSecond.toFixed(1)} chunk/s`,
      );
    }

    console.log(JSON.stringify(stats, null, 2));
  } finally {
    stopped = true;
    clearInterval(progressTimer);
    sqlite.close();
  }
}

main().catch(error => {
  console.error("[manual-index] failed:", error);
  process.exit(1);
});
