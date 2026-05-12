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
          batchMaxTexts: 10,
          batchConcurrency: 1,
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
  process.env.EMBEDDING_BATCH_MAX_TEXTS = "99";
  process.env.EMBEDDING_BATCH_CONCURRENCY = "3";

  const config = loadConfig(tempRoot);
  assert.equal(config.vectorStore, "vectra");
  assert.equal(config.vectraPath, path.resolve(tempRoot, "env-vectra"));
  assert.equal(config.indexing.fileConcurrency, 7);
  assert.equal(config.embedding.baseUrl, "https://env.example/v1");
  assert.equal(config.embedding.apiKey, "env-key");
  assert.equal(config.embedding.model, "env-model");
  assert.equal(config.embedding.batchMaxTexts, 99);
  assert.equal(config.embedding.batchConcurrency, 3);

  delete process.env.LITERAG_CONFIG_PATH;
  delete process.env.EMBEDDING_BASE_URL;
  delete process.env.EMBEDDING_API_KEY;
  delete process.env.EMBEDDING_MODEL;
  delete process.env.VECTOR_STORE;
  delete process.env.VECTRA_PATH;
  delete process.env.INDEX_FILE_CONCURRENCY;
  delete process.env.EMBEDDING_BATCH_MAX_TEXTS;
  delete process.env.EMBEDDING_BATCH_CONCURRENCY;
});

test("LITERAG_WORKSPACE_ROOT pins default paths independent of process cwd", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "literag-workspace-root-"));
  const fakeCwd = await fs.mkdtemp(path.join(os.tmpdir(), "literag-fake-cwd-"));

  await fs.writeFile(
    path.join(workspaceRoot, "config.json"),
    JSON.stringify(
      {
        vectorStore: "vectra",
      },
      null,
      2,
    ),
  );

  process.env.LITERAG_WORKSPACE_ROOT = workspaceRoot;
  process.env.EMBEDDING_BASE_URL = "https://env.example/v1";
  process.env.EMBEDDING_API_KEY = "env-key";
  process.env.EMBEDDING_MODEL = "env-model";

  const config = loadConfig(fakeCwd);
  assert.equal(config.workspaceRoot, workspaceRoot);
  assert.equal(config.vectraPath, path.resolve(workspaceRoot, ".literag", "vectra"));
  assert.equal(config.sqlitePath, path.resolve(workspaceRoot, ".literag", "kb.sqlite"));
  assert.equal(config.knowledgeBaseDir, path.resolve(workspaceRoot, "document"));

  delete process.env.LITERAG_WORKSPACE_ROOT;
  delete process.env.EMBEDDING_BASE_URL;
  delete process.env.EMBEDDING_API_KEY;
  delete process.env.EMBEDDING_MODEL;
});

test("config.workspaceRoot must be absolute", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "literag-config-root-"));
  const configPath = path.join(tempRoot, "config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        workspaceRoot: "./relative-not-allowed",
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
  assert.throws(
    () => loadConfig(tempRoot),
    /config\.workspaceRoot must be an absolute path/,
  );
  delete process.env.LITERAG_CONFIG_PATH;
});
