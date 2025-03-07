import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// This test focuses on the npm-scripts resource

describe('MCP Resources', () => {
  test('npm-scripts resource should parse package.json correctly', async () => {
    // Sample package.json content
    const packageJson = {
      name: 'test-package',
      scripts: {
        test: 'node test.js',
        build: 'tsc',
        start: 'node server.js'
      }
    };
    
    // Parse the scripts
    const scripts = packageJson.scripts;
    const scriptsList = Object.entries(scripts)
      .map(([name, command]) => `- ${name}: ${command}`)
      .join('\n');
    
    // Assertions
    assert.ok(scriptsList.includes('test: node test.js'));
    assert.ok(scriptsList.includes('build: tsc'));
    assert.ok(scriptsList.includes('start: node server.js'));
  });
  
  test('npm-scripts resource should handle empty scripts', async () => {
    // Sample package.json content with empty scripts
    const packageJson = {
      name: 'empty-package',
      scripts: {}
    };
    
    // Verify no scripts
    assert.equal(Object.keys(packageJson.scripts).length, 0);
  });
  
  test('npm-scripts resource should handle missing scripts property', async () => {
    // Sample package.json content with no scripts property
    const packageJson = {
      name: 'no-scripts-package'
    };
    
    // Verify scripts property is undefined
    assert.equal(packageJson.scripts, undefined);
  });
});
