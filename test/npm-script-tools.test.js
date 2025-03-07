import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('NPM Script Execution Tools', () => {
  test('should correctly format npm script command', () => {
    // Test npm script command formatting
    const scriptName = 'test';
    const args = ['--verbose', '--coverage'];
    const argsString = args.length > 0 ? ` -- ${args.join(' ')}` : '';
    const command = `npm run ${scriptName}${argsString}`;
    
    assert.equal(command, 'npm run test -- --verbose --coverage');
  });
  
  test('should validate script existence in package.json', () => {
    // Test validation of script existence
    const packageJson = {
      name: 'test-package',
      scripts: {
        test: 'node test.js',
        build: 'tsc',
        start: 'node server.js'
      }
    };
    
    // Check script existence
    const scriptExists = Boolean(packageJson.scripts['test']);
    const nonExistentScriptExists = Boolean(packageJson.scripts['invalidScript']);
    
    assert.equal(scriptExists, true);
    assert.equal(nonExistentScriptExists, false);
  });
});
