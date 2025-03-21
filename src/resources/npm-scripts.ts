import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as path from "path";
import * as fs from "fs/promises";

export function registerNpmScriptsResource(server: McpServer): void {
  // Resource for listing package.json scripts
  server.resource(
    "npm-scripts",
    "npm-scripts://{directory}",
    async (uri) => {
      try {
        // Extract directory from the URI
        const uriPath = uri.pathname;
        const matches = /^\/([^/]+)/.exec(uriPath);
        const directory = matches ? matches[1] : '.';
        
        // Resolve the absolute path
        const absPath = path.resolve(directory);
        const packageJsonPath = path.join(absPath, "package.json");
        
        // Read package.json
        try {
          const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
          const packageJson = JSON.parse(packageJsonContent);
          
          if (!packageJson.scripts || Object.keys(packageJson.scripts).length === 0) {
            return {
              contents: [{
                uri: uri.href,
                text: "No scripts found in package.json"
              }]
            };
          }
          
          const scriptsList = Object.entries(packageJson.scripts)
            .map(([name, command]) => `- ${name}: ${command}`)
            .join('\n');
          
          return {
            contents: [{
              uri: uri.href,
              text: `Available scripts in ${packageJsonPath}:\n\n${scriptsList}`
            }]
          };
        } catch (error) {
          return {
            contents: [{
              uri: uri.href,
              text: `Error: package.json not found or invalid at ${packageJsonPath}`
            }]
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          contents: [{
            uri: uri.href,
            text: `Error reading package.json: ${errorMessage}`
          }]
        };
      }
    }
  );
}
