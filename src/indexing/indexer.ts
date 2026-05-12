import fs from "node:fs/promises";
import path from "node:path";
import { MarkdownChunker, countLines } from "./markdownChunker.js";
import type {
  ChunkRecord,
  DocumentRecord,
  EmbeddingProvider,
  IndexMode,
  IndexStats,
  MarkdownChunk,
  VectorStore,
} from "../types.js";
import { collectMarkdownFiles, toPosixRelative } from "../utils/fs.js";
import { sha256 } from "../utils/hash.js";
import type { SqliteStore } from "../storage/sqlite.js";

export class KnowledgeIndexer {
  private readonly chunker: MarkdownChunker;
  private readonly fileConcurrency: number;

  constructor(
    private readonly sqlite: SqliteStore,
    private readonly vectorStore: VectorStore,
    private readonly embedding: EmbeddingProvider,
    options: {
      targetTokens: number;
      overlapTokens: number;
      fileConcurrency?: number;
    },
  ) {
    this.chunker = new MarkdownChunker(options);
    this.fileConcurrency = Math.max(1, Math.floor(options.fileConcurrency ?? 1));
  }

  async run(rootPath: string, mode: IndexMode): Promise<IndexStats> {
    const start = Date.now();
    const stats: IndexStats = {
      mode,
      rootPath,
      added: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      chunkCount: 0,
      durationMs: 0,
      watchStarted: false,
      errors: [],
    };

    const absRoot = path.resolve(rootPath);
    const markdownFiles = await collectMarkdownFiles(absRoot);

    const existingDocPaths = new Set(this.sqlite.listDocumentPaths());
    const seenRelPaths = new Set<string>();

    const processFile = async (absPath: string) => {
      const relPath = toPosixRelative(absRoot, absPath);
      seenRelPaths.add(relPath);

      try {
        const status = await this.upsertFile(absRoot, absPath, mode === "full");
        if (status === "added") {
          stats.added += 1;
        } else if (status === "updated") {
          stats.updated += 1;
        } else {
          stats.skipped += 1;
        }
      } catch (error) {
        stats.errors.push(`${relPath}: ${String(error)}`);
      }
    };

    if (this.fileConcurrency <= 1 || markdownFiles.length <= 1) {
      for (const absPath of markdownFiles) {
        await processFile(absPath);
      }
    } else {
      let cursor = 0;
      const workerCount = Math.min(this.fileConcurrency, markdownFiles.length);
      const workers = Array.from({ length: workerCount }, async () => {
        while (true) {
          const current = cursor;
          cursor += 1;
          if (current >= markdownFiles.length) {
            break;
          }
          await processFile(markdownFiles[current]);
        }
      });
      await Promise.all(workers);
    }

    for (const relPath of existingDocPaths) {
      if (seenRelPaths.has(relPath)) {
        continue;
      }
      try {
        const chunkIds = this.sqlite.getChunkIdsByRelPath(relPath);
        this.sqlite.deleteDocument(relPath);
        await this.vectorStore.deleteChunks(chunkIds);
        stats.deleted += 1;
      } catch (error) {
        stats.errors.push(`${relPath}: ${String(error)}`);
      }
    }

    stats.chunkCount = this.sqlite.listDocumentPaths().reduce((sum, relPath) => {
      return sum + this.sqlite.getChunkIdsByRelPath(relPath).length;
    }, 0);
    stats.durationMs = Date.now() - start;
    return stats;
  }

  async indexOne(rootPath: string, absPath: string): Promise<"added" | "updated" | "skipped"> {
    return this.upsertFile(path.resolve(rootPath), absPath, false);
  }

  async removeOne(rootPath: string, absPath: string): Promise<boolean> {
    const relPath = toPosixRelative(path.resolve(rootPath), path.resolve(absPath));
    const chunkIds = this.sqlite.getChunkIdsByRelPath(relPath);
    if (chunkIds.length === 0 && !this.sqlite.getDocument(relPath)) {
      return false;
    }
    this.sqlite.deleteDocument(relPath);
    await this.vectorStore.deleteChunks(chunkIds);
    return true;
  }

  private async upsertFile(
    rootPath: string,
    absPath: string,
    forceReindex: boolean,
  ): Promise<"added" | "updated" | "skipped"> {
    const resolvedPath = path.resolve(absPath);
    const relPath = toPosixRelative(rootPath, resolvedPath);

    const [content, stat] = await Promise.all([
      fs.readFile(resolvedPath, "utf8"),
      fs.stat(resolvedPath),
    ]);

    const hash = sha256(content);
    const existing = this.sqlite.getDocument(relPath);

    if (!forceReindex && existing && existing.contentHash === hash) {
      return "skipped";
    }

    const chunks = this.chunker.chunkDocument(relPath, content);
    const embeddings = await this.embedding.embed(chunks.map(chunk => chunk.text));

    const oldChunkIds = this.sqlite.getChunkIdsByRelPath(relPath);
    if (oldChunkIds.length > 0) {
      await this.vectorStore.deleteChunks(oldChunkIds);
    }

    await this.vectorStore.upsertChunks(chunks, embeddings);

    const document: DocumentRecord = {
      relPath,
      absPath: resolvedPath,
      content,
      lineCount: countLines(content),
      mtimeMs: stat.mtimeMs,
      contentHash: hash,
    };

    const chunkRecords: ChunkRecord[] = chunks.map((chunk: MarkdownChunk) => ({
      ...chunk,
      contentHash: hash,
    }));

    this.sqlite.upsertDocumentWithChunks(document, chunkRecords);

    if (!existing) {
      return "added";
    }
    return "updated";
  }
}
