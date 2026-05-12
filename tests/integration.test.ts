import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { KnowledgeIndexer } from "../src/indexing/indexer.js";
import { HybridRetriever } from "../src/retrieval/hybrid.js";
import { SqliteStore } from "../src/storage/sqlite.js";
import { FakeEmbeddingProvider, InMemoryVectorStore } from "./helpers.js";

test("index -> search -> get document flow works with metadata and line ranges", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "literag-int-"));
  const docsRoot = path.join(tmpRoot, "docs");
  await fs.mkdir(docsRoot, { recursive: true });

  const mdPath = path.join(docsRoot, "guide.md");
  await fs.writeFile(
    mdPath,
    `# Quick Start

Use this guide to install the package.

\`\`\`bash
npm install sample
\`\`\`

Troubleshooting section.`,
    "utf8",
  );

  const sqlite = new SqliteStore(path.join(tmpRoot, "kb.sqlite"));
  const embedding = new FakeEmbeddingProvider();
  const vectorStore = new InMemoryVectorStore();

  const indexer = new KnowledgeIndexer(sqlite, vectorStore, embedding, {
    targetTokens: 50,
    overlapTokens: 12,
  });
  const retriever = new HybridRetriever(embedding, vectorStore, sqlite);

  const stats = await indexer.run(docsRoot, "full");
  assert.equal(stats.added, 1);
  assert.equal(stats.errors.length, 0);

  const search = await retriever.search({
    query: "install package",
    topK: 3,
    alpha: 0.7,
  });
  assert.ok(search.results.length >= 1);
  assert.equal(search.results[0].rel_path, "guide.md");
  assert.ok(search.results[0].start_line >= 1);

  const searchWithPunctuation = await retriever.search({
    query: "install package?",
    topK: 3,
    alpha: 0.7,
  });
  assert.ok(searchWithPunctuation.results.length >= 1);

  const doc = sqlite.getDocument("guide.md");
  assert.ok(doc);
  assert.equal(doc!.lineCount > 0, true);

  const sliced = doc!.content.split("\n").slice(1, 4).join("\n");
  assert.match(sliced, /install/i);

  await fs.writeFile(
    mdPath,
    `# Quick Start

Updated installation text.
`,
    "utf8",
  );

  const updateResult = await indexer.indexOne(docsRoot, mdPath);
  assert.equal(updateResult, "updated");

  const removed = await indexer.removeOne(docsRoot, mdPath);
  assert.equal(removed, true);
  assert.equal(sqlite.getDocument("guide.md"), null);

  sqlite.close();
});
