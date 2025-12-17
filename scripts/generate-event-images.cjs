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
    prompt: `Create a cute, friendly hero image for BSides Seattle 2025 security conference.
The image should feature:
- An adorable, expressive red panda character (the Promptfoo mascot) looking intelligent and friendly
- The red panda should be cozy, holding a warm coffee cup, with a cheerful expression
- Pacific Northwest setting: gentle rain, evergreen tree silhouettes, misty mountain backdrop
- Subtle security touches: a small laptop or tablet with code visible
- Modern tech illustration style with clean lines, professional but approachable
- Color palette: forest green, warm coffee browns, soft gray tones, cream accents
- Overall mood: trustworthy, technical, but friendly and welcoming
Style: Modern tech illustration, clean lines, cute mascot character, cozy PNW coffee shop vibes, professional but approachable like a friendly tech blog`
  },
  {
    filename: 'ai-security-summit-2025',
    prompt: `Create a warm, charming illustration for AI Security Summit 2025 in San Francisco.

Style (CRITICAL - match this exactly):
- Warm, expressive children's book illustration style with soft gradients and shading
- The red panda must have BIG, SHINY, EXPRESSIVE eyes with white highlights/reflections - full of life and personality
- Friendly, engaging character with genuine warmth - NOT a logo, NOT an icon, a LOVABLE CHARACTER
- Soft, warm color palette with gentle gradients - NOT flat solid colors
- Scene should feel alive and inviting, like friends gathering

The image should feature:
- An adorable red panda character with big expressive eyes, wearing cute round glasses, looking curious and intelligent
- The red panda in the center, surrounded by friendly diverse human colleagues at a table with laptops
- Warm conversation scene - people engaged and smiling
- Golden Gate Bridge silhouette in soft misty purple/blue background
- Soft neural network nodes floating gently above
- Color palette: warm purples, soft blues, orange accents, cream tones

Style: Warm digital illustration like Pixar concept art, expressive characters, soft lighting, friendly and inviting atmosphere`
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
    prompt: `Create a warm, charming illustration for Telecom Talks 2025 at SRI International.

Style (CRITICAL - match this exactly):
- Warm, expressive children's book illustration style with soft gradients and shading
- The red panda must have BIG, SHINY, EXPRESSIVE eyes with white highlights/reflections - full of life and personality
- Friendly, engaging character with genuine warmth - NOT a logo, NOT an icon, a LOVABLE CHARACTER
- Soft, warm color palette with gentle gradients - NOT flat solid colors
- Scene should feel alive and inviting

The image should feature:
- An adorable red panda character with big expressive eyes, confidently presenting at a podium
- The red panda wearing a casual t-shirt, with an enthusiastic open-mouthed smile, one paw gesturing
- Friendly audience members visible, engaged and smiling
- Soft teal/cyan signal waves and gentle network elements in background
- Warm lighting like a cozy conference room
- Color palette: soft teals, warm navy, cream tones, orange accents

Style: Warm digital illustration like Pixar concept art, expressive characters, soft lighting, friendly presenter atmosphere`
  },
  {
    filename: 'rsa-2025',
    prompt: `Create a professional hero image for RSA Conference 2025 in San Francisco.
The image should feature:
- A cute red panda character (the Promptfoo mascot) in an enterprise security setting
- The red panda should be presenting or demonstrating security tools to an audience
- Corporate security elements: shields, locks, security badges, enterprise architecture diagrams
- Moscone Center or San Francisco financial district skyline in background
- Text overlay area should be considered (space for "RSA Conference 2025" and "April 28 - May 1, 2025 • San Francisco, CA")
- Color palette: RSA blue (#0066CC), professional silver (#94A3B8), navy (#1e3a5f)
- Professional, enterprise-grade, corporate but approachable atmosphere
- Clean geometric patterns, subtle grid overlays
Style: Enterprise security aesthetic, corporate tech conference, professional and trustworthy imagery`
  },
  {
    filename: 'bsides-sf-2025',
    prompt: `Create a professional hero image for BSides San Francisco 2025.
The image should feature:
- A cute red panda character (the Promptfoo mascot) in a San Francisco community setting
- The red panda should be engaging with other hackers/community members in discussion
- Golden Gate Bridge silhouette prominently in background with SF fog rolling in
- Grassroots hacker community elements: laptops, coffee cups, stickers, casual setting
- Text overlay area should be considered (space for "BSides SF 2025" and "April 26-27, 2025 • San Francisco, CA")
- Color palette: BSides orange (#F97316), purple (#8B5CF6), fog gray tones
- Community-driven, accessible, inclusive, hacker culture atmosphere
- Warm community vibes with SF fog aesthetic
Style: Grassroots hacker conference, San Francisco community, warm and inclusive imagery`
  },
  {
    filename: 'rsa-2026',
    prompt: `Create a warm, charming illustration for RSA Conference 2026 in San Francisco.

Style (CRITICAL - match this exactly):
- Warm, expressive children's book illustration style with soft gradients and shading
- The red panda must have BIG, SHINY, EXPRESSIVE eyes with white highlights/reflections - full of life and personality
- Friendly, engaging character with genuine warmth - NOT a logo, NOT an icon, a LOVABLE CHARACTER
- Soft, warm color palette with gentle gradients - NOT flat solid colors
- Scene should feel alive and inviting

The image should feature:
- An adorable red panda character with big expressive eyes, excitedly pointing at a "Save the Date" calendar
- The red panda has a big happy smile, genuinely excited expression
- Friendly colleagues nearby also looking excited about the upcoming event
- San Francisco skyline with Golden Gate Bridge in soft blue/purple misty background
- Gentle floating security shield icons
- Color palette: soft blues, warm cyans, professional navy, cream and orange accents

Style: Warm digital illustration like Pixar concept art, expressive characters, soft lighting, excited anticipation atmosphere`
  },
  {
    filename: 'bsides-sf-2026',
    prompt: `Create a professional hero image for BSides San Francisco 2026.
The image should feature:
- A cute red panda character (the Promptfoo mascot) in a futuristic San Francisco setting
- The red panda should be inviting viewers to join, looking welcoming and excited
- Golden Gate Bridge with futuristic overlay, SF fog with neon accents
- Forward-looking community elements: save the date energy, excitement for upcoming event
- Text overlay area should be considered (space for "BSides SF 2026" and "April 25-26, 2026 • San Francisco, CA")
- Color palette: BSides orange (#F97316), neon purple (#8B5CF6), electric accents
- Exciting, community anticipation, grassroots energy for upcoming event
- Warm SF community vibes with futuristic accents
Style: Future hacker community gathering, San Francisco, anticipation and welcoming imagery`
  },
  {
    filename: 'scaleup-ai-2025',
    prompt: `Create a professional hero image for ScaleUp:AI 2025, an Insight Partners venture capital thought leadership series.
The image should feature:
- A cute red panda character (the Promptfoo mascot) in a sophisticated, professional setting
- The red panda should appear confident and visionary, perhaps at a podium or in a modern office with city views
- Venture capital / investment aesthetic: sleek modern architecture, glass buildings, upward growth charts
- Abstract elements suggesting scale and growth: ascending lines, geometric shapes, network nodes
- Text overlay area should be considered (space for "ScaleUp:AI 2025" and "Insight Partners")
- Color palette: deep indigo (#4F46E5), professional slate (#475569), clean whites
- Sophisticated, authoritative, thought leadership atmosphere
- Clean geometric patterns, subtle gradient overlays
Style: Venture capital thought leadership, professional media feature, sophisticated tech investment aesthetic`
  },
  {
    filename: 'defcon-2025',
    prompt: `Create a warm, charming illustration for DEF CON 33 (2025), the hacker conference in Las Vegas.

Style (CRITICAL - match this exactly):
- Warm, expressive children's book illustration style with soft gradients and shading
- The red panda must have BIG, SHINY, EXPRESSIVE eyes with white highlights/reflections - full of life and personality
- Friendly, engaging character with genuine warmth - NOT a logo, NOT an icon, a LOVABLE CHARACTER
- Soft, warm color palette with gentle gradients - NOT flat solid colors
- Scene should feel alive and inviting, like friends at a fun gathering

The image should feature:
- An adorable red panda character with big expressive eyes, wearing a cozy hoodie, with a playful mischievous grin
- The red panda sitting with friendly diverse hacker friends around a table with laptops
- Everyone engaged in fun conversation, some typing, warm camaraderie
- Soft green terminal windows glowing gently in background
- Conference badges visible, warm lighting
- Color palette: soft greens, warm teals, muted cyans, cream tones on cozy dark background

Style: Warm digital illustration like Pixar concept art, expressive characters, soft lighting, fun hacker friends gathering atmosphere`
  },
  {
    filename: 'blackhat-2025',
    prompt: `Create a warm, charming illustration for Black Hat USA 2025 cybersecurity conference in Las Vegas.

Style (CRITICAL - match this exactly):
- Warm, expressive children's book illustration style with soft gradients and shading
- The red panda must have BIG, SHINY, EXPRESSIVE eyes with white highlights/reflections - full of life and personality
- Friendly, engaging character with genuine warmth - NOT a logo, NOT an icon, a LOVABLE CHARACTER
- Soft, warm color palette with gentle gradients - NOT flat solid colors
- Scene should feel alive and inviting

The image should feature:
- An adorable red panda character with big expressive eyes, wearing a conference badge, looking confident and friendly
- The red panda at a demo booth, engaging warmly with interested attendees
- Friendly professionals gathered around, some holding coffee cups, engaged in conversation
- Soft security visualizations and gentle data charts in background
- Warm booth lighting, professional but welcoming atmosphere
- Color palette: warm grays, soft crimson red accents, cream tones, professional but cozy

Style: Warm digital illustration like Pixar concept art, expressive characters, soft lighting, friendly professional conference atmosphere`
  }
];

async function generateImage(prompt) {
  const data = JSON.stringify({
    model: 'gpt-image-1.5',
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
