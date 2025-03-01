// Example script to demonstrate standard input processing
// Usage:
// 1. Either run with a file: cat some-file.txt | node stdin-example.js
// 2. Or run with direct input: echo "test data" | node stdin-example.js
// 3. Or run via MCP: run-node-script with stdin parameter

import { createInterface } from 'readline';

console.log('Stdin Example: Process text and count words, lines, chars');
console.log('------------------------------------------------------');

// Set up a function to process input
async function processInput() {
  return new Promise((resolve) => {
    // Use process.argv[2] if available (passed via arguments)
    if (process.argv.length > 2) {
      const text = process.argv.slice(2).join(' ');
      console.log('Input from arguments:');
      analyzeText(text);
      resolve();
      return;
    }
    
    // Otherwise read from stdin
    let inputText = '';
    
    process.stdin.on('data', (chunk) => {
      inputText += chunk.toString();
    });
    
    process.stdin.on('end', () => {
      if (inputText.trim().length > 0) {
        console.log('Input from stdin:');
        analyzeText(inputText);
      } else {
        console.log('No input received from stdin.');
      }
      resolve();
    });
    
    // Set a timeout in case stdin doesn't get any data
    setTimeout(() => {
      if (inputText.trim().length === 0) {
        console.log('Timeout: No input received after 2 seconds.');
        resolve();
      }
    }, 2000);
  });
}

// Text analysis function
function analyzeText(text) {
  const chars = text.length;
  const words = text.trim().split(/\s+/).length;
  const lines = text.split('\n').length;
  
  console.log('--- Analysis ---');
  console.log(`Characters: ${chars}`);
  console.log(`Words: ${words}`);
  console.log(`Lines: ${lines}`);
  
  console.log('\n--- Text Sample ---');
  if (text.length > 100) {
    console.log(text.substring(0, 100) + '...');
  } else {
    console.log(text);
  }
}

// Run the process
processInput().catch(console.error);
