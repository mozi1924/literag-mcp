export type IndexMode = "full" | "incremental";

export interface ChunkingOptions {
  targetTokens: number;
  overlapTokens: number;
}

export interface AppConfig {
  workspaceRoot: string;
  vectorStore: "vectra" | "chroma";
  vectraPath: string;
  chromaUrl: string;
  chromaCollection: string;
  sqlitePath: string;
  knowledgeBaseDir: string;
  toolPrefix: string;
  serverName: string;
  transport: "stdio" | "streamable-http";
  httpHost: string;
  httpPort: number;
  httpPath: string;
  defaultSearchAlpha: number;
  defaultTopK: number;
  chunking: ChunkingOptions;
  indexing: {
    fileConcurrency: number;
  };
  embedding: {
    baseUrl: string;
    apiKey: string;
    model: string;
    dimensions?: number;
    batchMaxTexts: number;
    batchConcurrency: number;
  };
}

export interface MarkdownChunk {
  chunkId: string;
  relPath: string;
  chunkIndex: number;
  text: string;
  headingPath: string;
  startLine: number;
  endLine: number;
}

export interface DocumentRecord {
  relPath: string;
  absPath: string;
  content: string;
  lineCount: number;
  mtimeMs: number;
  contentHash: string;
}

export interface ChunkRecord extends MarkdownChunk {
  contentHash: string;
}

export interface IndexStats {
  mode: IndexMode;
  rootPath: string;
  added: number;
  updated: number;
  deleted: number;
  skipped: number;
  chunkCount: number;
  durationMs: number;
  watchStarted: boolean;
  errors: string[];
}

export interface IndexProgress {
  processedFiles: number;
  totalFiles: number;
  processedChunks: number;
  totalChunks: number | null;
  chunksPerSecond: number;
  elapsedMs: number;
  added: number;
  updated: number;
  skipped: number;
  errors: number;
}

export interface VectorSearchResult {
  chunkId: string;
  relPath: string;
  startLine: number;
  endLine: number;
  headingPath: string;
  text: string;
  distance: number;
}

export interface SearchResultItem {
  chunk_id: string;
  rel_path: string;
  start_line: number;
  end_line: number;
  heading_path: string;
  snippet: string;
  metadata: {
    line_count?: number;
    mtime_ms?: number;
  };
  score_breakdown: {
    vector: number;
    keyword: number;
    final: number;
    distance: number;
  };
}

export interface SearchResponse {
  query: string;
  top_k: number;
  alpha: number;
  count: number;
  results: SearchResultItem[];
}

export interface VectorStore {
  upsertChunks(chunks: MarkdownChunk[], embeddings: number[][]): Promise<void>;
  deleteChunks(chunkIds: string[]): Promise<void>;
  query(embedding: number[], topK: number): Promise<VectorSearchResult[]>;
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}
