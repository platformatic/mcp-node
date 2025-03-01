// A simple script that counts characters, words and lines in stdin
const process = require('process');

let data = '';

// Capture stdin
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  data += chunk;
});

// Process when stdin closes
process.stdin.on('end', () => {
  // Count statistics
  const chars = data.length;
  const words = data.trim().split(/\s+/).length;
  const lines = data.trim().split('\n').length;
  
  console.log(`Characters: ${chars}`);
  console.log(`Words: ${words}`);
  console.log(`Lines: ${lines}`);
});

// If stdin doesn't provide data within a timeout, assume no input and exit
setTimeout(() => {
  if (data === '') {
    console.log('No stdin input received within timeout');
    process.exit(1);
  }
}, 1000);
