import { LocalIndex } from "vectra";
import type { MarkdownChunk, VectorSearchResult, VectorStore } from "../types.js";

interface VectraChunkMetadata {
  [key: string]: string | number | boolean;
  rel_path: string;
  start_line: number;
  end_line: number;
  heading_path: string;
  text: string;
}

export class VectraVectorStore implements VectorStore {
  private readonly index: LocalIndex<VectraChunkMetadata>;
  private ensureIndexPromise: Promise<void> | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(indexPath: string) {
    this.index = new LocalIndex<VectraChunkMetadata>(indexPath);
  }

  async upsertChunks(chunks: MarkdownChunk[], embeddings: number[][]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }
    await this.runMutation(async () => {
      await this.index.beginUpdate();
      try {
        for (let i = 0; i < chunks.length; i += 1) {
          const chunk = chunks[i];
          const vector = embeddings[i];
          if (!vector) {
            throw new Error(`Missing embedding for chunk: ${chunk.chunkId}`);
          }
          await this.index.upsertItem({
            id: chunk.chunkId,
            vector,
            metadata: {
              rel_path: chunk.relPath,
              start_line: chunk.startLine,
              end_line: chunk.endLine,
              heading_path: chunk.headingPath,
              text: chunk.text,
            },
          });
        }
        await this.index.endUpdate();
      } catch (error) {
        this.index.cancelUpdate();
        throw error;
      }
    });
  }

  async deleteChunks(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) {
      return;
    }
    await this.runMutation(async () => {
      await this.index.beginUpdate();
      try {
        for (const chunkId of chunkIds) {
          await this.index.deleteItem(chunkId);
        }
        await this.index.endUpdate();
      } catch (error) {
        this.index.cancelUpdate();
        throw error;
      }
    });
  }

  async query(embedding: number[], topK: number): Promise<VectorSearchResult[]> {
    await this.ensureIndex();
    const results = await this.index.queryItems(embedding, "", topK);
    return results.map(result => {
      const metadata = result.item.metadata;
      const similarity = Number.isFinite(result.score) ? result.score : -1;
      const distance = Math.max(0, 1 - similarity);
      return {
        chunkId: result.item.id,
        relPath: String(metadata.rel_path ?? ""),
        startLine: Number(metadata.start_line ?? 1),
        endLine: Number(metadata.end_line ?? 1),
        headingPath: String(metadata.heading_path ?? ""),
        text: String(metadata.text ?? ""),
        distance,
      };
    });
  }

  private async ensureIndex(): Promise<void> {
    if (!this.ensureIndexPromise) {
      this.ensureIndexPromise = (async () => {
        if (!await this.index.isIndexCreated()) {
          await this.index.createIndex({ version: 1 });
        }
      })().catch(error => {
        this.ensureIndexPromise = null;
        throw error;
      });
    }
    await this.ensureIndexPromise;
  }

  private async runMutation<T>(task: () => Promise<T>): Promise<T> {
    await this.ensureIndex();
    const run = this.mutationQueue.then(task, task);
    this.mutationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
