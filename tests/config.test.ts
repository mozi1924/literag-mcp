import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config/index.js";

test("environment variables override config file values", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "literag-config-"));
  const configPath = path.join(tempRoot, "config.json");

  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        vectorStore: "chroma",
        vectraPath: "./file-vectra",
        indexing: {
          fileConcurrency: 2,
        },
        embedding: {
          baseUrl: "https://file.example/v1",
          apiKey: "file-key",
          model: "file-model",
        },
      },
      null,
      2,
    ),
  );

  process.env.LITERAG_CONFIG_PATH = configPath;
  process.env.EMBEDDING_BASE_URL = "https://env.example/v1";
  process.env.EMBEDDING_API_KEY = "env-key";
  process.env.EMBEDDING_MODEL = "env-model";
  process.env.VECTOR_STORE = "vectra";
  process.env.VECTRA_PATH = "./env-vectra";
  process.env.INDEX_FILE_CONCURRENCY = "7";

  const config = loadConfig(tempRoot);
  assert.equal(config.vectorStore, "vectra");
  assert.equal(config.vectraPath, path.resolve(tempRoot, "env-vectra"));
  assert.equal(config.indexing.fileConcurrency, 7);
  assert.equal(config.embedding.baseUrl, "https://env.example/v1");
  assert.equal(config.embedding.apiKey, "env-key");
  assert.equal(config.embedding.model, "env-model");

  delete process.env.LITERAG_CONFIG_PATH;
  delete process.env.EMBEDDING_BASE_URL;
  delete process.env.EMBEDDING_API_KEY;
  delete process.env.EMBEDDING_MODEL;
  delete process.env.VECTOR_STORE;
  delete process.env.VECTRA_PATH;
  delete process.env.INDEX_FILE_CONCURRENCY;
});
