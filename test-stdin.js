// A simple script to test standard input
import { createInterface } from 'readline';

// Set up stdin 
const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

// Read data from stdin and process it
let data = '';
process.stdin.on('data', (chunk) => {
  data += chunk;
});

process.stdin.on('end', () => {
  console.log('Standard input received:');
  console.log(data);
  console.log(`Total characters: ${data.length}`);
  
  const lines = data.split('\n');
  console.log(`Total lines: ${lines.length}`);
  
  rl.close();
  process.exit(0);
});

console.log('Reading from standard input...');
