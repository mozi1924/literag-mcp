import { minimatch } from "minimatch";
import type { EmbeddingProvider, SearchResponse, VectorStore } from "../types.js";
import { rankHybrid, vectorDistanceToScore } from "./scoring.js";
import type { SqliteStore } from "../storage/sqlite.js";

function makeSnippet(text: string, maxLen = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) {
    return clean;
  }
  return `${clean.slice(0, maxLen - 1)}…`;
}

export class HybridRetriever {
  constructor(
    private readonly embedding: EmbeddingProvider,
    private readonly vectorStore: VectorStore,
    private readonly sqlite: SqliteStore,
  ) {}

  async search(args: {
    query: string;
    topK: number;
    alpha: number;
    pathPrefix?: string;
    fileGlob?: string;
  }): Promise<SearchResponse> {
    const { query, topK, alpha, pathPrefix, fileGlob } = args;
    const [queryEmbedding] = await this.embedding.embed([query]);
    const vectorCandidates = await this.vectorStore.query(queryEmbedding, Math.max(topK * 4, topK));

    const filtered = vectorCandidates.filter(candidate => {
      if (pathPrefix && !candidate.relPath.startsWith(pathPrefix)) {
        return false;
      }
      if (fileGlob && !minimatch(candidate.relPath, fileGlob)) {
        return false;
      }
      return true;
    });

    const chunkIds = filtered.map(item => item.chunkId);
    const keywordScores = this.sqlite.keywordScoresForChunkIds(chunkIds, query);

    const ranked = rankHybrid(
      filtered.map(item => ({
        chunkId: item.chunkId,
        distance: item.distance,
        vectorRaw: vectorDistanceToScore(item.distance),
        keywordRaw: keywordScores.get(item.chunkId),
      })),
      alpha,
    );

    const metaMap = this.sqlite.getChunkMetadata(chunkIds);
    const byId = new Map(filtered.map(item => [item.chunkId, item]));

    const results = ranked.slice(0, topK).map(row => {
      const base = byId.get(row.chunkId);
      if (!base) {
        throw new Error(`Missing vector candidate for ${row.chunkId}`);
      }
      const docMeta = metaMap.get(row.chunkId);
      return {
        chunk_id: row.chunkId,
        rel_path: base.relPath,
        start_line: base.startLine,
        end_line: base.endLine,
        heading_path: base.headingPath,
        snippet: makeSnippet(base.text),
        metadata: {
          line_count: docMeta?.lineCount,
          mtime_ms: docMeta?.mtimeMs,
        },
        score_breakdown: {
          vector: row.vectorScore,
          keyword: row.keywordScore,
          final: row.finalScore,
          distance: row.distance,
        },
      };
    });

    return {
      query,
      top_k: topK,
      alpha,
      count: results.length,
      results,
    };
  }
}
