import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import { execAsync, askPermission, getSelectedNodeVersion } from "../utils/helpers.js";
import { ExecOptionsWithInput } from "../types/index.js";

export function registerNpmTools(server: McpServer): void {
  // Tool to run an npm script
  server.tool(
    "run-npm-script",
    "Execute an npm script from package.json",
    {
      packageDir: z.string().describe("Directory containing package.json"),
      scriptName: z.string().describe("Name of the script to run"),
      args: z.array(z.string()).optional().describe("Optional arguments to pass to the script"),
      stdin: z.string().optional().describe("Optional input to provide to the script's standard input")
    },
    async ({ packageDir, scriptName, args = [], stdin }) => {
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
        
        // Ask for permission - include stdin info if provided
        let permissionMessage = `${command} (in ${absPath})`;
        if (stdin !== undefined) {
          permissionMessage += ` with provided standard input`;
        }
        
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
        
        // Execute the npm script with the selected Node.js version if one is set
        let execCommand = command;
        let execOptions: ExecOptionsWithInput = { 
          cwd: absPath,
          timeout: 60000 // 1 minute timeout
        };
        
        // If stdin is provided, add it to exec options
        if (stdin !== undefined) {
          execOptions.input = stdin;
        }
        
        // Handle NVM usage differently if stdin is provided
        const selectedVersion = getSelectedNodeVersion();
        if (selectedVersion) {
          if (stdin !== undefined) {
            // For stdin, we need to use a different approach
            // First get the path to the correct node binary and npm
            const { stdout: nodePath } = await execAsync(
              `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedVersion} > /dev/null && which node"`
            );
            const { stdout: npmPath } = await execAsync(
              `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedVersion} > /dev/null && which npm"`
            );
            
            // Now use npm directly with the full path
            execCommand = `${npmPath.trim()} run ${scriptName}${argsString}`;
          } else {
            // Without stdin, use the bash -c approach
            execCommand = `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedVersion} && ${command}"`;
          }
        }
        
        const { stdout, stderr } = await execAsync(execCommand, execOptions);

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
        // Extract stdout and stderr from the error
        const execError = error as any;
        const stdout = execError.stdout || '';
        const stderr = execError.stderr || '';
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Return a successful response but include both stdout, stderr and error information
        return {
          content: [
            { 
              type: "text" as const, 
              text: stdout || "Script execution returned with error code" 
            },
            { 
              type: "text" as const, 
              text: `Standard Error: ${stderr}\nError: ${errorMessage}` 
            }
          ]
        };
      }
    }
  );

  // Tool to run npm install
  server.tool(
    "run-npm-install",
    "Execute npm install to install all dependencies or a specific package",
    {
      packageDir: z.string().describe("Directory containing package.json"),
      dependency: z.string().optional().describe("Optional specific dependency to install (leave empty to install all dependencies from package.json)")
    },
    async ({ packageDir, dependency }) => {
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
        
        // Format command for permission request
        const command = dependency ? `npm install ${dependency}` : `npm install`;
        const permissionMessage = `${command} (in ${absPath})`;
        
        // Ask for permission
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
        
        // Execute npm install with the selected Node.js version if one is set
        let execCommand = command;
        let execOptions: ExecOptionsWithInput = { 
          cwd: absPath,
          timeout: 300000 // 5 minute timeout for potentially long installs
        };
        
        // Handle NVM usage
        const selectedVersion = getSelectedNodeVersion();
        if (selectedVersion) {
          // Get the path to npm from the selected Node version
          const { stdout: npmPath } = await execAsync(
            `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedVersion} > /dev/null && which npm"`
          );
          
          // Use npm directly with the full path
          execCommand = dependency ? 
            `${npmPath.trim()} install ${dependency}` : 
            `${npmPath.trim()} install`;
        }
        
        const { stdout, stderr } = await execAsync(execCommand, execOptions);

        return {
          content: [
            { 
              type: "text" as const, 
              text: stdout || "npm install executed successfully with no output" 
            },
            ...(stderr ? [{ 
              type: "text" as const, 
              text: `Standard Error: ${stderr}` 
            }] : [])
          ]
        };
      } catch (error) {
        // Extract stdout and stderr from the error
        const execError = error as any;
        const stdout = execError.stdout || '';
        const stderr = execError.stderr || '';
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Return a response with both stdout, stderr and error information
        return {
          isError: true,
          content: [
            { 
              type: "text" as const, 
              text: stdout || "npm install execution failed" 
            },
            { 
              type: "text" as const, 
              text: `Standard Error: ${stderr}\nError: ${errorMessage}` 
            }
          ]
        };
      }
    }
  );
}
