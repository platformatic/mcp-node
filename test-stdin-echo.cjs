// Super simple test script that just echoes the stdin content
// This script will use process.stdin directly without waiting for an 'end' event

const fs = require('fs');

// Read all of stdin synchronously by listening to the 'readable' event
let input = '';
process.stdin.on('readable', () => {
  const chunk = process.stdin.read();
  if (chunk !== null) {
    input += chunk;
  }
});

// Set a timeout to finish processing after a brief delay
setTimeout(() => {
  console.log('Input received:');
  console.log(input);
  console.log(`Characters: ${input.length}`);
  console.log(`Lines: ${input.split('\n').length - 1}`);
  process.exit(0);
}, 100); // 100ms should be enough time to receive stdin
