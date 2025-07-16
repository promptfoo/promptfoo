#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
// Get OpenAI API key from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('Please set the OPENAI_API_KEY environment variable');
  process.exit(1);
}
// Parse command line arguments
const args = process.argv.slice(2);
let filename = 'blog-image.png';
let prompt = '';
// Parse arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--filename' || args[i] === '-f') {
    filename = args[i + 1];
    i++;
  } else if (args[i] === '--prompt' || args[i] === '-p') {
    prompt = args[i + 1];
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Usage: node generate-blog-image.js [options]
Options:
  -f, --filename <name>    Output filename (default: blog-image.png)
  -p, --prompt <text>      Image generation prompt
  -h, --help              Show this help message
Examples:
  node generate-blog-image.js -f system-cards-hero.png -p "A red panda reading documentation"
  node generate-blog-image.js --filename security-test.png --prompt "Cybersecurity visualization"
`);
    process.exit(0);
  }
}
// Example prompt for system cards blog post:
/*
const systemCardsPrompt = `Create a professional hero image for a blog post about LLM System Cards and AI Safety Documentation. 
The image should feature:
- A cute red panda character (the Promptfoo mascot) in a cybersecurity/tech setting
- The red panda should be examining or holding system documentation, security reports, or technical papers
- Include visual elements that suggest security, transparency, and documentation (like shields, locks, checklists, or documents)
- Modern tech aesthetic with a color palette that includes: deep purples, teals, and orange accents (matching Promptfoo's brand)
- The style should be professional but approachable, similar to tech blog illustrations
- Background could include subtle circuit patterns, document icons, or security symbols
- The red panda should look intelligent and focused, perhaps wearing glasses or holding a magnifying glass
- Overall mood: trustworthy, technical, but friendly
Style: Modern tech illustration, clean lines, professional but approachable, suitable for a security-focused blog post`;
*/
if (!prompt) {
  console.error('Please provide a prompt using --prompt or -p');
  console.log('Use --help for usage information');
  process.exit(1);
}
async function generateImage() {
  const data = JSON.stringify({
    model: 'gpt-image-1',
    prompt: prompt,
    size: '1024x1024',
    quality: 'high',
    n: 1,
  });
  const options = {
    hostname: 'api.openai.com',
    port: 443,
    path: '/v1/images/generations',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Length': data.length,
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
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https
      .get(url, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      })
      .on('error', (error) => {
        fs.unlink(filepath, () => {}); // Delete the file on error
        reject(error);
      });
  });
}
async function main() {
  try {
    console.log('Generating image with gpt-image-1...');
    const imageData = await generateImage();
    if (imageData.b64_json) {
      // If we get base64 data, save it directly
      const outputPath = path.join(__dirname, '..', 'site', 'static', 'img', 'blog', filename);
      const buffer = Buffer.from(imageData.b64_json, 'base64');
      fs.writeFileSync(outputPath, buffer);
      console.log(`Image saved to: ${outputPath}`);
    } else if (imageData.url) {
      // If we get a URL, download the image
      const outputPath = path.join(__dirname, '..', 'site', 'static', 'img', 'blog', filename);
      await downloadImage(imageData.url, outputPath);
      console.log(`Image downloaded and saved to: ${outputPath}`);
    } else {
      console.error('Unexpected response format:', imageData);
    }
  } catch (error) {
    console.error('Error generating image:', error);
    process.exit(1);
  }
}
main();
