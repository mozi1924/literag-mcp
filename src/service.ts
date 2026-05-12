import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { loadConfig } from "./config/index.js";
import { OpenAICompatibleEmbeddingProvider } from "./embedding/openaiCompatible.js";
import { KnowledgeIndexer } from "./indexing/indexer.js";
import { HybridRetriever } from "./retrieval/hybrid.js";
import { ChromaVectorStore } from "./storage/chroma.js";
import { SqliteStore } from "./storage/sqlite.js";
import type { AppConfig, IndexMode, IndexStats, SearchResponse } from "./types.js";
import { clamp } from "./utils/text.js";

interface WatchState {
  rootPath: string;
  watcher: FSWatcher;
}

export class KnowledgeBaseService {
  private readonly config: AppConfig;
  private readonly sqlite: SqliteStore;
  private readonly indexer: KnowledgeIndexer;
  private readonly retriever: HybridRetriever;
  private watchState: WatchState | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(cwd = process.cwd()) {
    this.config = loadConfig(cwd);
    this.sqlite = new SqliteStore(this.config.sqlitePath);

    const embeddingProvider = new OpenAICompatibleEmbeddingProvider(
      this.config.embedding.baseUrl,
      this.config.embedding.apiKey,
      this.config.embedding.model,
      this.config.embedding.dimensions,
    );
    const vectorStore = new ChromaVectorStore(this.config.chromaUrl, this.config.chromaCollection);

    this.indexer = new KnowledgeIndexer(
      this.sqlite,
      vectorStore,
      embeddingProvider,
      this.config.chunking,
    );
    this.retriever = new HybridRetriever(embeddingProvider, vectorStore, this.sqlite);
  }

  async close(): Promise<void> {
    if (this.watchState) {
      await this.watchState.watcher.close();
      this.watchState = null;
    }
    this.sqlite.close();
  }

  async indexKnowledgeBase(args: {
    rootPath: string;
    mode: IndexMode;
    watch: boolean;
  }): Promise<IndexStats> {
    const rootPath = path.resolve(args.rootPath);
    const stats = await this.indexer.run(rootPath, args.mode);

    if (args.watch) {
      await this.startWatch(rootPath);
      stats.watchStarted = true;
    } else {
      await this.stopWatch(rootPath);
      stats.watchStarted = false;
    }

    return stats;
  }

  async search(args: {
    query: string;
    topK?: number;
    alpha?: number;
    pathPrefix?: string;
    fileGlob?: string;
  }): Promise<SearchResponse> {
    const topK = clamp(Math.floor(args.topK ?? this.config.defaultTopK), 1, 50);
    const alpha = clamp(args.alpha ?? this.config.defaultSearchAlpha, 0, 1);

    return this.retriever.search({
      query: args.query,
      topK,
      alpha,
      pathPrefix: args.pathPrefix,
      fileGlob: args.fileGlob,
    });
  }

  getDocument(args: {
    relPath: string;
    startLine?: number;
    endLine?: number;
  }): {
    rel_path: string;
    abs_path: string;
    total_lines: number;
    mtime_ms: number;
    start_line: number;
    end_line: number;
    content: string;
  } {
    const record = this.sqlite.getDocument(args.relPath);
    if (!record) {
      throw new Error(`Document not found: ${args.relPath}`);
    }

    const lines = record.content.replace(/\r\n/g, "\n").split("\n");
    const startLine = clamp(Math.floor(args.startLine ?? 1), 1, Math.max(1, lines.length));
    const endLine = clamp(
      Math.floor(args.endLine ?? lines.length),
      startLine,
      Math.max(startLine, lines.length),
    );

    return {
      rel_path: record.relPath,
      abs_path: record.absPath,
      total_lines: record.lineCount,
      mtime_ms: record.mtimeMs,
      start_line: startLine,
      end_line: endLine,
      content: lines.slice(startLine - 1, endLine).join("\n"),
    };
  }

  private async startWatch(rootPath: string): Promise<void> {
    if (this.watchState && this.watchState.rootPath === rootPath) {
      return;
    }
    if (this.watchState) {
      await this.watchState.watcher.close();
      this.watchState = null;
    }

    const pattern = `${rootPath.replace(/\\/g, "/")}/**/*.{md,mdx}`;
    const watcher = chokidar.watch(pattern, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 50,
      },
    });

    const enqueue = (fn: () => Promise<void>) => {
      this.queue = this.queue
        .then(fn)
        .catch(error => {
          console.error("watch update failed:", error);
        });
    };

    watcher.on("add", filePath => {
      enqueue(async () => {
        await this.indexer.indexOne(rootPath, path.resolve(filePath));
      });
    });
    watcher.on("change", filePath => {
      enqueue(async () => {
        await this.indexer.indexOne(rootPath, path.resolve(filePath));
      });
    });
    watcher.on("unlink", filePath => {
      enqueue(async () => {
        await this.indexer.removeOne(rootPath, path.resolve(filePath));
      });
    });

    this.watchState = {
      rootPath,
      watcher,
    };
  }

  private async stopWatch(_rootPath: string): Promise<void> {
    if (!this.watchState) {
      return;
    }
    await this.watchState.watcher.close();
    this.watchState = null;
  }
}
