# literag-mcp

单知识库 Markdown MCP 服务器：

- ChromaDB 向量检索
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

- `KB_DOCUMENT_ROOT`（默认 `./document`）
- `KB_TOOL_PREFIX`（默认 `kb`）
- `MCP_TRANSPORT`（`stdio` / `streamable-http`）
- `MCP_HTTP_HOST`（默认 `127.0.0.1`）
- `MCP_HTTP_PORT`（默认 `8787`）
- `MCP_HTTP_PATH`（默认 `/mcp`）
- `CHROMA_URL`（默认 `http://127.0.0.1:8000`）
- `CHROMA_COLLECTION`（默认 `literag_markdown_kb`）
- `SQLITE_PATH`（默认 `.literag/kb.sqlite`）

## 运行

安装依赖：

```bash
npm install
```

开发：

```bash
npm run dev:stdio
npm run dev:http
```

构建与运行：

```bash
npm run build
npm run start:stdio
npm run start:http
```

测试：

```bash
npm test
```
