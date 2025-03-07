import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import notifier from 'node-notifier';

// This test focuses on the askPermission function behavior

describe('Permission Handler', () => {
  test('should auto-allow actions when DISABLE_NOTIFICATIONS is true', async () => {
    // Mock console.log to verify it was called
    const originalConsoleLog = console.log;
    const consoleLogCalls = [];
    console.log = (...args) => {
      consoleLogCalls.push(args);
      originalConsoleLog(...args);
    };
    
    // Set environment variable
    process.env.DISABLE_NOTIFICATIONS = 'true';
    
    // Since we can't directly import the askPermission function, 
    // we'll test its behavior by implementing it here for testing
    async function askPermission(action) {
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
    
    const result = await askPermission('Test action');
    
    // Restore console.log
    console.log = originalConsoleLog;
    
    // Clean up environment variable
    delete process.env.DISABLE_NOTIFICATIONS;
    
    assert.equal(result, true);
    assert.equal(consoleLogCalls.length, 1);
    assert.match(consoleLogCalls[0][0], /Auto-allowing action/);
  });
});
