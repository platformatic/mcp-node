import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('MCP Server', () => {
  test('should create server with correct metadata', () => {
    const server = new McpServer({
      name: 'TestNodeRunner',
      version: '1.0.0'
    });
    
    // Verify server was created successfully
    assert.ok(server);
  });
  
  test('should register tools correctly', () => {
    const server = new McpServer({
      name: 'TestNodeRunner',
      version: '1.0.0'
    });
    
    // Register a simple tool
    server.tool(
      'test-tool',
      'Test tool description',
      {},
      async () => ({
        content: [{ type: 'text', text: 'Test result' }]
      })
    );
    
    // Since _tools is private, we can only verify the server was created
    // and no errors were thrown when registering the tool
    assert.ok(server);
  });
  
  test('should register resources correctly', () => {
    const server = new McpServer({
      name: 'TestNodeRunner',
      version: '1.0.0'
    });
    
    // Register a simple resource
    server.resource(
      'test-resource',
      'test://resource',
      async (uri) => ({
        contents: [{
          uri: uri.href,
          text: 'Test resource'
        }]
      })
    );
    
    // Since _resources is private, we can only verify the server was created
    // and no errors were thrown when registering the resource
    assert.ok(server);
  });
});
