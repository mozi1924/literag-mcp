import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createKnowledgeMcpServer } from "./mcpServerFactory.js";
import { KnowledgeBaseService } from "./service.js";

const kb = new KnowledgeBaseService(process.cwd());
const config = kb.getConfig();

function createServerInstance() {
  return createKnowledgeMcpServer(kb, {
    name: config.serverName,
    version: "0.2.0",
    toolPrefix: config.toolPrefix,
  });
}

async function runStdio(): Promise<void> {
  const server = createServerInstance();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `MCP server started (stdio). tools: ${config.toolPrefix}_index, ${config.toolPrefix}_search, ${config.toolPrefix}_get_document`,
  );
  console.error(`workspace root: ${config.workspaceRoot}`);
}

async function runStreamableHttp(): Promise<void> {
  const app = createMcpExpressApp({ host: config.httpHost });

  app.post(config.httpPath, async (req, res) => {
    const server = createServerInstance();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error("Error handling MCP streamable HTTP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
      void server.close();
    }
  });

  app.get(config.httpPath, (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
  });

  app.delete(config.httpPath, (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
  });

  app.listen(config.httpPort, config.httpHost, () => {
    console.error(
      `MCP server started (streamable-http): http://${config.httpHost}:${config.httpPort}${config.httpPath}`,
    );
    console.error(
      `tools: ${config.toolPrefix}_index, ${config.toolPrefix}_search, ${config.toolPrefix}_get_document`,
    );
    console.error(`workspace root: ${config.workspaceRoot}`);
  });
}

async function main() {
  if (config.transport === "streamable-http") {
    await runStreamableHttp();
    return;
  }
  await runStdio();
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
