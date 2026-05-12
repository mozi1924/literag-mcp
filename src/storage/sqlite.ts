import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ChunkRecord, DocumentRecord } from "../types.js";

export interface ChunkSearchRow {
  chunkId: string;
  keywordRawScore: number;
}

export interface ChunkMetaRow {
  relPath: string;
  lineCount: number;
  mtimeMs: number;
}

export class SqliteStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.initSchema();
  }

  close(): void {
    this.db.close();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        rel_path TEXT PRIMARY KEY,
        abs_path TEXT NOT NULL,
        content TEXT NOT NULL,
        line_count INTEGER NOT NULL,
        mtime_ms INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chunks (
        chunk_id TEXT PRIMARY KEY,
        rel_path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        heading_path TEXT NOT NULL,
        chunk_text TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        FOREIGN KEY(rel_path) REFERENCES documents(rel_path) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_rel_path ON chunks(rel_path);

      CREATE VIRTUAL TABLE IF NOT EXISTS fts_chunks USING fts5(
        chunk_id UNINDEXED,
        rel_path,
        heading_path,
        chunk_text,
        tokenize='unicode61 remove_diacritics 2'
      );
    `);
  }

  getDocument(relPath: string): DocumentRecord | null {
    const row = this.db
      .prepare(
        `SELECT rel_path, abs_path, content, line_count, mtime_ms, content_hash
         FROM documents WHERE rel_path = ?`,
      )
      .get(relPath) as
      | {
          rel_path: string;
          abs_path: string;
          content: string;
          line_count: number;
          mtime_ms: number;
          content_hash: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      relPath: row.rel_path,
      absPath: row.abs_path,
      content: row.content,
      lineCount: row.line_count,
      mtimeMs: row.mtime_ms,
      contentHash: row.content_hash,
    };
  }

  listDocumentPaths(): string[] {
    const rows = this.db.prepare(`SELECT rel_path FROM documents`).all() as Array<{ rel_path: string }>;
    return rows.map(row => row.rel_path);
  }

  getChunkIdsByRelPath(relPath: string): string[] {
    const rows = this.db
      .prepare(`SELECT chunk_id FROM chunks WHERE rel_path = ? ORDER BY chunk_index`)
      .all(relPath) as Array<{ chunk_id: string }>;
    return rows.map(row => row.chunk_id);
  }

  deleteDocument(relPath: string): number {
    const chunkIds = this.getChunkIdsByRelPath(relPath);
    const tx = this.db.transaction((targetRelPath: string) => {
      this.db.prepare(`DELETE FROM fts_chunks WHERE rel_path = ?`).run(targetRelPath);
      const result = this.db.prepare(`DELETE FROM documents WHERE rel_path = ?`).run(targetRelPath);
      return Number(result.changes);
    });
    const changes = tx(relPath);
    if (chunkIds.length > 0) {
      // caller removes vectors with these ids
    }
    return changes;
  }

  upsertDocumentWithChunks(document: DocumentRecord, chunks: ChunkRecord[]): void {
    const tx = this.db.transaction((doc: DocumentRecord, records: ChunkRecord[]) => {
      this.db
        .prepare(
          `INSERT INTO documents(rel_path, abs_path, content, line_count, mtime_ms, content_hash, updated_at)
           VALUES(@relPath, @absPath, @content, @lineCount, @mtimeMs, @contentHash, @updatedAt)
           ON CONFLICT(rel_path) DO UPDATE SET
             abs_path=excluded.abs_path,
             content=excluded.content,
             line_count=excluded.line_count,
             mtime_ms=excluded.mtime_ms,
             content_hash=excluded.content_hash,
             updated_at=excluded.updated_at`,
        )
        .run({
          relPath: doc.relPath,
          absPath: doc.absPath,
          content: doc.content,
          lineCount: doc.lineCount,
          mtimeMs: doc.mtimeMs,
          contentHash: doc.contentHash,
          updatedAt: Date.now(),
        });

      this.db.prepare(`DELETE FROM chunks WHERE rel_path = ?`).run(doc.relPath);
      this.db.prepare(`DELETE FROM fts_chunks WHERE rel_path = ?`).run(doc.relPath);

      const insertChunk = this.db.prepare(
        `INSERT INTO chunks(chunk_id, rel_path, chunk_index, start_line, end_line, heading_path, chunk_text, content_hash)
         VALUES(@chunkId, @relPath, @chunkIndex, @startLine, @endLine, @headingPath, @chunkText, @contentHash)`,
      );
      const insertFts = this.db.prepare(
        `INSERT INTO fts_chunks(chunk_id, rel_path, heading_path, chunk_text)
         VALUES(@chunkId, @relPath, @headingPath, @chunkText)`,
      );

      for (const chunk of records) {
        const payload = {
          chunkId: chunk.chunkId,
          relPath: chunk.relPath,
          chunkIndex: chunk.chunkIndex,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          headingPath: chunk.headingPath,
          chunkText: chunk.text,
          contentHash: chunk.contentHash,
        };
        insertChunk.run(payload);
        insertFts.run(payload);
      }
    });

    tx(document, chunks);
  }

  keywordScoresForChunkIds(chunkIds: string[], query: string): Map<string, number> {
    const scoreMap = new Map<string, number>();
    if (!query.trim() || chunkIds.length === 0) {
      return scoreMap;
    }

    const safeQuery = this.normalizeFtsQuery(query);
    if (!safeQuery) {
      return scoreMap;
    }

    const placeholders = chunkIds.map(() => "?").join(", ");
    let rows: Array<{ chunk_id: string; rank: number }> = [];
    try {
      rows = this.db
        .prepare(
          `SELECT chunk_id, bm25(fts_chunks) AS rank
           FROM fts_chunks
           WHERE fts_chunks MATCH ? AND chunk_id IN (${placeholders})`,
        )
        .all(safeQuery, ...chunkIds) as Array<{ chunk_id: string; rank: number }>;
    } catch (error) {
      // Avoid hard-failing semantic search when FTS parser rejects a query.
      console.warn("fts5 query parse failed:", error);
      return scoreMap;
    }

    for (const row of rows) {
      scoreMap.set(row.chunk_id, Number(row.rank));
    }
    return scoreMap;
  }

  private normalizeFtsQuery(query: string): string {
    const tokens = query
      .split(/\s+/)
      .map(token => token.replace(/[^\p{L}\p{N}_]+/gu, ""))
      .filter(Boolean);

    if (tokens.length === 0) {
      return "";
    }

    return tokens.map(token => `"${token.replace(/"/g, "\"\"")}"`).join(" ");
  }

  getChunkMetadata(chunkIds: string[]): Map<string, ChunkMetaRow> {
    const meta = new Map<string, ChunkMetaRow>();
    if (chunkIds.length === 0) {
      return meta;
    }

    const placeholders = chunkIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT c.chunk_id, d.rel_path, d.line_count, d.mtime_ms
         FROM chunks c
         JOIN documents d ON d.rel_path = c.rel_path
         WHERE c.chunk_id IN (${placeholders})`,
      )
      .all(...chunkIds) as Array<{
      chunk_id: string;
      rel_path: string;
      line_count: number;
      mtime_ms: number;
    }>;

    for (const row of rows) {
      meta.set(row.chunk_id, {
        relPath: row.rel_path,
        lineCount: row.line_count,
        mtimeMs: row.mtime_ms,
      });
    }
    return meta;
  }
}
