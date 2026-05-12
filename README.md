# literag-mcp

单知识库 Markdown MCP 服务器：

- Vectra（默认）本地向量检索
- ChromaDB（可选）向量检索
- SQLite FTS5 关键词/全文检索
- OpenAI-compatible 外置 Embedding API
- 混合排序（`alpha * vector + (1 - alpha) * keyword`）

## 传输类型

本项目同时支持两种 MCP 传输：

- `stdio`
- `streamable-http`

通过 `MCP_TRANSPORT` 选择：

- `MCP_TRANSPORT=stdio`
- `MCP_TRANSPORT=streamable-http`

## 单知识库默认目录

默认知识库目录是 MCP 服务器工作目录下的 `document/`（含子目录）。

- 无需每次传文档根目录
- 在远程 MCP 场景或外部目录权限受限时，依旧可用

可通过 `KB_DOCUMENT_ROOT`（或 `config.json` 的 `knowledgeBaseDir`）覆盖。

## 固定工作目录（推荐在 stdio/agent 场景开启）

为避免 `process.cwd()` 被调用方工作区影响，可显式指定“路径解析基准目录”（绝对路径）：

- 环境变量：`LITERAG_WORKSPACE_ROOT=/ABS/PATH/literag-mcp`
- 配置文件：`"workspaceRoot": "/ABS/PATH/literag-mcp"`

启用后，以下默认路径都基于该目录解析：

- `config.json`（当未设置 `LITERAG_CONFIG_PATH` 时）
- `VECTRA_PATH`
- `SQLITE_PATH`
- `KB_DOCUMENT_ROOT`

## 工具名前缀

工具名前缀支持自定义，例如设置：

- `KB_TOOL_PREFIX=bpy`

工具会注册为：

- `bpy_index`
- `bpy_search`
- `bpy_get_document`

默认前缀是 `kb`。

## 工具

- `<prefix>_index`
  - 入参：`mode`, `watch`, `root_path?`
  - `root_path` 可选，默认使用 `document/`
- `<prefix>_search`
  - 入参：`query`, `top_k`, `alpha`, `path_prefix?`, `file_glob?`
- `<prefix>_get_document`
  - 入参：`rel_path`, `start_line?`, `end_line?`

## 配置优先级

环境变量优先于 `config.json`。

### 必需（Embedding）

- `EMBEDDING_BASE_URL`
- `EMBEDDING_API_KEY`
- `EMBEDDING_MODEL`

### 常用可选

- `VECTOR_STORE`（`vectra` / `chroma`，默认 `vectra`）
- `LITERAG_WORKSPACE_ROOT`（绝对路径，固定路径解析基准目录）
- `VECTRA_PATH`（默认 `.literag/vectra`）
- `INDEX_FILE_CONCURRENCY`（默认 `4`，范围 `1-32`）
- `EMBEDDING_BATCH_MAX_TEXTS`（默认 `64`，范围 `1-512`）
- `EMBEDDING_BATCH_CONCURRENCY`（默认 `2`，范围 `1-32`）
- `KB_DOCUMENT_ROOT`（默认 `./document`）
- `KB_TOOL_PREFIX`（默认 `kb`）
- `MCP_TRANSPORT`（`stdio` / `streamable-http`）
- `MCP_HTTP_HOST`（默认 `127.0.0.1`）
- `MCP_HTTP_PORT`（默认 `8787`）
- `MCP_HTTP_PATH`（默认 `/mcp`）
- `CHROMA_URL`（当 `VECTOR_STORE=chroma` 时生效，默认 `http://127.0.0.1:8000`）
- `CHROMA_COLLECTION`（当 `VECTOR_STORE=chroma` 时生效，默认 `literag_markdown_kb`）
- `SQLITE_PATH`（默认 `.literag/kb.sqlite`）

## 性能建议（大文档集）

- 默认索引已启用并发处理文件（`INDEX_FILE_CONCURRENCY=4`）。
- Embedding 请求会自动做批处理（将并发小请求合并成少量大请求）。
- 本地 Ollama 常见建议：
  - CPU 偏弱机器先用 `2`
  - CPU 偏强机器可尝试 `4~8`
- 如果遇到 embedding 端速率瓶颈或不稳定，先下调并发。
- 对“文件很多、每个文件较小”的文档集（例如 Blender API 参考）建议：
  - `INDEX_FILE_CONCURRENCY=4`
  - `EMBEDDING_BATCH_MAX_TEXTS=96`
  - `EMBEDDING_BATCH_CONCURRENCY=2`

## 打包与 MCP 配置

完整安装/打包/配置流程见：

- [docs/PACKAGING_AND_MCP_SETUP.md](docs/PACKAGING_AND_MCP_SETUP.md)

## 运行

安装依赖：

```bash
npm install
```

开发：

```bash
npm run dev:stdio
npm run dev:http
npm run dev:index -- --root /ABS/PATH/docs --mode incremental
```

构建与运行：

```bash
npm run build
npm run start:stdio
npm run start:http
npm run start:index -- --root /ABS/PATH/docs --mode incremental
```

手动索引 CLI（绕开 MCP 120 秒超时）会每秒输出：

- 当前秒处理速率：`chunk/s`
- Chunk 进度：`processed/total`（`total` 来自预估；可 `--no-total-chunks` 关闭）
- 文件进度与耗时

测试：

```bash
npm test
```
