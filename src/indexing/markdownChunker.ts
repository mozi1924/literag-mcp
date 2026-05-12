import type { ChunkingOptions, MarkdownChunk } from "../types.js";
import { estimateTokens } from "../utils/text.js";

interface Block {
  text: string;
  startLine: number;
  endLine: number;
  headingPath: string;
  tokens: number;
}

function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").split("\n");
}

function parseBlocks(content: string): Block[] {
  const lines = splitLines(content);
  const blocks: Block[] = [];

  let i = 0;
  let inCodeFence = false;
  let fenceMarker = "";
  const headingStack: Array<{ level: number; text: string }> = [];

  const currentHeadingPath = () => headingStack.map(h => h.text).join(" > ");

  while (i < lines.length) {
    const line = lines[i];
    const lineNum = i + 1;

    const fenceMatch = line.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const start = i;
      if (!inCodeFence) {
        inCodeFence = true;
        fenceMarker = marker;
      }
      i += 1;
      while (i < lines.length) {
        const closing = lines[i];
        if (closing.startsWith(fenceMarker.repeat(3))) {
          i += 1;
          break;
        }
        i += 1;
      }
      const end = i;
      const text = lines.slice(start, end).join("\n");
      blocks.push({
        text,
        startLine: start + 1,
        endLine: end,
        headingPath: currentHeadingPath(),
        tokens: estimateTokens(text),
      });
      inCodeFence = false;
      fenceMarker = "";
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text });
      blocks.push({
        text: line,
        startLine: lineNum,
        endLine: lineNum,
        headingPath: currentHeadingPath(),
        tokens: estimateTokens(line),
      });
      i += 1;
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const start = i;
    i += 1;
    while (i < lines.length) {
      const nextLine = lines[i];
      if (!nextLine.trim()) {
        break;
      }
      if (/^(#{1,6})\s+/.test(nextLine)) {
        break;
      }
      if (/^(```+|~~~+)/.test(nextLine)) {
        break;
      }
      i += 1;
    }

    const end = i;
    const text = lines.slice(start, end).join("\n");
    blocks.push({
      text,
      startLine: start + 1,
      endLine: end,
      headingPath: currentHeadingPath(),
      tokens: estimateTokens(text),
    });
  }

  return blocks;
}

function toLineOffsets(content: string): number[] {
  const lines = splitLines(content);
  const offsets: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    offsets.push(cursor);
    cursor += line.length + 1;
  }
  offsets.push(content.length);
  return offsets;
}

function sliceByLines(content: string, startLine: number, endLine: number): string {
  const lines = splitLines(content);
  const start = Math.max(1, startLine);
  const end = Math.min(lines.length, endLine);
  return lines.slice(start - 1, end).join("\n");
}

export class MarkdownChunker {
  constructor(private readonly options: ChunkingOptions) {}

  chunkDocument(relPath: string, content: string): MarkdownChunk[] {
    const blocks = parseBlocks(content);
    if (blocks.length === 0) {
      return [];
    }

    const chunks: MarkdownChunk[] = [];
    const overlapTokens = this.options.overlapTokens;
    let chunkIndex = 0;

    let i = 0;
    while (i < blocks.length) {
      const startBlock = blocks[i];
      const selected: Block[] = [];
      let tokenSum = 0;
      let j = i;

      while (j < blocks.length) {
        const next = blocks[j];
        if (selected.length > 0 && tokenSum + next.tokens > this.options.targetTokens) {
          break;
        }
        selected.push(next);
        tokenSum += next.tokens;
        j += 1;
      }

      const chunkStartLine = selected[0].startLine;
      const chunkEndLine = selected[selected.length - 1].endLine;
      const text = sliceByLines(content, chunkStartLine, chunkEndLine).trim();

      chunks.push({
        chunkId: `${relPath}::${chunkIndex}`,
        relPath,
        chunkIndex,
        text,
        headingPath: startBlock.headingPath,
        startLine: chunkStartLine,
        endLine: chunkEndLine,
      });
      chunkIndex += 1;

      if (j >= blocks.length) {
        break;
      }

      if (overlapTokens <= 0) {
        i = j;
        continue;
      }

      let rewind = j - 1;
      let overlap = 0;
      while (rewind >= i) {
        overlap += blocks[rewind].tokens;
        if (overlap >= overlapTokens) {
          break;
        }
        rewind -= 1;
      }
      i = Math.max(rewind, i + 1);
      if (i >= j) {
        i = j;
      }
    }

    return chunks;
  }
}

export function countLines(content: string): number {
  if (!content) {
    return 0;
  }
  return splitLines(content).length;
}
