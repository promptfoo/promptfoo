process.stdin.resume();
process.stdin.on('end', () => {
  console.log(`stdin closed, prompt=${process.argv[2] ?? ''}`);
});
