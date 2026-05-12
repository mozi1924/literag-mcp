import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AppConfig } from "../types.js";

const FileConfigSchema = z.object({
  vectorStore: z.enum(["vectra", "chroma"]).optional(),
  vectraPath: z.string().optional(),
  chromaUrl: z.string().optional(),
  chromaCollection: z.string().optional(),
  sqlitePath: z.string().optional(),
  knowledgeBaseDir: z.string().optional(),
  toolPrefix: z.string().optional(),
  serverName: z.string().optional(),
  transport: z.enum(["stdio", "streamable-http"]).optional(),
  httpHost: z.string().optional(),
  httpPort: z.number().int().positive().optional(),
  httpPath: z.string().optional(),
  defaultSearchAlpha: z.number().min(0).max(1).optional(),
  defaultTopK: z.number().int().min(1).max(100).optional(),
  chunking: z
    .object({
      targetTokens: z.number().int().min(128).optional(),
      overlapTokens: z.number().int().min(0).optional(),
    })
    .optional(),
  indexing: z
    .object({
      fileConcurrency: z.number().int().min(1).max(32).optional(),
    })
    .optional(),
  embedding: z
    .object({
      baseUrl: z.string().optional(),
      apiKey: z.string().optional(),
      model: z.string().optional(),
      dimensions: z.number().int().positive().optional(),
    })
    .optional(),
});

function readJsonConfig(configPath: string): z.infer<typeof FileConfigSchema> {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return FileConfigSchema.parse(parsed);
}

function normalizeToolPrefix(prefix: string): string {
  const clean = prefix.trim().replace(/[^a-zA-Z0-9_]/g, "_");
  if (!clean) {
    return "kb";
  }
  return clean;
}

function normalizeHttpPath(value: string): string {
  const pathValue = value.trim() || "/mcp";
  return pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
}

export function loadConfig(cwd = process.cwd()): AppConfig {
  const configPath = process.env.LITERAG_CONFIG_PATH ?? path.join(cwd, "config.json");
  const fileConfig = readJsonConfig(configPath);

  const embeddingBaseUrl =
    process.env.EMBEDDING_BASE_URL ?? fileConfig.embedding?.baseUrl ?? "";
  const embeddingApiKey = process.env.EMBEDDING_API_KEY ?? fileConfig.embedding?.apiKey ?? "";
  const embeddingModel = process.env.EMBEDDING_MODEL ?? fileConfig.embedding?.model ?? "";

  if (!embeddingBaseUrl) {
    throw new Error("Missing embedding base URL. Set EMBEDDING_BASE_URL or config.embedding.baseUrl");
  }
  if (!embeddingApiKey) {
    throw new Error("Missing embedding API key. Set EMBEDDING_API_KEY or config.embedding.apiKey");
  }
  if (!embeddingModel) {
    throw new Error("Missing embedding model. Set EMBEDDING_MODEL or config.embedding.model");
  }

  const toolPrefix = normalizeToolPrefix(
    process.env.KB_TOOL_PREFIX ?? fileConfig.toolPrefix ?? "kb",
  );

  const sqlitePath =
    process.env.SQLITE_PATH ?? fileConfig.sqlitePath ?? path.join(cwd, ".literag", "kb.sqlite");

  const knowledgeBaseDir = path.resolve(
    process.env.KB_DOCUMENT_ROOT ?? fileConfig.knowledgeBaseDir ?? path.join(cwd, "document"),
  );

  const transport =
    (process.env.MCP_TRANSPORT as AppConfig["transport"] | undefined) ??
    fileConfig.transport ??
    "stdio";

  const vectorStore =
    (process.env.VECTOR_STORE as AppConfig["vectorStore"] | undefined) ??
    fileConfig.vectorStore ??
    "vectra";
  if (vectorStore !== "vectra" && vectorStore !== "chroma") {
    throw new Error("Invalid vector store. Set VECTOR_STORE to 'vectra' or 'chroma'");
  }
  const fileConcurrencyRaw = Number(
    process.env.INDEX_FILE_CONCURRENCY ?? fileConfig.indexing?.fileConcurrency ?? 4,
  );
  const fileConcurrency = Number.isFinite(fileConcurrencyRaw)
    ? Math.max(1, Math.min(32, Math.floor(fileConcurrencyRaw)))
    : 4;

  return {
    vectorStore,
    vectraPath: path.resolve(
      cwd,
      process.env.VECTRA_PATH ?? fileConfig.vectraPath ?? path.join(".literag", "vectra"),
    ),
    chromaUrl: process.env.CHROMA_URL ?? fileConfig.chromaUrl ?? "http://127.0.0.1:8000",
    chromaCollection:
      process.env.CHROMA_COLLECTION ?? fileConfig.chromaCollection ?? "literag_markdown_kb",
    sqlitePath,
    knowledgeBaseDir,
    toolPrefix,
    serverName:
      process.env.MCP_SERVER_NAME ?? fileConfig.serverName ?? `${toolPrefix}-markdown-kb`,
    transport,
    httpHost: process.env.MCP_HTTP_HOST ?? fileConfig.httpHost ?? "127.0.0.1",
    httpPort: Number(process.env.MCP_HTTP_PORT ?? fileConfig.httpPort ?? 8787),
    httpPath: normalizeHttpPath(process.env.MCP_HTTP_PATH ?? fileConfig.httpPath ?? "/mcp"),
    defaultSearchAlpha:
      Number(process.env.SEARCH_ALPHA ?? fileConfig.defaultSearchAlpha ?? 0.7),
    defaultTopK: Number(process.env.SEARCH_TOP_K ?? fileConfig.defaultTopK ?? 8),
    chunking: {
      targetTokens: Number(
        process.env.CHUNK_TARGET_TOKENS ?? fileConfig.chunking?.targetTokens ?? 1000,
      ),
      overlapTokens: Number(
        process.env.CHUNK_OVERLAP_TOKENS ?? fileConfig.chunking?.overlapTokens ?? 120,
      ),
    },
    indexing: {
      fileConcurrency,
    },
    embedding: {
      baseUrl: embeddingBaseUrl,
      apiKey: embeddingApiKey,
      model: embeddingModel,
      dimensions: Number(
        process.env.EMBEDDING_DIMENSIONS ?? fileConfig.embedding?.dimensions ?? 0,
      ) || undefined,
    },
  };
}
