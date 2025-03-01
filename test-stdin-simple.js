// Simple script that reads stdin and immediately processes it
const chunks = [];

process.stdin.on('data', (chunk) => {
  chunks.push(chunk);
});

process.stdin.on('end', () => {
  const data = Buffer.concat(chunks).toString();
  console.log('Input received:');
  console.log(data);
  console.log(`Characters: ${data.length}`);
  console.log(`Lines: ${data.split('\n').length}`);
});
