import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { KnowledgeBaseService } from "./service.js";

function makeToolName(prefix: string, suffix: string): string {
  return `${prefix}_${suffix}`;
}

export function createKnowledgeMcpServer(
  kb: KnowledgeBaseService,
  args: {
    name: string;
    version: string;
    toolPrefix: string;
  },
): McpServer {
  const server = new McpServer({
    name: args.name,
    version: args.version,
  });

  const indexToolName = makeToolName(args.toolPrefix, "index");
  const searchToolName = makeToolName(args.toolPrefix, "search");
  const getDocumentToolName = makeToolName(args.toolPrefix, "get_document");

  server.registerTool(
    indexToolName,
    {
      description:
        "Index markdown documents into Chroma + SQLite. Defaults to cwd/document, supports full/incremental + watch.",
      inputSchema: {
        mode: z.enum(["full", "incremental"]).default("incremental"),
        watch: z.boolean().default(false),
        root_path: z
          .string()
          .optional()
          .describe("Optional override for knowledge root. Defaults to cwd/document."),
      },
    },
    async ({ mode, watch, root_path }) => {
      const result = await kb.indexKnowledgeBase({
        mode,
        watch,
        rootPath: root_path,
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
    searchToolName,
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
    getDocumentToolName,
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
      const result = await kb.getDocument({
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

  return server;
}
