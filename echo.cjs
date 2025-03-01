// Super simple echo stdin script using a synchronous method
const fs = require('fs');

try {
  // Read from stdin (fd 0) - blocking/synchronous for simplicity
  const stdinBuffer = fs.readFileSync(0);
  const input = stdinBuffer.toString().trim();
  
  console.log('Input received:');
  console.log(input);
  console.log(`Length: ${input.length} characters`);
  console.log(`Lines: ${input.split('\n').length}`);
} catch (error) {
  console.error('Error reading stdin:', error);
}
