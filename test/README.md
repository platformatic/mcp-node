# MCP Node Tests

This directory contains unit and integration tests for the MCP Node implementation. The tests use the Node.js built-in test framework (`node:test`).

## Running Tests

To run all tests:

```bash
npm test
```

To run a specific test file:

```bash
node --test test/server.test.js
```

## Test Files

- **server.test.js**: Tests the basic MCP server functionality, including server creation, tool and resource registration.

- **node-version-tools.test.js**: Tests the Node.js version management tools (`list-node-versions`, `select-node-version`, `get-node-version`).

- **node-execution-tools.test.js**: Tests the Node.js execution tools (`run-node-script`, `run-node-eval`).

- **npm-script-tools.test.js**: Tests the npm script execution tool (`run-npm-script`).

- **permission-handler.test.js**: Tests the permission handling functionality using node-notifier.

- **resources.test.js**: Tests the resource handling functionality, specifically the `npm-scripts` resource.

- **integration.test.js**: Higher-level integration tests that verify the interaction between different components.

## Test Approach

Since the MCP Node is implemented as a standalone server with its own lifecycle, most tests use mocking to test individual components. This allows us to test the functionality without having to start the entire server.

The tests use:

- Node's native test framework (`node:test`)
- Mock functions and methods to isolate dependencies
- Environment variables (e.g., `DISABLE_NOTIFICATIONS=true`) to control behavior

## Adding More Tests

When adding new tests, follow these guidelines:

1. Create a new test file for each major component or feature
2. Use mocking to isolate dependencies
3. Test both success and failure paths
4. Use descriptive test names
5. Add comments to explain complex test setups
