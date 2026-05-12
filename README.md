# literag-mcp

Markdown knowledge-base MCP server with:

- ChromaDB vector retrieval
- SQLite FTS5 keyword/full-text retrieval
- OpenAI-compatible external embeddings API
- Hybrid ranking (`alpha * vector + (1 - alpha) * keyword`)

## Features

- `kb_index`: full/incremental indexing + optional watch mode
- `kb_search`: hybrid semantic + keyword search with score breakdown
- `kb_get_document`: fetch full markdown or specific line range
- Markdown-aware chunking with fenced code block preservation and overlap
- Result metadata includes relative path and line ranges

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure embedding + storage via environment variables or `config.json`.

You can copy the example:

```bash
cp config.example.json config.json
```

3. Build and run:

```bash
npm run build
npm start
```

Or development mode:

```bash
npm run dev
```

## Configuration

Environment variables take precedence over `config.json`.

Required (embedding):

- `EMBEDDING_BASE_URL`
- `EMBEDDING_API_KEY`
- `EMBEDDING_MODEL`

Optional:

- `EMBEDDING_DIMENSIONS`
- `CHROMA_URL` (default `http://127.0.0.1:8000`)
- `CHROMA_COLLECTION` (default `literag_markdown_kb`)
- `SQLITE_PATH` (default `.literag/kb.sqlite`)
- `SEARCH_ALPHA` (default `0.7`)
- `SEARCH_TOP_K` (default `8`)
- `CHUNK_TARGET_TOKENS` (default `1000`)
- `CHUNK_OVERLAP_TOKENS` (default `120`)

## MCP Tools

### `kb_index`

Input:

```json
{
  "root_path": "/absolute/path/to/docs",
  "mode": "full",
  "watch": false
}
```

### `kb_search`

Input:

```json
{
  "query": "how to install",
  "top_k": 8,
  "alpha": 0.7,
  "path_prefix": "docs/",
  "file_glob": "**/*.md"
}
```

### `kb_get_document`

Input (full):

```json
{
  "rel_path": "docs/setup.md"
}
```

Input (line range):

```json
{
  "rel_path": "docs/setup.md",
  "start_line": 10,
  "end_line": 60
}
```

## Tests

```bash
npm test
```
