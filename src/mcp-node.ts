import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec, ExecOptions as ChildProcessExecOptions } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "node:os";
import notifier from "node-notifier";

const execAsync = promisify(exec);

// Variable to store the currently selected Node.js version
let selectedNodeVersion: string | null = null;

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
    scriptPath: z.string().describe("Path to the Node.js script to execute"),
    nodeArgs: z.array(z.string()).optional().describe("Optional arguments to pass to the Node.js executable itself"),
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
