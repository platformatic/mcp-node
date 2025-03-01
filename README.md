# Node Runner MCP Server

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)

An MCP server that allows you to run Node.js scripts and npm commands, with permission prompts via [`node-notifier`](https://www.npmjs.com/package/node-notifier).

## Requirements

- Node.js >= 22.0.0

## Features

- Run Node.js scripts with arguments and standard input
- Execute npm scripts from package.json files with standard input
- Run JavaScript code directly with Node's eval and provide standard input
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
      "args": ["-y", "mcp-node"],
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

### run-node-script

Executes a Node.js script file.

Parameters:
- `scriptPath`: Path to the Node.js script to execute
- `nodeArgs`: (Optional) Arguments to pass to the Node.js executable itself
- `args`: (Optional) Array of arguments to pass to the script
- `stdin`: (Optional) Text to provide as standard input to the script

Example prompt: "Run the test.js script with arguments 'hello' and 'world'"

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

You can execute this with standard input:

```
run-node-script({
  scriptPath: "./process-data.js",
  stdin: "This is input data"
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
const fileContent = read_file({ path: "./data.txt" });

// Then pass it as standard input to a script
run-node-script({
  scriptPath: "./process-data.js",
  stdin: fileContent
});
```


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
