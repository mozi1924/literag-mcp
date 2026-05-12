import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AppConfig } from "../types.js";

const FileConfigSchema = z.object({
  chromaUrl: z.string().optional(),
  chromaCollection: z.string().optional(),
  sqlitePath: z.string().optional(),
  defaultSearchAlpha: z.number().min(0).max(1).optional(),
  defaultTopK: z.number().int().min(1).max(100).optional(),
  chunking: z
    .object({
      targetTokens: z.number().int().min(128).optional(),
      overlapTokens: z.number().int().min(0).optional(),
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

  const sqlitePath =
    process.env.SQLITE_PATH ?? fileConfig.sqlitePath ?? path.join(cwd, ".literag", "kb.sqlite");

  return {
    chromaUrl: process.env.CHROMA_URL ?? fileConfig.chromaUrl ?? "http://127.0.0.1:8000",
    chromaCollection:
      process.env.CHROMA_COLLECTION ?? fileConfig.chromaCollection ?? "literag_markdown_kb",
    sqlitePath,
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
