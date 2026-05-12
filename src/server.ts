import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { KnowledgeBaseService } from "./service.js";

const kb = new KnowledgeBaseService(process.cwd());

const server = new McpServer({
  name: "literag-markdown-kb",
  version: "0.1.0",
});

server.registerTool(
  "kb_index",
  {
    description:
      "Index markdown documents into Chroma + SQLite. Supports full/incremental indexing and watch mode.",
    inputSchema: {
      root_path: z.string().describe("Root directory for markdown files"),
      mode: z.enum(["full", "incremental"]).default("incremental"),
      watch: z.boolean().default(false),
    },
  },
  async ({ root_path, mode, watch }) => {
    const result = await kb.indexKnowledgeBase({
      rootPath: root_path,
      mode,
      watch,
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

server.registerTool(
  "kb_search",
  {
    description:
      "Hybrid semantic + keyword search over markdown chunks. Ranking = alpha * vector + (1-alpha) * keyword.",
    inputSchema: {
      query: z.string().min(1),
      top_k: z.number().int().min(1).max(50).default(8),
      alpha: z.number().min(0).max(1).default(0.7),
      path_prefix: z.string().optional(),
      file_glob: z.string().optional(),
    },
  },
  async ({ query, top_k, alpha, path_prefix, file_glob }) => {
    const result = await kb.search({
      query,
      topK: top_k,
      alpha,
      pathPrefix: path_prefix,
      fileGlob: file_glob,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

server.registerTool(
  "kb_get_document",
  {
    description:
      "Read a markdown document by relative path. Returns whole file by default, or a line range if start/end are provided.",
    inputSchema: {
      rel_path: z.string().describe("Relative path to a markdown file"),
      start_line: z.number().int().min(1).optional(),
      end_line: z.number().int().min(1).optional(),
    },
  },
  async ({ rel_path, start_line, end_line }) => {
    const result = kb.getDocument({
      relPath: rel_path,
      startLine: start_line,
      endLine: end_line,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(async error => {
  console.error("MCP server failed:", error);
  await kb.close();
  process.exit(1);
});

const shutdown = async () => {
  await kb.close();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
