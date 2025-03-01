// Direct echo script using child_process
import { execSync } from 'child_process';

// Get the stdin and echo it back
const stdin = process.argv[2] || '';
console.log('Input received:', stdin);

// Also try to echo using the cat command
try {
  if (stdin) {
    const result = execSync('cat', { input: stdin });
    console.log('\nOutput from cat command:');
    console.log(result.toString());
  } else {
    console.log('No input provided');
  }
} catch (error) {
  console.error('Error:', error.message);
}
