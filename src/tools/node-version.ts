import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as os from "node:os";
import { execAsync, selectedNodeVersion } from "../utils/helpers.js";

export function registerNodeVersionTools(server: McpServer): void {
  // Tool to list available Node.js versions via NVM
  server.tool(
    "list-node-versions",
    "Get available Node.js versions installed via NVM",
    {},
    async () => {
      try {
        // Execute the command to list Node.js versions through NVM
        // We need to source the NVM script first as it's not directly available in the environment
        const { stdout, stderr } = await execAsync('bash -c "source ~/.nvm/nvm.sh && nvm ls"');
        
        // Extract and parse version information
        const versions = stdout.trim().split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('v') || line.includes('->') || line.includes('*'))
          .map(line => {
            // Clean up the line to extract just the version
            let version = line;
            // Handle the currently active version which has an arrow
            const isActive = line.startsWith('->');
            if (isActive) {
              version = line.substring(2).trim();
            }
            
            // Extract the actual version number
            const versionMatch = version.match(/v(\d+\.\d+\.\d+)/);
            const versionNumber = versionMatch ? versionMatch[0] : version;
            
            return {
              version: versionNumber,
              isActive,
              line
            };
          });
        
        // Find the active version
        const activeVersion = versions.find(v => v.isActive);
        const activeVersionText = activeVersion ? `Currently active: ${activeVersion.version}` : 'No active version detected';
        
        // Check if we have a manually selected version
        const selectedVersionText = selectedNodeVersion ? 
          `Selected for MCP: ${selectedNodeVersion}` : 
          'No specific version selected for MCP (using system default)';
        
        return {
          content: [{ 
            type: "text" as const, 
            text: `Available Node.js versions:\n${stdout}\n\n${activeVersionText}\n${selectedVersionText}` 
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ 
            type: "text" as const, 
            text: `Error listing Node.js versions: ${errorMessage}\n\nMake sure NVM is installed and properly configured.` 
          }]
        };
      }
    }
  );

  // Tool to select a specific Node.js version for running scripts
  server.tool(
    "select-node-version",
    "Select a specific Node.js version to use for subsequent script executions",
    {
      version: z.string().describe("Node.js version to use (e.g., 'v18.20.5', 'system', 'lts/*', or other NVM aliases)"),
    },
    async ({ version }) => {
      try {
        // Validate the version exists before setting it
        const { stdout } = await execAsync(`bash -c "source ~/.nvm/nvm.sh && nvm ls ${version}"`);
        
        if (!stdout.includes(version) && !stdout.includes('->')) {
          return {
            isError: true,
            content: [{ 
              type: "text" as const, 
              text: `Error: Node.js version '${version}' not found or not installed.\nUse 'list-node-versions' to see available versions.` 
            }]
          };
        }
        
        // Store the selected version in the module-level variable
        // This is shared between modules through the utils/helpers.js import
        // eslint-disable-next-line import/no-mutable-exports
        Object.assign(exports, { selectedNodeVersion: version });
        
        return {
          content: [{ 
            type: "text" as const, 
            text: `Successfully selected Node.js version: ${version}\nThis version will be used for all subsequent script executions.` 
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ 
            type: "text" as const, 
            text: `Error selecting Node.js version: ${errorMessage}` 
          }]
        };
      }
    }
  );

  // Tool to get the Node.js version
  server.tool(
    "get-node-version",
    "Get the version of Node.js the scripts will be executed with",
    {},
    async () => {
      try {
        // Build the appropriate command based on whether we have a selected Node.js version
        let versionCommand = 'node --version';
        let npmVersionCommand = 'npm --version';
        let nodePathCommand = 'which node';
        
        // If we have a selected Node version, use it via nvm
        if (selectedNodeVersion) {
          versionCommand = `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedNodeVersion} > /dev/null && node --version"`;
          npmVersionCommand = `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedNodeVersion} > /dev/null && npm --version"`;
          nodePathCommand = `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedNodeVersion} > /dev/null && which node"`;
        }
        
        // Get Node.js version info
        const { stdout } = await execAsync(versionCommand);
        const nodeVersion = stdout.trim();
        
        // Get npm version info
        const { stdout: npmStdout } = await execAsync(npmVersionCommand);
        const npmVersion = npmStdout.trim();
        
        // Get the path to Node.js executable
        const { stdout: nodePath } = await execAsync(nodePathCommand);
        const nodeExecutablePath = nodePath.trim();
        
        // Get platform and architecture
        const platform = os.platform();
        const arch = os.arch();
        
        // Add info about whether we're using a selected version
        const selectionInfo = selectedNodeVersion 
          ? `\nSelected via MCP: ${selectedNodeVersion}` 
          : '\nUsing system default Node.js version';
        
        return {
          content: [{ 
            type: "text" as const, 
            text: `Node.js: ${nodeVersion}\nNPM: ${npmVersion}\nNode Path: ${nodeExecutablePath}\nPlatform: ${platform}\nArchitecture: ${arch}${selectionInfo}` 
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ 
            type: "text" as const, 
            text: `Error getting Node.js version info: ${errorMessage}` 
          }]
        };
      }
    }
  );
}
