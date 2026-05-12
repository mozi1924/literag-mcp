import type { EmbeddingProvider, MarkdownChunk, VectorSearchResult, VectorStore } from "../src/types.js";

function hashVector(text: string): number[] {
  const vec = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < text.length; i += 1) {
    vec[i % vec.length] += text.charCodeAt(i);
  }
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vec.map(value => value / norm);
}

function cosineDistance(a: number[], b: number[]): number {
  const dot = a.reduce((sum, value, idx) => sum + value * (b[idx] ?? 0), 0);
  return 1 - dot;
}

export class FakeEmbeddingProvider implements EmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(hashVector);
  }
}

export class InMemoryVectorStore implements VectorStore {
  private readonly records = new Map<
    string,
    {
      chunk: MarkdownChunk;
      embedding: number[];
    }
  >();

  async upsertChunks(chunks: MarkdownChunk[], embeddings: number[][]): Promise<void> {
    chunks.forEach((chunk, index) => {
      this.records.set(chunk.chunkId, {
        chunk,
        embedding: embeddings[index],
      });
    });
  }

  async deleteChunks(chunkIds: string[]): Promise<void> {
    chunkIds.forEach(id => this.records.delete(id));
  }

  async query(embedding: number[], topK: number): Promise<VectorSearchResult[]> {
    const rows = Array.from(this.records.values()).map(({ chunk, embedding: itemEmbedding }) => ({
      chunkId: chunk.chunkId,
      relPath: chunk.relPath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      headingPath: chunk.headingPath,
      text: chunk.text,
      distance: cosineDistance(embedding, itemEmbedding),
    }));

    rows.sort((a, b) => a.distance - b.distance);
    return rows.slice(0, topK);
  }
}
