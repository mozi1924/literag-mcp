import { ChromaClient } from "chromadb";
import type { MarkdownChunk, VectorSearchResult, VectorStore } from "../types.js";

export class ChromaVectorStore implements VectorStore {
  private readonly client: ChromaClient;
  private collectionPromise?: ReturnType<ChromaClient["getOrCreateCollection"]>;

  constructor(
    private readonly baseUrl: string,
    private readonly collectionName: string,
  ) {
    this.client = new ChromaClient({ path: baseUrl });
  }

  private async getCollection() {
    if (!this.collectionPromise) {
      this.collectionPromise = this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { purpose: "literag-markdown-kb" },
      });
    }
    return this.collectionPromise;
  }

  async upsertChunks(chunks: MarkdownChunk[], embeddings: number[][]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }
    const collection = await this.getCollection();
    await collection.upsert({
      ids: chunks.map(chunk => chunk.chunkId),
      embeddings,
      documents: chunks.map(chunk => chunk.text),
      metadatas: chunks.map(chunk => ({
        rel_path: chunk.relPath,
        start_line: chunk.startLine,
        end_line: chunk.endLine,
        heading_path: chunk.headingPath,
      })) as Array<Record<string, string | number>>,
    });
  }

  async deleteChunks(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) {
      return;
    }
    const collection = await this.getCollection();
    await collection.delete({ ids: chunkIds });
  }

  async query(embedding: number[], topK: number): Promise<VectorSearchResult[]> {
    const collection = await this.getCollection();
    const result = await collection.query({
      queryEmbeddings: [embedding],
      nResults: topK,
      include: ["metadatas", "documents", "distances"],
    });

    const ids = result.ids[0] ?? [];
    const distances = result.distances[0] ?? [];
    const documents = result.documents[0] ?? [];
    const metadatas = (result.metadatas[0] ?? []) as Array<Record<string, unknown> | null>;

    return ids.map((chunkId, idx) => {
      const meta = metadatas[idx] ?? {};
      return {
        chunkId,
        relPath: String(meta.rel_path ?? ""),
        startLine: Number(meta.start_line ?? 1),
        endLine: Number(meta.end_line ?? 1),
        headingPath: String(meta.heading_path ?? ""),
        text: String(documents[idx] ?? ""),
        distance: Number(distances[idx] ?? 1),
      };
    });
  }
}
