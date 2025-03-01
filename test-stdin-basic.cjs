// Basic stdin test script
const process = require('process');

// Set up variables
let input = '';
let hasData = false;

// Listen for stdin data
process.stdin.on('data', (chunk) => {
  hasData = true;
  input += chunk;
  // Process immediately
  console.log("RECEIVED DATA:");
  console.log(chunk.toString());
});

// Set a timeout to make sure we exit
setTimeout(() => {
  if (!hasData) {
    console.log("No stdin data received");
  } else {
    console.log("\n--- SUMMARY ---");
    console.log(`Total characters: ${input.length}`);
    console.log(`Total lines: ${input.split('\n').length}`);
  }
  process.exit(0);
}, 500);

console.log("Waiting for stdin...");
