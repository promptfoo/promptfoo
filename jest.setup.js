import nock from 'nock';

// Disable all real network requests
nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

nock.emitter.on('no match', (req) => {
  if (!req.host.includes('127.0.0.1') && !req.host.includes('localhost')) {
    console.error(`Unexpected HTTP request: ${req.method} ${req.href}`);
  }
});
