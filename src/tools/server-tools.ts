import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import { spawn } from "child_process";
import { execAsync, askPermission, runningServers, generateServerId, selectedNodeVersion } from "../utils/helpers.js";

export function registerServerTools(server: McpServer): void {
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
}
