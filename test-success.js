// This script should run successfully
console.log("Hello, world! This is a successful script execution.");
console.log("Multiple lines of output.");
console.log("Script completed successfully.");

// Also test some stderr output in a successful script
console.error("This is a warning message (to stderr).");

// Exit with success code 0
process.exit(0);