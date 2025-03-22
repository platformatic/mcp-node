import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "node:os";
import { execAsync, askPermission, getSelectedNodeVersion } from "../utils/helpers.js";
import { ExecOptionsWithInput } from "../types/index.js";

export function registerScriptTools(server: McpServer): void {
  // Tool to run a Node.js script
  server.tool(
    "run-node-script",
    "Execute a Node.js script file locally",
    {
      scriptPath: z.string().describe("Path to the Node.js script to execute, this should be present on disk"),
      nodeArgs: z.array(z.string()).optional().describe("Optional arguments to pass to the Node.js executable itselfm, like --test"),
      args: z.array(z.string()).optional().describe("Optional arguments to pass to the script"),
      stdin: z.string().optional().describe("Optional input to provide to the script's standard input"),
      cwd: z.string().optional().describe("Directory to run the script in (current working directory)"),
      timeout: z.number().optional().describe("Timeout in milliseconds after which the process is killed")
    },
    async ({ scriptPath, nodeArgs = [], args = [], stdin, cwd, timeout }) => {
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
        const nodeArgsString = nodeArgs.length > 0 ? nodeArgs.join(' ') + ' ' : '';
        const argsString = args.length > 0 ? ' ' + args.join(' ') : '';
        const command = `node ${nodeArgsString}${absPath}${argsString}`;
        
        // Get working directory for permission message
        const workingDir = cwd ? path.resolve(cwd) : os.tmpdir();

        // Ask for permission
        let permitted = false;
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
          
          // Include stdin and working directory info in permission request
          let permissionMessage = `${command} (in ${workingDir})`;
          if (stdin !== undefined) {
            permissionMessage += " with provided standard input";
          }
          
          permitted = await askPermission(permissionMessage);
        }
        
        // Execute the script with the selected Node.js version if one is set
        let execCommand = command;
        let execOptions: ExecOptionsWithInput = {
          timeout: timeout || 60000, // Use provided timeout or default to 1 minute
          cwd: cwd ? path.resolve(cwd) : os.tmpdir()
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
            // First get the path to the correct node binary
            const { stdout: nodePath } = await execAsync(
              `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedVersion} > /dev/null && which node"`
            );
            
            // Now use that specific node binary path directly
            execCommand = `${nodePath.trim()} ${nodeArgsString}${absPath}${argsString}`;
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

  // Tool to run Node with the --eval flag
  server.tool(
    "run-node-eval",
    "Execute JavaScript code directly with Node.js eval. Optionally specify a directory to execute in.",
    {
      code: z.string().describe("JavaScript code to execute"),
      evalDirectory: z.string().optional().describe("Directory to execute the code in (must be an allowed directory)"),
      stdin: z.string().optional().describe("Optional input to provide to the script's standard input"),
      timeout: z.number().optional().describe("Timeout in milliseconds after which the process is killed")
    },
    async ({ code, evalDirectory, stdin, timeout }) => {
      try {
        // Determine execution directory - use os.tmpdir() for the default
        const tmpDir = os.tmpdir();
        let executionDir = tmpDir;
        
        if (evalDirectory) {
          // Prevent directory traversal attempts by checking for '..' segments
          if (evalDirectory.includes('..')) {
            return {
              isError: true,
              content: [{ 
                type: "text" as const, 
                text: "Error: Directory traversal is not allowed. Path cannot contain '..'" 
              }]
            };
          }

          // Resolve the absolute path
          const absPath = path.resolve(evalDirectory);
          
          // Add a second check on the normalized path to catch any normalized traversal
          if (path.normalize(absPath).includes('..')) {
            return {
              isError: true,
              content: [{ 
                type: "text" as const, 
                text: "Error: Directory traversal is not allowed in the resolved path" 
              }]
            };
          }
          
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
        let permissionMessage = `Execute JavaScript code (in ${executionDir})`;
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
        
        // Create a temporary file for the code instead of using --eval directly
        // This approach handles multiline code and special characters better
        const timestamp = Date.now();
        const tempFilePath = path.join(tmpDir, `node-eval-${timestamp}.js`);
        
        try {
          // Write the code to the temporary file
          await fs.writeFile(tempFilePath, code, 'utf8');
          
          // Build the command to execute the temp file
          let execCommand = `node "${tempFilePath}"`;
          
          const selectedVersion = getSelectedNodeVersion();
          if (selectedVersion) {
            execCommand = `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedVersion} && ${execCommand}"`;
          }
          
          // Setup options with stdin if provided
          const execOptions: ExecOptionsWithInput = { 
            cwd: executionDir,
            timeout: timeout || 5000 // Use provided timeout or default to 5 seconds
          };
          if (stdin !== undefined) {
            execOptions.input = stdin;
          }
          
          const { stdout, stderr } = await execAsync(execCommand, execOptions);
          
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
        } finally {
          // Clean up the temporary file
          try {
            await fs.unlink(tempFilePath);
          } catch (err) {
            console.error(`Failed to clean up temporary file ${tempFilePath}:`, err);
          }
        }
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
}
