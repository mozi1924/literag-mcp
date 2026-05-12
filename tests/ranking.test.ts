import test from "node:test";
import assert from "node:assert/strict";
import { rankHybrid } from "../src/retrieval/scoring.js";

test("hybrid ranking boosts keyword matches when alpha favors keyword score", () => {
  const ranked = rankHybrid(
    [
      { chunkId: "a", distance: 0.2, vectorRaw: 0.8, keywordRaw: undefined },
      { chunkId: "b", distance: 0.21, vectorRaw: 0.79, keywordRaw: 0.1 },
    ],
    0.3,
  );

  assert.equal(ranked[0].chunkId, "b");
  assert.ok(ranked[0].finalScore >= ranked[1].finalScore);
});
