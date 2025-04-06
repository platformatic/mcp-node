#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Import all tool and resource registrations
import { registerNodeVersionTools } from "./tools/node-version.js";
import { registerScriptTools } from "./tools/run-scripts.js";
import { registerNpmTools } from "./tools/npm-tools.js";
import { registerServerTools } from "./tools/server-tools.js";
import { registerNpmDocsTools } from "./tools/npm-docs.js";
import { registerNpmScriptsResource } from "./resources/npm-scripts.js";

// Create an MCP server
const server = new McpServer({
  name: "NodeRunner",
  version: "1.0.0"
});

// Register all tools and resources
registerNodeVersionTools(server);
registerScriptTools(server);
registerNpmTools(server);
registerServerTools(server);
registerNpmDocsTools(server);
registerNpmScriptsResource(server);

// Start the server
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Node Runner MCP Server running");
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

main();
