// A simple script to test memory-related arguments
console.log('Memory limits:');
console.log('Max old space size:', process.resourceUsage().maxRss / (1024 * 1024), 'MB');
console.log('Current heap size:', process.memoryUsage().heapTotal / (1024 * 1024), 'MB');
console.log('Used heap size:', process.memoryUsage().heapUsed / (1024 * 1024), 'MB');

// Print all V8 flags
const v8 = process.binding('v8');
if (v8 && typeof v8.getHeapStatistics === 'function') {
  console.log('\nV8 heap statistics:');
  console.log(v8.getHeapStatistics());
}
