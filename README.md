# Node Runner MCP Server

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)

An MCP server that allows you to run Node.js scripts and npm commands, with permission prompts via [`node-notifier`](https://www.npmjs.com/package/node-notifier).

## Requirements

- Node.js >= 22.0.0

## Features

- Run Node.js scripts with arguments and standard input
- Execute npm scripts from package.json files with standard input
- Run JavaScript code directly with Node's eval and provide standard input
- Start Node.js servers that continue running in the background
- List running servers and view their status
- Stop running servers gracefully or forcefully when needed
- Retrieve and filter server logs for debugging and monitoring
- Select specific Node.js versions using NVM
- View available npm scripts in package.json files
- Permission prompts before any execution (can be disabled)

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the TypeScript code:
   ```bash
   npm run build
   ```

## Project Structure

- `src/index.ts` - Main MCP server implementation
- `test.js` - Sample test script to run with the server

## Usage with Claude for Desktop

1. Build the project with `npm run build`
2. Add the server to your Claude for Desktop configuration:

```json
{
  "mcpServers": {
    "node-runner": {
      "command": "npx",
      "args": ["-y", "mcp-node@latest"],
      "env": {
        "DISABLE_NOTIFICATIONS": "true",  // Optional: disable permission prompts
        "EVAL_DIRECTORIES": "/path/to/safe/dir1:/path/to/safe/dir2"  // Optional: additional allowed eval directories
      }
    }
  }
}
```

3. Restart Claude for Desktop
4. You can now ask Claude to run Node.js scripts or npm commands
5. (Optional) Use the `env` configuration to disable notification prompts as shown above

## Available Tools

### start-node-server

Starts a Node.js server that continues running in the background, even after the command completes.

Parameters:
- `scriptPath`: Path to the Node.js server script to execute
- `cwd`: Directory to run the server in
- `serverName`: (Optional) Friendly name for the server (defaults to the script filename)
- `nodeArgs`: (Optional) Arguments to pass to the Node.js executable itself
- `args`: (Optional) Array of arguments to pass to the server script

Example prompt: "Start an Express server from server.js and keep it running"

Example usage:
```javascript
start-node-server({
  scriptPath: "/absolute/path/to/server.js",
  cwd: "/absolute/path/to/project",
  serverName: "My Express API",
  args: ["--port", "3000"]
});
```

### list-servers

Lists all running Node.js servers started via the MCP server.

Parameters:
- `showLogs`: (Optional) Boolean to include recent logs in the output (default: false)
- `serverId`: (Optional) Server ID to get details for a specific server

Example prompt: "Show me all running Node.js servers"

Example to view detailed logs for a specific server:
```javascript
list-servers({
  serverId: "server-1234567890-1234",
  showLogs: true
});
```

### stop-server

Stops a running Node.js server.

Parameters:
- `serverId`: ID of the server to stop
- `force`: (Optional) Boolean to force kill the server with SIGKILL instead of SIGTERM (default: false)

Example prompt: "Stop the Node.js server with ID server-1234567890-1234"

Example to forcefully terminate a server:
```javascript
stop-server({
  serverId: "server-1234567890-1234",
  force: true
});
```

### get-server-logs

Retrieves the last N lines of logs from a running server with filtering options. This tool is essential for debugging and monitoring server behavior without having to stop it.

Parameters:
- `serverId`: ID of the server to get logs from
- `lines`: (Optional) Number of log lines to retrieve (default: 50)
- `filter`: (Optional) String to filter logs (case-insensitive)
- `stdout`: (Optional) Boolean to include stdout logs (default: true)
- `stderr`: (Optional) Boolean to include stderr logs (default: true)

Key features:
- Retrieves logs from both running and exited servers
- Filters logs to show only stdout or stderr as needed
- Searches for specific text within logs
- Shows server status alongside the logs
- Limits output to exactly the number of lines requested

Example prompt: "Show me the last 100 logs from the server with ID server-1234567890-1234"

Example to view only error output:
```javascript
get-server-logs({
  serverId: "server-1234567890-1234",
  stderr: true,
  stdout: false
});
```

Example with text filtering:
```javascript
get-server-logs({
  serverId: "server-1234567890-1234",
  lines: 100,
  filter: "error"
});
```

### run-node-script

Executes a Node.js script file.

Parameters:
- `scriptPath`: Path to the Node.js script to execute
- `nodeArgs`: (Optional) Arguments to pass to the Node.js executable itself
- `args`: (Optional) Array of arguments to pass to the script
- `stdin`: (Optional) Text to provide as standard input to the script
- `cwd`: (Optional) Directory to run the script in (defaults to OS temp directory if not specified)

Example prompt: "Run the test.js script with arguments 'hello' and 'world'"

Example with working directory:
```javascript
run-node-script({
  scriptPath: "/absolute/path/to/my-script.js",
  args: ["arg1", "arg2"],
  cwd: "/absolute/path/to/project"
});
```

### run-npm-script

Executes an npm script from a package.json file.

Parameters:
- `packageDir`: Directory containing the package.json
- `scriptName`: Name of the script to run
- `args`: (Optional) Array of arguments to pass to the script
- `stdin`: (Optional) Text to provide as standard input to the script

Example prompt: "Run the 'start' script from the package.json in the current directory"

### run-node-eval

Executes JavaScript code directly.

Parameters:
- `code`: JavaScript code to execute
- `evalDirectory`: (Optional) Directory to execute the code in
- `stdin`: (Optional) Text to provide as standard input to the code

Example prompt: "Run this JavaScript code: console.log('Hello world');"

### list-node-versions

Lists all available Node.js versions installed via NVM (Node Version Manager).

Parameters: None

Example prompt: "Show me all installed Node.js versions"

### select-node-version

Selects a specific Node.js version to use for subsequent script executions.

Parameters:
- `version`: Node.js version to use (e.g., 'v18.20.5', 'system', 'lts/*', or other NVM aliases)

Example prompt: "Use Node.js version 18 for running scripts"

### get-node-version

Displays information about the currently selected Node.js version.

Parameters: None

Example prompt: "What Node.js version is currently being used?"

## Examples of Using Standard Input

### Passing Input to a Node Script

```javascript
// Example script: process-data.js
process.stdin.on('data', (data) => {
  const input = data.toString().trim();
  console.log(`Received: ${input}`);
  // Process the input...
});
```

You can execute this with standard input and a specific working directory:

```
run-node-script({
  scriptPath: "/absolute/path/to/process-data.js",
  stdin: "This is input data",
  cwd: "/absolute/path/to/my-project-directory"  // Sets the working directory for the script
});
```

### Using Standard Input with Eval

```
run-node-eval({
  code: `
    let data = '';
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { 
      console.log('Received:', data);
    });
  `,
  stdin: "Data to process"
});
```

