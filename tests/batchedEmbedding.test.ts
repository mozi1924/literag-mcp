import assert from "node:assert/strict";
import test from "node:test";
import { BatchedEmbeddingProvider } from "../src/embedding/batched.js";
import type { EmbeddingProvider } from "../src/types.js";

class RecordingEmbeddingProvider implements EmbeddingProvider {
  calls: string[][] = [];

  async embed(texts: string[]): Promise<number[][]> {
    this.calls.push([...texts]);
    await new Promise(resolve => setTimeout(resolve, 1));
    return texts.map((text, idx) => [text.length, idx]);
  }
}

test("batched embedding merges concurrent small requests", async () => {
  const inner = new RecordingEmbeddingProvider();
  const provider = new BatchedEmbeddingProvider(inner, {
    maxBatchTexts: 32,
    maxConcurrency: 1,
  });

  const [a, b, c] = await Promise.all([
    provider.embed(["a"]),
    provider.embed(["bb"]),
    provider.embed(["ccc"]),
  ]);

  assert.equal(inner.calls.length, 1);
  assert.deepEqual(inner.calls[0], ["a", "bb", "ccc"]);
  assert.deepEqual(a, [[1, 0]]);
  assert.deepEqual(b, [[2, 1]]);
  assert.deepEqual(c, [[3, 2]]);
});

test("batched embedding splits oversized queues by maxBatchTexts", async () => {
  const inner = new RecordingEmbeddingProvider();
  const provider = new BatchedEmbeddingProvider(inner, {
    maxBatchTexts: 2,
    maxConcurrency: 1,
  });

  const vectors = await provider.embed(["a", "bb", "ccc", "dddd", "eeeee"]);
  assert.equal(inner.calls.length, 3);
  assert.deepEqual(inner.calls[0], ["a", "bb"]);
  assert.deepEqual(inner.calls[1], ["ccc", "dddd"]);
  assert.deepEqual(inner.calls[2], ["eeeee"]);
  assert.equal(vectors.length, 5);
});
