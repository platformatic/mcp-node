import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "node:os";
import notifier from "node-notifier";

const execAsync = promisify(exec);

// Create an MCP server
const server = new McpServer({
  name: "NodeRunner",
  version: "1.0.0"
});

/**
 * Helper function to ask for permission using node-notifier
 */
async function askPermission(action: string): Promise<boolean> {
  return new Promise((resolve) => {
    notifier.notify({
      title: 'NodeRunner Permission Request',
      message: `${action}`,
      wait: true,
      timeout: 60,
      actions: 'Allow',
      closeLabel: 'Deny'
    }, (err, response, metadata) => {
      if (err) {
        console.error('Error showing notification:', err);
        resolve(false);
        return;
      }
      
      const buttonPressed = metadata?.activationValue || response;
      resolve(buttonPressed === 'Allow');
    });
  });
}

// Tool to run a Node.js script
server.tool(
  "run-node-script",
  "Execute a Node.js script file locally",
  {
    scriptPath: z.string().describe("Path to the Node.js script to execute"),
    args: z.array(z.string()).optional().describe("Optional arguments to pass to the script")
  },
  async ({ scriptPath, args = [] }, extra) => {
    try {
      // Resolve the absolute path
      const absPath = path.resolve(scriptPath);
      
      // Check if file exists
      try {
        await fs.access(absPath);
      } catch (error) {
        return {
          isError: true,
          content: [{ 
            type: "text" as const, 
            text: `Error: Script not found at ${absPath}` 
          }]
        };
      }
      
      // Format command for permission request
      const command = `node ${absPath} ${args.join(' ')}`;
      

      // Ask for permission
      let permitted;
      let tries = 0;

      while (!permitted) {
        if (tries++ > 5) {
          return {
            isError: true,
            content: [{ 
              type: "text" as const, 
              text: "Permission denied by user" 
            }]
          };
        }
        permitted = await askPermission(command);
      }
      
      // Execute the script
      const { stdout, stderr } = await execAsync(command);
      
      return {
        content: [
          { 
            type: "text" as const, 
            text: stdout || "Script executed successfully with no output" 
          },
          ...(stderr ? [{ 
            type: "text" as const, 
            text: `Standard Error: ${stderr}` 
          }] : [])
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ 
          type: "text" as const, 
          text: `Error executing script: ${errorMessage}` 
        }]
      };
    }
  }
);

// Tool to run an npm script
server.tool(
  "run-npm-script",
  "Execute an npm script from package.json",
  {
    packageDir: z.string().describe("Directory containing package.json"),
    scriptName: z.string().describe("Name of the script to run"),
    args: z.array(z.string()).optional().describe("Optional arguments to pass to the script")
  },
  async ({ packageDir, scriptName, args = [] }, extra) => {
    try {
      // Resolve the absolute path
      const absPath = path.resolve(packageDir);
      const packageJsonPath = path.join(absPath, "package.json");
      
      // Check if package.json exists
      try {
        await fs.access(packageJsonPath);
      } catch (error) {
        return {
          isError: true,
          content: [{ 
            type: "text" as const, 
            text: `Error: package.json not found at ${packageJsonPath}` 
          }]
        };
      }
      
      // Read package.json to verify script exists
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      
      if (!packageJson.scripts || !packageJson.scripts[scriptName]) {
        return {
          isError: true,
          content: [{ 
            type: "text" as const, 
            text: `Error: Script '${scriptName}' not found in package.json` 
          }]
        };
      }
      
      // Format command for permission request
      const argsString = args.length > 0 ? ` -- ${args.join(' ')}` : '';
      const command = `npm run ${scriptName}${argsString}`;
      
      // Ask for permission
      const permitted = await askPermission(`${command} (in ${absPath})`);
      
      if (!permitted) {
        return {
          isError: true,
          content: [{ 
            type: "text" as const, 
            text: "Permission denied by user" 
          }]
        };
      }
      
      // Execute the npm script
      const { stdout, stderr } = await execAsync(command, { cwd: absPath });
      
      return {
        content: [
          { 
            type: "text" as const, 
            text: stdout || "Script executed successfully with no output" 
          },
          ...(stderr ? [{ 
            type: "text" as const, 
            text: `Standard Error: ${stderr}` 
          }] : [])
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ 
          type: "text" as const, 
          text: `Error executing npm script: ${errorMessage}` 
        }]
      };
    }
  }
);

// Tool to run Node with the --eval flag
server.tool(
  "run-node-eval",
  "Execute JavaScript code directly with Node.js eval. Optionally specify a directory to execute in.",
  {
    code: z.string().describe("JavaScript code to execute"),
    evalDirectory: z.string().optional().describe("Directory to execute the code in (must be an allowed directory)"),
  },
  async ({ code, evalDirectory }, extra) => {
    try {
      // Determine execution directory - use os.tmpdir() for the default
      const tmpDir = os.tmpdir();
      let executionDir = tmpDir;
      
      if (evalDirectory) {
        // Resolve the absolute path
        const absPath = path.resolve(evalDirectory);
        
        // Check if directory exists
        try {
          const stats = await fs.stat(absPath);
          if (!stats.isDirectory()) {
            return {
              isError: true,
              content: [{ 
                type: "text" as const, 
                text: `Error: '${absPath}' is not a directory` 
              }]
            };
          }
        } catch (error) {
          return {
            isError: true,
            content: [{ 
              type: "text" as const, 
              text: `Error: Directory '${absPath}' does not exist` 
            }]
          };
        }
        
        // Get the allowed directories from the environment variable
        // The temporary directory is always allowed
        let allowedDirs = process.env.EVAL_DIRECTORIES
          ? process.env.EVAL_DIRECTORIES.split(':')
          : [];
        
        // Always add the temporary directory to allowed directories
        allowedDirs.push(tmpDir);
        
        const isAllowed = allowedDirs.some(dir => {
          // Check if absPath is within an allowed directory
          return absPath === dir || absPath.startsWith(dir + '/');
        });
        
        if (!isAllowed) {
          return {
            isError: true,
            content: [{ 
              type: "text" as const, 
              text: `Error: Directory '${absPath}' is not in the list of allowed directories` 
            }]
          };
        }
        
        executionDir = absPath;
      }
      
      // Format command for permission request
      // We're showing a simplified version in the permission dialog
      const displayCode = code.length > 50 ? code.substring(0, 47) + "..." : code;
      
      // Ask for permission - include the execution directory in the message
      const permissionMessage = `node --eval "${displayCode}" (in ${executionDir})`;
      
      const permitted = await askPermission(permissionMessage);
      
      if (!permitted) {
        return {
          isError: true,
          content: [{ 
            type: "text" as const, 
            text: "Permission denied by user" 
          }]
        };
      }
      
      // Execute the code directly using --eval
      // Escaping the code properly for the shell command
      const escapedCode = code.replace(/"/g, '\\"');
      const { stdout, stderr } = await execAsync(`node --eval "${escapedCode}"`, { cwd: executionDir });
      
      return {
        content: [
          { 
            type: "text" as const, 
            text: stdout || "Code executed successfully with no output" 
          },
          ...(stderr ? [{ 
            type: "text" as const, 
            text: `Standard Error: ${stderr}` 
          }] : [])
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ 
          type: "text" as const, 
          text: `Error executing code: ${errorMessage}` 
        }]
      };
    }
  }
);

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
