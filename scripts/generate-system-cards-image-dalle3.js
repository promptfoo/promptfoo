#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

// You'll need to set your OpenAI API key
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('Please set the OPENAI_API_KEY environment variable');
  console.error('You can get an API key from: https://platform.openai.com/api-keys');
  process.exit(1);
}

const prompt = `Create a professional hero image for a blog post about LLM System Cards and AI Safety Documentation. 

The image should feature:
- A cute red panda character (the Promptfoo mascot) in a cybersecurity/tech setting
- The red panda should be examining or holding system documentation, security reports, or technical papers
- Include visual elements that suggest security, transparency, and documentation (like shields, locks, checklists, or documents)
- Modern tech aesthetic with a color palette that includes: deep purples, teals, and orange accents
- The style should be professional but approachable, similar to modern tech blog illustrations
- Background could include subtle circuit patterns, document icons, or security symbols
- The red panda should look intelligent and focused, perhaps wearing glasses or holding a magnifying glass
- Overall mood: trustworthy, technical, but friendly

Style: Modern tech illustration, clean lines, professional but approachable, suitable for a security-focused blog post`;

async function generateImage() {
  const data = JSON.stringify({
    model: 'dall-e-3',
    prompt: prompt,
    size: '1792x1024', // HD landscape format for blog hero
    quality: 'hd',
    n: 1,
    style: 'vivid' // More vibrant colors for blog hero image
  });

  const options = {
    hostname: 'api.openai.com',
    port: 443,
    path: '/v1/images/generations',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Length': data.length
    }
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
    
    https.get(url, (response) => {
      response.pipe(file);
      
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (error) => {
      fs.unlink(filepath, () => {}); // Delete the file on error
      reject(error);
    });
  });
}

async function main() {
  try {
    console.log('Generating image with DALL-E 3...');
    console.log('This may take 10-20 seconds...\n');
    
    const imageData = await generateImage();
    
    if (imageData.url) {
      // DALL-E 3 typically returns a URL
      const outputPath = path.join(__dirname, '..', 'site', 'static', 'img', 'blog', 'system-cards-hero.png');
      
      // Ensure the directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      console.log('Downloading image...');
      await downloadImage(imageData.url, outputPath);
      console.log(`\n✅ Image saved to: ${outputPath}`);
      console.log(`\nRevised prompt used by DALL-E 3:\n${imageData.revised_prompt}`);
    } else {
      console.error('Unexpected response format:', imageData);
    }
  } catch (error) {
    console.error('\n❌ Error generating image:', error.message);
    if (error.message.includes('billing')) {
      console.error('\nMake sure your OpenAI account has credits available.');
      console.error('Check your usage at: https://platform.openai.com/usage');
    }
    process.exit(1);
  }
}

// Run the script
main(); 