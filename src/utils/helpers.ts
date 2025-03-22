import { exec } from "child_process";
import { promisify } from "util";
import notifier from "node-notifier";
import { ServerInfo } from "../types/index.js";

// Promisify exec
export const execAsync = promisify(exec);

// Map to store running servers
export const runningServers = new Map<string, ServerInfo>();

// Variable to store the currently selected Node.js version (private)
let _selectedNodeVersion: string | null = null;

// Function to get the currently selected Node.js version
export function getSelectedNodeVersion(): string | null {
  return _selectedNodeVersion;
}

// Function to set the selected Node.js version
export function setSelectedNodeVersion(version: string | null): void {
  _selectedNodeVersion = version;
}

// Generate a unique ID for servers
export function generateServerId(): string {
  return `server-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/**
 * Helper function to ask for permission using node-notifier
 */
export async function askPermission(action: string): Promise<boolean> {
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
