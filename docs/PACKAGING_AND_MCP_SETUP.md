# literag-mcp 打包与 MCP 接入指南

本文面向“单文档集专用 MCP 服务器”场景：下载源码后，快速完成安装、放文档、启动服务，并接入 Codex/Claude Code。

## 1. 前置要求

- Node.js `22.x`（推荐 LTS）
- npm（随 Node 安装）
- 可用的 OpenAI-compatible Embedding API（例如本地 Ollama `http://127.0.0.1:11434/v1` + `bge-m3`）

## 2. 下载与安装

```bash
git clone <your-repo-url> literag-mcp
cd literag-mcp
npm install
npm run build
```

## 3. 放置文档

默认目录是仓库下 `document/`。

- 方案 A（推荐）：把文档复制到 `document/`（支持子目录）
- 方案 B：保留外部目录，用 `KB_DOCUMENT_ROOT=/abs/path/to/docs` 指向

示例（方案 A）：

```bash
mkdir -p document
cp -R /Users/you/your_markdown_docs/* document/
```

## 4. 启动参数（核心）

最小必需：

- `EMBEDDING_BASE_URL`
- `EMBEDDING_API_KEY`
- `EMBEDDING_MODEL`

常用推荐：

- `LITERAG_WORKSPACE_ROOT=/ABS/PATH/literag-mcp`（绝对路径，固定真实工作目录）
- `VECTOR_STORE=vectra`（默认值）
- `INDEX_FILE_CONCURRENCY=4`（大文档集可提速，建议 `2~8`）
- `EMBEDDING_BATCH_MAX_TEXTS=64`（建议 `64~128`）
- `EMBEDDING_BATCH_CONCURRENCY=2`（建议 `1~3`）
- `KB_TOOL_PREFIX=bpy`（工具名会变成 `bpy_index`/`bpy_search`/`bpy_get_document`）

本地 Ollama 例子：

```bash
EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1 \
EMBEDDING_API_KEY=ollama \
EMBEDDING_MODEL=bge-m3:latest \
LITERAG_WORKSPACE_ROOT=/ABS/PATH/literag-mcp \
VECTOR_STORE=vectra \
INDEX_FILE_CONCURRENCY=4 \
EMBEDDING_BATCH_MAX_TEXTS=96 \
EMBEDDING_BATCH_CONCURRENCY=2 \
KB_TOOL_PREFIX=bpy \
MCP_TRANSPORT=stdio \
node dist/server.js
```

## 5. 可分发打包（给他人使用）

### 5.1 npm 包形式

```bash
npm pack
```

生成 `literag-mcp-<version>.tgz`，接收方可：

```bash
npm install literag-mcp-<version>.tgz
```

### 5.2 源码包形式（含专用文档）

如果你希望“开箱即用专用知识库”，建议连 `document/` 一起分发：

```bash
tar -czf literag-mcp-with-docs.tar.gz \
  --exclude node_modules \
  --exclude .git \
  .
```

## 6. 在 Codex 中配置 MCP（stdio）

在 `~/.codex/config.toml`（或项目 `.codex/config.toml`）增加：

```toml
[mcp_servers.literag_bpy]
type = "stdio"
command = "node"
args = ["/ABS/PATH/literag-mcp/dist/server.js"]

[mcp_servers.literag_bpy.env]
EMBEDDING_BASE_URL = "http://127.0.0.1:11434/v1"
EMBEDDING_API_KEY = "ollama"
EMBEDDING_MODEL = "bge-m3:latest"
LITERAG_WORKSPACE_ROOT = "/ABS/PATH/literag-mcp"
VECTOR_STORE = "vectra"
INDEX_FILE_CONCURRENCY = "4"
EMBEDDING_BATCH_MAX_TEXTS = "96"
EMBEDDING_BATCH_CONCURRENCY = "2"
KB_DOCUMENT_ROOT = "/ABS/PATH/literag-mcp/document"
KB_TOOL_PREFIX = "bpy"
MCP_TRANSPORT = "stdio"
```

建议全部使用绝对路径，避免不同工作目录下启动失败。

## 7. 在 Claude Code 中配置 MCP（stdio）

推荐直接用 CLI 添加：

```bash
claude mcp add-json literag-bpy '{
  "type": "stdio",
  "command": "node",
  "args": ["/ABS/PATH/literag-mcp/dist/server.js"],
  "env": {
    "EMBEDDING_BASE_URL": "http://127.0.0.1:11434/v1",
    "EMBEDDING_API_KEY": "ollama",
    "EMBEDDING_MODEL": "bge-m3:latest",
    "LITERAG_WORKSPACE_ROOT": "/ABS/PATH/literag-mcp",
    "VECTOR_STORE": "vectra",
    "INDEX_FILE_CONCURRENCY": "4",
    "EMBEDDING_BATCH_MAX_TEXTS": "96",
    "EMBEDDING_BATCH_CONCURRENCY": "2",
    "KB_DOCUMENT_ROOT": "/ABS/PATH/literag-mcp/document",
    "KB_TOOL_PREFIX": "bpy",
    "MCP_TRANSPORT": "stdio"
  }
}'
```

## 8. 验收清单

- 能看到 MCP 工具：`bpy_index`、`bpy_search`、`bpy_get_document`
- 首次索引成功（大文档集首次耗时较长属正常）
- `bpy_search` 能命中文档并返回 `rel_path` 与片段

如果文档库很大且客户端有 MCP 调用超时限制，可改用手动索引 CLI：

```bash
npm run build
EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1 \
EMBEDDING_API_KEY=ollama \
EMBEDDING_MODEL=bge-m3:latest \
LITERAG_WORKSPACE_ROOT=/ABS/PATH/literag-mcp \
VECTOR_STORE=vectra \
INDEX_FILE_CONCURRENCY=4 \
EMBEDDING_BATCH_MAX_TEXTS=96 \
EMBEDDING_BATCH_CONCURRENCY=2 \
npm run start:index -- --root /ABS/PATH/blender_python_reference --mode incremental
```

CLI 会每秒显示 `chunk/s`、`chunks processed/total`、文件进度和耗时。

## 9. 常见问题

- 索引很慢：
  - 优先调 `INDEX_FILE_CONCURRENCY`（`2~8` 试探）
  - 调 `EMBEDDING_BATCH_MAX_TEXTS`（`64~128`）减少小请求数量
  - 调 `EMBEDDING_BATCH_CONCURRENCY`（`1~3`）匹配 embedding 服务吞吐
  - 确认 embedding 服务本身吞吐（Ollama 机型差异大）
- 更换向量后端到 Chroma：
  - 设置 `VECTOR_STORE=chroma`
  - 额外提供 `CHROMA_URL` 和 `CHROMA_COLLECTION`
