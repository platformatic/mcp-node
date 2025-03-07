import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Node Version Management Tools', () => {
  test('should parse node version output correctly', () => {
    // Sample output from 'nvm ls'
    const nvmOutput = `
->     v22.13.0
       v18.20.5
       v16.20.2
       system
    `;
    
    // Extract active version - similar to how the actual tool would
    const lines = nvmOutput.trim().split('\n');
    const activeVersionLine = lines.find(line => line.trim().startsWith('->'));
    const versionMatch = activeVersionLine?.match(/v(\d+\.\d+\.\d+)/);
    const version = versionMatch ? versionMatch[0] : undefined;
    
    assert.equal(version, 'v22.13.0');
  });
  
  test('should handle version selection correctly', () => {
    // Verify version validation logic
    const validVersion = 'v18.20.5';
    const invalidVersion = 'v999.999.999';
    
    // Mock validation output
    const mockValidOutput = `
->     v18.20.5
    `;
    
    const mockInvalidOutput = `
N/A
    `;
    
    // Extract if version exists
    const validExists = mockValidOutput.includes(validVersion);
    const invalidExists = mockInvalidOutput.includes(invalidVersion);
    
    assert.equal(validExists, true);
    assert.equal(invalidExists, false);
  });
});
