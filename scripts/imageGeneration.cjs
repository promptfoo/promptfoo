const fs = require('fs/promises');
const https = require('https');

function requestImage(data, apiKey, contentLength) {
  const options = {
    hostname: 'api.openai.com',
    port: 443,
    path: '/v1/images/generations',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Content-Length': contentLength,
    },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(responseBody);
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.data[0]);
          }
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', (error) => {
      reject(error);
    });
    req.write(data);
    req.end();
  });
}

async function downloadImage(url, filepath) {
  const buffer = await new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          response.resume();
          reject(new Error(`Failed to download image: ${response.statusCode}`));
          return;
        }
        const chunks = [];
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
        response.on('error', reject);
      })
      .on('error', reject);
  });
  try {
    await fs.writeFile(filepath, buffer);
  } catch (error) {
    await fs.unlink(filepath).catch(() => {}); // Delete the file on error
    throw error;
  }
}

module.exports = { requestImage, downloadImage };