### Reading a File Then Using It As Standard Input

```
// First read the file
const fileContent = read_file({ path: "/absolute/path/to/data.txt" });

// Then pass it as standard input to a script
run-node-script({
  scriptPath: "/absolute/path/to/process-data.js",
  stdin: fileContent,
  cwd: "/absolute/path/to/working-directory"
});
```


## Server Management and Monitoring

This MCP server provides a complete solution for running and monitoring Node.js servers in the background:

1. **Starting Servers**: Use `start-node-server` to launch servers that keep running even after the command completes.

2. **Monitoring**: Monitor server logs in real-time with `get-server-logs` to keep track of activity and troubleshoot issues.

3. **Process Management**: View all running servers with `list-servers` and get detailed information about their status.

4. **Graceful Shutdown**: Stop servers gracefully with `stop-server`, preserving any in-flight operations.

### Example Server Monitoring Workflow:

```javascript
// 1. Start a server
const serverInfo = start-node-server({
  scriptPath: "/path/to/server.js",
  cwd: "/path/to/project",
  serverName: "API Server"
});

// Extract server ID from the response
const serverId = serverInfo.content[0].text.match(/Server ID: ([\w-]+)/)[1];

// 2. Monitor logs in real-time (periodic polling)
get-server-logs({
  serverId: serverId,
  lines: 20
});

// 3. Filter logs for errors only
get-server-logs({
  serverId: serverId,
  filter: "error",
  lines: 50
});

// 4. When finished, stop the server
stop-server({
  serverId: serverId
});
```

### Debugging Complex Issues:

When troubleshooting server issues, you can use a combination of tools:

1. Check server status with `list-servers`
2. View filtered logs with `get-server-logs`
3. If the server is unresponsive, force stop it with `stop-server({ serverId, force: true })`

## Resources

### node-version

Displays information about the Node.js environment running the MCP server.

URI template: `node-version://info`

Example prompt: "What version of Node.js is being used to run the scripts?"

### npm-scripts

Lists all available npm scripts in a package.json file.

URI template: `npm-scripts://{directory}`

Example prompt: "Show me the available npm scripts in this project"

## Security Considerations

- The server will always prompt for permission before executing any command
- Scripts run with the same permissions as the MCP server process
- Be cautious when running scripts from untrusted sources

## Environment Variables

### DISABLE_NOTIFICATIONS

Set `DISABLE_NOTIFICATIONS=true` to automatically approve all permission requests without showing notification prompts:

```bash
# Run with notifications disabled
DISABLE_NOTIFICATIONS=true npm run dev
```

This is useful for automation scenarios or when you don't want to be prompted for each action.

### EVAL_DIRECTORIES

Specify a colon-separated list of directories where JavaScript code can be evaluated using the `run-node-eval` tool:

```bash
# Allow code evaluation in specific directories
EVAL_DIRECTORIES=/path/to/dir1:/path/to/dir2 npm run dev
```

By default, only the system temporary directory is allowed. This environment variable lets you add additional safe directories.

## License

MIT
