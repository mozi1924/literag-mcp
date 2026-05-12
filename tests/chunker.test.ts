import test from "node:test";
import assert from "node:assert/strict";
import { MarkdownChunker } from "../src/indexing/markdownChunker.js";

test("markdown chunker keeps fenced code block atomic and carries line ranges", () => {
  const source = `# Intro

Paragraph one.

\`\`\`ts
const a = 1;
const b = 2;
\`\`\`

## Details
Another paragraph here.`;

  const chunker = new MarkdownChunker({
    targetTokens: 20,
    overlapTokens: 8,
  });

  const chunks = chunker.chunkDocument("docs/sample.md", source);
  assert.ok(chunks.length >= 2);

  const codeChunk = chunks.find(chunk => chunk.text.includes("const a = 1"));
  assert.ok(codeChunk);
  assert.match(codeChunk!.text, /```ts[\s\S]*```/);
  assert.equal(codeChunk!.startLine <= 5, true);
  assert.equal(codeChunk!.endLine >= 8, true);
});
