import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs/promises";
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
      message: `Allow execution of: ${action}?`,
      wait: true,
      actions: ['Allow', 'Deny']
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
  async ({ scriptPath, args = [] }) => {
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
            type: "text", 
            text: `Error: Script not found at ${absPath}` 
          }]
        };
      }
      
      // Format command for permission request
      const command = `node ${absPath} ${args.join(' ')}`;
      
      // Ask for permission
      const permitted = await askPermission(command);
      
      if (!permitted) {
        return {
          isError: true,
          content: [{ 
            type: "text", 
            text: "Permission denied by user" 
          }]
        };
      }
      
      // Execute the script
      const { stdout, stderr } = await execAsync(command);
      
      return {
        content: [
          { 
            type: "text", 
            text: stdout || "Script executed successfully with no output" 
          },
          ...(stderr ? [{ 
            type: "text", 
            text: `Standard Error: ${stderr}` 
          }] : [])
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ 
          type: "text", 
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
  async ({ packageDir, scriptName, args = [] }) => {
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
            type: "text", 
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
            type: "text", 
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
            type: "text", 
            text: "Permission denied by user" 
          }]
        };
      }
      
      // Execute the npm script
      const { stdout, stderr } = await execAsync(command, { cwd: absPath });
      
      return {
        content: [
          { 
            type: "text", 
            text: stdout || "Script executed successfully with no output" 
          },
          ...(stderr ? [{ 
            type: "text", 
            text: `Standard Error: ${stderr}` 
          }] : [])
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ 
          type: "text", 
          text: `Error executing npm script: ${errorMessage}` 
        }]
      };
    }
  }
);

// Tool to run Node with the --eval flag
server.tool(
  "run-node-eval",
  "Execute JavaScript code directly with Node.js eval",
  {
    code: z.string().describe("JavaScript code to execute"),
  },
  async ({ code }) => {
    try {
      // Format command for permission request
      // We're showing a simplified version in the permission dialog
      const displayCode = code.length > 50 ? code.substring(0, 47) + "..." : code;
      
      // Ask for permission
      const permitted = await askPermission(`node --eval "${displayCode}"`);
      
      if (!permitted) {
        return {
          isError: true,
          content: [{ 
            type: "text", 
            text: "Permission denied by user" 
          }]
        };
      }
      
      // Create a temporary file with the code
      const tempFilePath = path.join(process.cwd(), `temp-${Date.now()}.js`);
      await fs.writeFile(tempFilePath, code);
      
      try {
        // Execute the code
        const { stdout, stderr } = await execAsync(`node ${tempFilePath}`);
        
        return {
          content: [
            { 
              type: "text", 
              text: stdout || "Code executed successfully with no output" 
            },
            ...(stderr ? [{ 
              type: "text", 
              text: `Standard Error: ${stderr}` 
            }] : [])
          ]
        };
      } finally {
        // Clean up the temporary file
        try {
          await fs.unlink(tempFilePath);
        } catch (error) {
          console.error("Error removing temporary file:", error);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ 
          type: "text", 
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
  async (uri, { directory }) => {
    try {
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

try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Node Runner MCP Server running");
} catch (error) {
  console.error("Error starting server:", error);
  process.exit(1);
}
