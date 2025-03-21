import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec, spawn, ExecOptions as ChildProcessExecOptions } from "child_process";
import { ChildProcess } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "node:os";
import notifier from "node-notifier";

const execAsync = promisify(exec);

// Variable to store the currently selected Node.js version
let selectedNodeVersion: string | null = null;

// Map to store running servers
interface ServerInfo {
  process: ChildProcess;
  name: string;
  command: string;
  pid: number;
  startTime: Date;
  logs: string[];
  exitCode: number | null;
}

const runningServers = new Map<string, ServerInfo>();

// Generate a unique ID for servers
function generateServerId(): string {
  return `server-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

// Define our extended options interface
interface ExecOptionsWithInput extends ChildProcessExecOptions {
  input?: string;
}

// Create an MCP server
const server = new McpServer({
  name: "NodeRunner",
  version: "1.0.0"
});

/**
 * Helper function to ask for permission using node-notifier
 */
async function askPermission(action: string): Promise<boolean> {
  // Skip notification if DISABLE_NOTIFICATIONS is set
  if (process.env.DISABLE_NOTIFICATIONS === 'true') {
    console.log(`Auto-allowing action (notifications disabled): ${action}`);
    return true;
  }
  
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
      resolve(buttonPressed !== 'Deny');
    });
  });
}

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
      
      // Store the selected version
      selectedNodeVersion = version;
      
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
      let execEnv = {};
      
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

// Tool to run a Node.js script
server.tool(
  "run-node-script",
  "Execute a Node.js script file locally",
  {
    scriptPath: z.string().describe("Path to the Node.js script to execute, this should be present on disk"),
    nodeArgs: z.array(z.string()).optional().describe("Optional arguments to pass to the Node.js executable itselfm, like --test"),
    args: z.array(z.string()).optional().describe("Optional arguments to pass to the script"),
    stdin: z.string().optional().describe("Optional input to provide to the script's standard input"),
    cwd: z.string().optional().describe("Directory to run the script in (current working directory)")
  },
  async ({ scriptPath, nodeArgs = [], args = [], stdin, cwd }) => {
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
        timeout: 60000, // 1 minute timeout
        cwd: cwd ? path.resolve(cwd) : os.tmpdir()
      };
      
      // If stdin is provided, add it to exec options
      if (stdin !== undefined) {
        execOptions.input = stdin;
      }
      
      // Handle NVM usage differently if stdin is provided
      if (selectedNodeVersion) {
        if (stdin !== undefined) {
          // For stdin, we need to use a different approach
          // First get the path to the correct node binary
          const { stdout: nodePath } = await execAsync(
            `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedNodeVersion} > /dev/null && which node"`
          );
          
          // Now use that specific node binary path directly
          execCommand = `${nodePath.trim()} ${nodeArgsString}${absPath}${argsString}`;
        } else {
          // Without stdin, use the bash -c approach
          execCommand = `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedNodeVersion} && ${command}"`;
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
      if (selectedNodeVersion) {
        if (stdin !== undefined) {
          // For stdin, we need to use a different approach
          // First get the path to the correct node binary and npm
          const { stdout: nodePath } = await execAsync(
            `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedNodeVersion} > /dev/null && which node"`
          );
          const { stdout: npmPath } = await execAsync(
            `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedNodeVersion} > /dev/null && which npm"`
          );
          
          // Now use npm directly with the full path
          execCommand = `${npmPath.trim()} run ${scriptName}${argsString}`;
        } else {
          // Without stdin, use the bash -c approach
          execCommand = `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedNodeVersion} && ${command}"`;
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
      if (selectedNodeVersion) {
        // Get the path to npm from the selected Node version
        const { stdout: npmPath } = await execAsync(
          `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedNodeVersion} > /dev/null && which npm"`
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

// Tool to run Node with the --eval flag
server.tool(
  "run-node-eval",
  "Execute JavaScript code directly with Node.js eval. Optionally specify a directory to execute in.",
  {
    code: z.string().describe("JavaScript code to execute"),
    evalDirectory: z.string().optional().describe("Directory to execute the code in (must be an allowed directory)"),
    stdin: z.string().optional().describe("Optional input to provide to the script's standard input")
  },
  async ({ code, evalDirectory, stdin }) => {
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
      let permissionMessage = `node --eval "${displayCode}" (in ${executionDir})`;
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
      
      // Execute the code directly using --eval with the selected Node.js version if one is set
      // Escaping the code properly for the shell command
      const escapedCode = code.replace(/"/g, '\\"');
      let execCommand = `node --eval "${escapedCode}"`;
      
      if (selectedNodeVersion) {
        execCommand = `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedNodeVersion} && ${execCommand}"`;
      }
      
      // Setup options with stdin if provided
      const execOptions: ExecOptionsWithInput = { 
        cwd: executionDir,
        timeout: 5000 // 5 second timeout
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

// Tool to start a Node.js server in the background
server.tool(
  "start-node-server",
  "Start a Node.js server that continues running in the background",
  {
    scriptPath: z.string().describe("Path to the Node.js server script to execute"),
    cwd: z.string().describe("Directory to run the server in"),
    serverName: z.string().optional().describe("Optional friendly name for the server (defaults to filename)"),
    nodeArgs: z.array(z.string()).optional().describe("Optional arguments to pass to the Node.js executable itself"),
    args: z.array(z.string()).optional().describe("Optional arguments to pass to the server script")
  },
  async ({ scriptPath, serverName, nodeArgs = [], args = [], cwd }) => {
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
      
      // Get working directory
      const workingDir = path.resolve(cwd);
      
      // Generate a server name if not provided
      const displayName = serverName || path.basename(absPath);
      
      // Ask for permission
      const permissionMessage = `Start server: ${displayName}\nCommand: ${command}\nWorking directory: ${workingDir}`;
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
      
      // Generate a unique ID for this server instance
      const serverId = generateServerId();
      
      // Prepare the environment for the child process
      const env = { ...process.env };
      
      // If we have a selected Node.js version, get its bin path for running the server
      let nodeBin = 'node';
      if (selectedNodeVersion) {
        try {
          // Get the path to the selected Node.js binary
          const { stdout } = await execAsync(
            `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedNodeVersion} > /dev/null && which node"`
          );
          nodeBin = stdout.trim();
        } catch (error) {
          return {
            isError: true,
            content: [{ 
              type: "text" as const, 
              text: `Error getting Node.js binary path: ${error instanceof Error ? error.message : String(error)}` 
            }]
          };
        }
      }
      
      // Start the server as a detached process
      const serverProcess = spawn(
        nodeBin,
        [...nodeArgs, absPath, ...args],
        {
          cwd: workingDir,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false // Not fully detaching so we can still manage the process
        }
      );
      
      // Initialize the logs array
      const logs: string[] = [];
      const maxLogs = 1000; // Limit log storage
      
      // Capture output
      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        logs.push(`[stdout] ${output}`);
        if (logs.length > maxLogs) {
          logs.shift(); // Remove oldest log if exceeding limit
        }
      });
      
      serverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        logs.push(`[stderr] ${output}`);
        if (logs.length > maxLogs) {
          logs.shift(); // Remove oldest log if exceeding limit
        }
      });
      
      // Store information about the running server
      runningServers.set(serverId, {
        process: serverProcess,
        name: displayName,
        command,
        pid: serverProcess.pid || 0, // Default to 0 if pid is undefined
        startTime: new Date(),
        logs,
        exitCode: null
      });
      
      // Handle server exit
      serverProcess.on('exit', (code) => {
        if (runningServers.has(serverId)) {
          const serverInfo = runningServers.get(serverId)!;
          serverInfo.exitCode = code;
          // Keep the server in the map for a while so its info can still be retrieved
          setTimeout(() => {
            runningServers.delete(serverId);
          }, 3600000); // Remove after 1 hour
        }
      });
      
      return {
        content: [{ 
          type: "text" as const, 
          text: `Server started successfully!\n\nServer ID: ${serverId}\nName: ${displayName}\nPID: ${serverProcess.pid}\nCommand: ${command}\nWorking directory: ${workingDir}\n\nYou can view server status with the list-servers tool and stop it with the stop-server tool.` 
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ 
          type: "text" as const, 
          text: `Error starting server: ${errorMessage}` 
        }]
      };
    }
  }
);

// Tool to list all running servers
server.tool(
  "list-servers",
  "List all running Node.js servers started via MCP",
  {
    showLogs: z.boolean().optional().describe("Whether to include recent logs (default: false)"),
    serverId: z.string().optional().describe("Optional server ID to get details for a specific server")
  },
  async ({ showLogs = false, serverId }) => {
    try {
      // If no servers are running
      if (runningServers.size === 0) {
        return {
          content: [{ 
            type: "text" as const, 
            text: "No servers are currently running." 
          }]
        };
      }
      
      // If a specific server ID is provided
      if (serverId) {
        const server = runningServers.get(serverId);
        if (!server) {
          return {
            isError: true,
            content: [{ 
              type: "text" as const, 
              text: `Server with ID ${serverId} not found.` 
            }]
          };
        }
        
        // Calculate uptime
        const uptime = Math.floor((new Date().getTime() - server.startTime.getTime()) / 1000);
        const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`;
        
        // Build server detail information
        let serverDetail = `Server ID: ${serverId}\n`;
        serverDetail += `Name: ${server.name}\n`;
        serverDetail += `PID: ${server.pid}\n`;
        serverDetail += `Command: ${server.command}\n`;
        serverDetail += `Started: ${server.startTime.toLocaleString()}\n`;
        serverDetail += `Uptime: ${uptimeStr}\n`;
        serverDetail += `Status: ${server.exitCode === null ? 'Running' : `Exited with code ${server.exitCode}`}\n`;
        
        // Include recent logs if requested
        if (showLogs && server.logs.length > 0) {
          const recentLogs = server.logs.slice(-20).join('\n'); // Show last 20 log entries
          serverDetail += `\nRecent logs:\n${recentLogs}`;
        }
        
        return {
          content: [{ 
            type: "text" as const, 
            text: serverDetail 
          }]
        };
      }
      
      // List all servers
      let serversList = `Found ${runningServers.size} running server(s):\n\n`;
      
      const serverEntries = Array.from(runningServers.entries());
      for (const [id, server] of serverEntries) {
        // Calculate uptime
        const uptime = Math.floor((new Date().getTime() - server.startTime.getTime()) / 1000);
        const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`;
        
        serversList += `ID: ${id}\n`;
        serversList += `Name: ${server.name}\n`;
        serversList += `PID: ${server.pid}\n`;
        serversList += `Started: ${server.startTime.toLocaleString()}\n`;
        serversList += `Uptime: ${uptimeStr}\n`;
        serversList += `Status: ${server.exitCode === null ? 'Running' : `Exited with code ${server.exitCode}`}\n`;
        
        // Include a few recent logs if requested
        if (showLogs && server.logs.length > 0) {
          const recentLogs = server.logs.slice(-5).join('\n'); // Show last 5 log entries
          serversList += `Recent logs:\n${recentLogs}\n`;
        }
        
        serversList += `\n`; // Add separator between servers
      }
      
      return {
        content: [{ 
          type: "text" as const, 
          text: serversList 
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ 
          type: "text" as const, 
          text: `Error listing servers: ${errorMessage}` 
        }]
      };
    }
  }
);

// Tool to stop a running server
server.tool(
  "stop-server",
  "Stop a running Node.js server",
  {
    serverId: z.string().describe("ID of the server to stop"),
    force: z.boolean().optional().describe("Whether to force kill the server (SIGKILL instead of SIGTERM)")
  },
  async ({ serverId, force = false }) => {
    try {
      // Check if the server exists
      if (!runningServers.has(serverId)) {
        return {
          isError: true,
          content: [{ 
            type: "text" as const, 
            text: `Server with ID ${serverId} not found.` 
          }]
        };
      }
      
      const serverInfo = runningServers.get(serverId)!;
      
      // Check if the server has already exited
      if (serverInfo.exitCode !== null) {
        return {
          content: [{ 
            type: "text" as const, 
            text: `Server with ID ${serverId} (${serverInfo.name}) has already exited with code ${serverInfo.exitCode}.` 
          }]
        };
      }
      
      // Ask for permission
      const permissionMessage = `Stop server: ${serverInfo.name} (PID: ${serverInfo.pid})${force ? ' with force' : ''}`;
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
      
      // Stop the server
      if (force) {
        serverInfo.process.kill('SIGKILL');
      } else {
        serverInfo.process.kill('SIGTERM');
      }
      
      // Wait for the process to exit (with a timeout)
      const timeout = 5000; // 5 seconds timeout
      const exitPromise = new Promise<number | null>((resolve) => {
        // If the process has already exited
        if (serverInfo.exitCode !== null) {
          resolve(serverInfo.exitCode);
          return;
        }
        
        // Set up a one-time exit listener
        const exitListener = (code: number | null) => {
          serverInfo.exitCode = code;
          resolve(code);
        };
        
        serverInfo.process.once('exit', exitListener);
        
        // Set a timeout to resolve if the process doesn't exit
        setTimeout(() => {
          serverInfo.process.removeListener('exit', exitListener);
          if (serverInfo.exitCode === null) {
            resolve(null); // Process didn't exit within timeout
          }
        }, timeout);
      });
      
      const exitCode = await exitPromise;
      
      if (exitCode === null) {
        // If the server didn't exit within the timeout and force wasn't used initially
        if (!force) {
          // Ask for permission to force kill
          const forcePermissionMessage = `Server ${serverInfo.name} (PID: ${serverInfo.pid}) didn't exit within timeout. Force kill?`;
          const forcePermitted = await askPermission(forcePermissionMessage);
          
          if (forcePermitted) {
            serverInfo.process.kill('SIGKILL');
            return {
              content: [{ 
                type: "text" as const, 
                text: `Server with ID ${serverId} (${serverInfo.name}) has been forcibly terminated.` 
              }]
            };
          } else {
            return {
              content: [{ 
                type: "text" as const, 
                text: `Server with ID ${serverId} (${serverInfo.name}) did not exit within the timeout. You may try again with the force option.` 
              }]
            };
          }
        } else {
          return {
            content: [{ 
              type: "text" as const, 
              text: `Server with ID ${serverId} (${serverInfo.name}) did not exit even after SIGKILL. The process may have become unresponsive at the OS level.` 
            }]
          };
        }
      }
      
      // Keep the server info in the map for a while, but mark it as exited
      setTimeout(() => {
        runningServers.delete(serverId);
      }, 3600000); // Remove after 1 hour
      
      return {
        content: [{ 
          type: "text" as const, 
          text: `Server with ID ${serverId} (${serverInfo.name}) has been stopped with exit code ${exitCode}.` 
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ 
          type: "text" as const, 
          text: `Error stopping server: ${errorMessage}` 
        }]
      };
    }
  }
);

// Tool to get logs from a server
server.tool(
  "get-server-logs",
  "Get the last N lines of logs from a running server",
  {
    serverId: z.string().describe("ID of the server to get logs from"),
    lines: z.number().optional().describe("Number of log lines to retrieve (default: 50)"),
    filter: z.string().optional().describe("Optional string to filter logs (case-insensitive)"),
    stdout: z.boolean().optional().describe("Show stdout logs (default: true)"),
    stderr: z.boolean().optional().describe("Show stderr logs (default: true)")
  },
  async ({ serverId, lines = 50, filter, stdout = true, stderr = true }) => {
    try {
      // Check if the server exists
      if (!runningServers.has(serverId)) {
        return {
          isError: true,
          content: [{ 
            type: "text" as const, 
            text: `Server with ID ${serverId} not found.` 
          }]
        };
      }
      
      const serverInfo = runningServers.get(serverId)!;
      
      // Filter the logs
      let filteredLogs = serverInfo.logs.filter(log => {
        // Filter by output type (stdout/stderr)
        if (!stdout && log.startsWith('[stdout]')) return false;
        if (!stderr && log.startsWith('[stderr]')) return false;
        
        // Filter by content if specified
        if (filter) {
          return log.toLowerCase().includes(filter.toLowerCase());
        }
        
        return true;
      });
      
      // Get the last N lines
      filteredLogs = filteredLogs.slice(-lines);
      
      if (filteredLogs.length === 0) {
        let reason = "No logs available";
        if (filter) reason += ` matching filter "${filter}"`;
        if (!stdout && !stderr) reason += " (both stdout and stderr are disabled)";
        else if (!stdout) reason += " (stdout is disabled)";
        else if (!stderr) reason += " (stderr is disabled)";
        
        return {
          content: [{ 
            type: "text" as const, 
            text: `${reason} for server ${serverInfo.name} (ID: ${serverId}).` 
          }]
        };
      }
      
      // Build the response
      const statusInfo = serverInfo.exitCode === null ? 'Running' : `Exited with code ${serverInfo.exitCode}`;
      
      let response = `=== Logs for server: ${serverInfo.name} (ID: ${serverId}) ===\n`;
      response += `Status: ${statusInfo}\n`;
      response += `Showing ${filteredLogs.length} of ${serverInfo.logs.length} log entries`;
      if (filter) response += ` (filtered by "${filter}")`;
      if (!stdout) response += " (excluding stdout)";
      if (!stderr) response += " (excluding stderr)";
      response += `:\n\n${filteredLogs.join('\n')}`;
      
      return {
        content: [{ 
          type: "text" as const, 
          text: response 
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ 
          type: "text" as const, 
          text: `Error getting server logs: ${errorMessage}` 
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
