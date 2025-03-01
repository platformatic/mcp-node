// Quick stdin test
console.log("Standard input test:");
process.stdin.on('data', data => {
  console.log(`Received: ${data.toString().trim()}`);
});

// Always exit after a short delay
setTimeout(() => process.exit(0), 200);
