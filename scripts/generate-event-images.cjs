#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

// Get OpenAI API key from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('Please set the OPENAI_API_KEY environment variable');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, '..', 'site', 'static', 'img', 'events');

// Event image configurations
const events = [
  {
    filename: 'bsides-seattle-2025',
    prompt: `Create a professional hero image for BSides Seattle 2025 security conference.
The image should feature:
- A cute red panda character (the Promptfoo mascot) in a Pacific Northwest setting
- The red panda should be holding a coffee cup and looking at code or security documentation
- Seattle elements: rain drops, evergreen trees (pine/fir silhouettes), mountain silhouette in background
- Include subtle security elements like shields, locks, or terminal windows
- Text overlay area should be considered (darker area at bottom for "BSides Seattle 2025" and "May 10, 2025 • Seattle, WA")
- Color palette: forest green (#059669), warm coffee browns, gray rain tones, cream accents
- Cozy, community-driven, welcoming atmosphere
- Modern tech illustration style, clean lines
Style: Pacific Northwest aesthetic, cozy coffee shop vibes meets security conference, professional but approachable`
  },
  {
    filename: 'ai-security-summit-2025',
    prompt: `Create a professional hero image for AI Security Summit 2025 in San Francisco.
The image should feature:
- A cute red panda character (the Promptfoo mascot) surrounded by neural network visualizations
- The red panda should look intelligent, perhaps wearing glasses, examining AI/neural patterns
- Futuristic AI elements: floating neural nodes, glowing connections, abstract brain patterns
- San Francisco subtle hints: Golden Gate bridge silhouette in background or city skyline
- Text overlay area should be considered (space for "AI Security Summit 2025" and "Oct 22-23, 2025 • San Francisco, CA")
- Color palette: deep purple (#7C3AED), electric blue (#3B82F6), neural pink (#EC4899), dark backgrounds
- Cutting-edge, authoritative, futuristic atmosphere
- Gradient mesh effects, glowing elements
Style: Neural network aesthetic, futuristic AI visualization, professional tech conference imagery`
  },
  {
    filename: 'sector-2025',
    prompt: `Create a professional hero image for SecTor 2025, Canada's largest IT security conference in Toronto.
The image should feature:
- A cute red panda character (the Promptfoo mascot) in a Canadian security setting
- The red panda could be wearing a subtle Canadian element (red scarf) while examining security tools
- Toronto skyline with CN Tower prominently featured in background
- Subtle maple leaf patterns or motifs incorporated into the design
- Include security elements: shields, locks, code snippets, Arsenal badge
- Text overlay area should be considered (space for "SecTor 2025" and "Sep 30 - Oct 2, 2025 • Toronto, Canada")
- Color palette: deep crimson red (#B22234), white, dark slate backgrounds, warm accents
- Professional, internationally respected, but with Canadian warmth
- Northern lights inspired subtle gradient in sky
Style: Canadian tech aesthetic, professional security conference, warm and welcoming despite dark theme`
  },
  {
    filename: 'telecom-talks-2025',
    prompt: `Create a professional hero image for Telecom Talks 2025 at SRI International in Menlo Park.
The image should feature:
- A cute red panda character (the Promptfoo mascot) surrounded by network and signal visualizations
- The red panda should be interacting with signal waves, network topology diagrams, or fiber optic light trails
- Telecommunications elements: signal waves, cell towers, circuit traces, data packets flowing
- Include a subtle stage/presentation element (microphone or presentation screen) to indicate speaking role
- Text overlay area should be considered (space for "Telecom Talks 2025" and "April 9, 2025 • Menlo Park, CA")
- Color palette: electric cyan (#00D4FF), deep navy (#0A1628), signal green (#00FF88)
- High-tech, infrastructure-focused, network operations center aesthetic
- Glowing neon effects, circuit board patterns
Style: Network monitoring aesthetic, telecommunications infrastructure, professional tech illustration with cyber glow effects`
  }
];

async function generateImage(prompt) {
  const data = JSON.stringify({
    model: 'gpt-image-1',
    prompt: prompt,
    size: '1536x1024', // Wider aspect ratio for hero images
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
      'Content-Length': Buffer.byteLength(data),
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
        fs.unlink(filepath, () => {});
        reject(error);
      });
  });
}

async function processEvent(event) {
  const pngPath = path.join(OUTPUT_DIR, `${event.filename}.png`);
  const jpgPath = path.join(OUTPUT_DIR, `${event.filename}.jpg`);

  console.log(`[${event.filename}] Generating image...`);

  try {
    const imageData = await generateImage(event.prompt);

    if (imageData.b64_json) {
      const buffer = Buffer.from(imageData.b64_json, 'base64');
      fs.writeFileSync(pngPath, buffer);
      console.log(`[${event.filename}] PNG saved`);
    } else if (imageData.url) {
      await downloadImage(imageData.url, pngPath);
      console.log(`[${event.filename}] PNG downloaded`);
    }

    // Convert PNG to JPEG using sips (macOS) or ImageMagick
    try {
      execSync(`sips -s format jpeg -s formatOptions 85 "${pngPath}" --out "${jpgPath}"`, { stdio: 'pipe' });
      console.log(`[${event.filename}] Converted to JPEG`);

      // Remove PNG after successful conversion
      fs.unlinkSync(pngPath);
      console.log(`[${event.filename}] Cleaned up PNG`);
    } catch (convertError) {
      // Try ImageMagick as fallback
      try {
        execSync(`convert "${pngPath}" -quality 85 "${jpgPath}"`, { stdio: 'pipe' });
        console.log(`[${event.filename}] Converted to JPEG (ImageMagick)`);
        fs.unlinkSync(pngPath);
      } catch {
        console.log(`[${event.filename}] Could not convert to JPEG, keeping PNG`);
      }
    }

    return { success: true, filename: event.filename };
  } catch (error) {
    console.error(`[${event.filename}] Error:`, error.message);
    return { success: false, filename: event.filename, error: error.message };
  }
}

async function main() {
  // Parse command line for specific event
  const args = process.argv.slice(2);
  let eventsToProcess = events;

  if (args.length > 0 && args[0] !== '--all') {
    const eventName = args[0];
    const found = events.find(e => e.filename === eventName || e.filename.includes(eventName));
    if (found) {
      eventsToProcess = [found];
    } else {
      console.error(`Event not found: ${eventName}`);
      console.log('Available events:', events.map(e => e.filename).join(', '));
      process.exit(1);
    }
  }

  console.log(`Generating ${eventsToProcess.length} event image(s) in parallel...`);
  console.log('Output directory:', OUTPUT_DIR);
  console.log('');

  // Run all in parallel
  const results = await Promise.all(eventsToProcess.map(processEvent));

  console.log('');
  console.log('=== Results ===');
  for (const result of results) {
    if (result.success) {
      console.log(`✓ ${result.filename}.jpg`);
    } else {
      console.log(`✗ ${result.filename}: ${result.error}`);
    }
  }
}

main();
