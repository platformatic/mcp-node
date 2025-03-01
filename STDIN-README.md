# Standard Input Support for MCP-Node

The MCP-Node project now supports providing standard input (stdin) to Node.js scripts and eval commands.

## Features Added

- Added `stdin` parameter to all Node.js execution functions:
  - `run-node-script`: Execute a Node.js script file with stdin
  - `run-npm-script`: Execute an npm script with stdin
  - `run-node-eval`: Execute JavaScript code directly with stdin

## Example Usage

### Running a Node.js Script with stdin

```javascript
// Example: Process text from stdin
client.runNodeScript({
  scriptPath: "/path/to/your/script.js",
  stdin: "