const nock = require('nock');

// Disable all real network requests
nock.disableNetConnect();

nock.emitter.on('no match', (req) => {
  console.error(`Unexpected HTTP request: ${req.method} ${req.href}`);
});
