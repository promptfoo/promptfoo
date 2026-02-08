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
Style: Modern tech illustration, clean lines, cute mascot character, cozy PNW coffee shop vibes, professional but approachable like a friendly tech blog`,
  },
  {
    filename: 'ai-security-summit-2025',
    prompt: `Create a clean, modern flat graphic illustration for AI Security Summit 2025 in San Francisco.

STYLE (match RSA Conference and Black Hat poster style):
- Clean, polished flat illustration - NOT painterly, NOT watercolor
- Smooth gradient background filling entire image
- Limited color palette: deep PURPLE (#7C3AED) and BLUE (#3B82F6) gradients, with pink/magenta accents
- Clean digital look, professional and sleek

BACKGROUND (must fill entire image):
- Deep purple to blue gradient filling the entire background
- San Francisco skyline silhouette with Golden Gate Bridge in darker purple shade
- Floating neural network nodes and connection lines as subtle decorative elements
- Abstract AI brain or circuit pattern overlay

RED PANDA CHARACTER:
- Round face with cream/white patches on cheeks and forehead
- Small simple BLACK DOT EYES
- Small black nose
- Friendly OPEN MOUTH smile showing warmth
- Wearing cute round GLASSES (this is an AI summit - smart look)
- Purple or blue blazer/jacket - professional but techy
- Standing at left, gesturing toward presentation screen

COMPOSITION:
- Red panda on left at a sleek podium
- Large screen on right showing: AI brain icon, neural network diagram, security shield with AI chip
- SOLID dark silhouettes of 3-4 attendees in foreground (clean shapes, not sketchy)
- Laptop on podium
- Everything should feel COMPLETE and POLISHED

TEXT: "AI SECURITY SUMMIT 2025" at top, "San Francisco, CA" below

Style: Premium tech conference, clean flat illustration with rich purple/blue filled background`,
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
Style: Canadian tech aesthetic, professional security conference, warm and welcoming despite dark theme`,
  },
  {
    filename: 'telecom-talks-2025',
    prompt: `Create a clean, modern flat graphic illustration for Telecom Talks 2025 - a panel discussion with Swisscom.

STYLE (match RSA Conference poster style):
- Clean, polished flat illustration - NOT vintage, NOT heavy texture
- Smooth subtle gradients in background
- The red panda should have a subtle dark outline/stroke to pop from background
- Limited color palette: Swiss-inspired - deep blue, white, red accents, with teal telecom accent
- Clean digital look, minimal texture

RED PANDA CHARACTER (critical details):
- Round face with cream/white patches on cheeks and forehead
- Small simple black dot eyes
- Small black nose
- Friendly OPEN MOUTH smile (like RSA image - warm, welcoming)
- Dark reddish-brown and orange fur as flat color shapes
- Subtle dark outline around the character
- Wearing a casual polo shirt or blazer

SCENE - PANEL DISCUSSION (this is key):
- Show a PANEL setup: long table/desk with 3 panelists seated behind it
- Red panda in the CENTER as a panelist, with 2 stylized human panelists on either side
- Each panelist has a small microphone in front of them
- Name placards on the table in front of each panelist
- Behind them: large screen showing smartphone icons, 5G signal waves, network diagrams
- Swiss Alps silhouette subtly visible through/behind the screen
- Small Swiss cross (white cross on red) as a subtle badge or logo element on the screen
- Audience silhouettes in foreground watching the panel

TELECOM ELEMENTS:
- Smartphone icons, cell signal bars, 5G text
- Network tower silhouette
- Signal wave arcs

TEXT AREA: Space at top for "TELECOM TALKS 2025" and "Panel with Swisscom • SRI International"

Style: Clean modern tech illustration like RSA Conference poster, polished and professional`,
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
Style: Enterprise security aesthetic, corporate tech conference, professional and trustworthy imagery`,
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
Style: Grassroots hacker conference, San Francisco community, warm and inclusive imagery`,
  },
  {
    filename: 'rsa-2026',
    prompt: `Create a clean, modern flat graphic illustration for RSA Conference 2026 - a "Save the Date" announcement. The ENTIRE IMAGE must have a BLUE background - NO WHITE.

CRITICAL - BACKGROUND COLOR:
- The ENTIRE background must be filled with RSA BLUE gradient - absolutely NO white or empty space
- Rich blue (#0066CC) at top fading to deep navy (#1a365d) at bottom
- This is the most important requirement - the background must be COMPLETELY FILLED with blue

BACKGROUND ELEMENTS:
- San Francisco skyline silhouette in darker blue shade (Golden Gate Bridge, Transamerica Pyramid, Moscone Center)
- Subtle grid pattern or circuit lines overlay in lighter blue
- Floating security shield icons scattered around

RED PANDA CHARACTER:
- Round face with cream/white patches on cheeks and forehead
- Small simple BLACK DOT EYES
- Small black nose
- Friendly OPEN MOUTH smile - excited expression
- Wearing blue blazer over white shirt
- Standing at left side, pointing excitedly at a calendar/sign

COMPOSITION:
- Red panda on left pointing at a "SAVE THE DATE" sign/calendar in center-right
- The sign shows "March 23-26, 2026" and "San Francisco"
- 2-3 excited colleagues as solid darker blue silhouettes
- Shield icons with checkmarks floating
- Everything on the BLUE background - no white areas

TEXT: "RSA CONFERENCE 2026" at top in white, "Save the Date" below

Style: Must look like RSA 2025 poster - rich blue filled background, clean flat illustration, professional but exciting`,
  },
  {
    filename: 'bsides-sf-2026',
    prompt: `Create a professional hero image for BSides San Francisco 2026.
The image should feature:
- A cute red panda character (the Promptfoo mascot) in a futuristic San Francisco setting
- The red panda should be inviting viewers to join, looking welcoming and excited
- Golden Gate Bridge with futuristic overlay, SF fog with neon accents
- Forward-looking community elements: save the date energy, excitement for upcoming event
- Text overlay area should be considered (space for "BSides SF 2026" and "March 21-22, 2026 • San Francisco, CA")
- Color palette: BSides orange (#F97316), neon purple (#8B5CF6), electric accents
- Exciting, community anticipation, grassroots energy for upcoming event
- Warm SF community vibes with futuristic accents
Style: Future hacker community gathering, San Francisco, anticipation and welcoming imagery`,
  },
  // ===== 2026 EVENTS (NEW) =====
  {
    filename: 'bsides-seattle-2026',
    prompt: `Create a clean, modern FLAT VECTOR illustration for BSides Seattle 2026 security conference. Match the exact style of BSides SF 2025 poster.

CRITICAL STYLE REQUIREMENTS:
- FLAT VECTOR illustration - NO 3D, NO realistic rendering, NO painterly texture
- Simple geometric shapes with clean edges
- Limited color palette with solid fills

BACKGROUND (must fill entire image):
- Forest green (#2D5A27) gradient background filling entire image
- Seattle skyline silhouette in darker green (Space Needle prominently featured, pine trees)
- Subtle rain drops or mist effect
- Gentle mountains in distance

RED PANDA CHARACTER (EXACT SPECIFICATIONS - CRITICAL):
- Round face with cream/white patches on cheeks and forehead
- Small simple BLACK DOT EYES (NOT realistic eyes - just black circles)
- Small black nose
- Friendly OPEN MOUTH smile showing warmth (like BSides SF 2025)
- Dark reddish-brown and bright orange fur as FLAT color shapes (NO texture, NO gradients in fur)
- Ears pointing up with cream inside
- Wearing cozy dark green hoodie
- Holding a coffee cup with steam rising
- Sitting at table with open laptop

COMPOSITION:
- Red panda at center with laptop and coffee
- 2-3 other hackers as FLAT stylized characters (not silhouettes) around table
- Everyone has laptops with security stickers
- Warm coffee shop community gathering feel
- Pine tree and rain elements in background

TEXT (REQUIRED): "BSIDES SEATTLE 2026" in bold at top, "February 27-28, 2026 • Redmond, WA" below

Style: MUST match BSides SF 2025 - warm community gathering, flat vector, cozy PNW coffee vibes`,
  },
  {
    filename: 'humanx-2026',
    prompt: `Create a clean, modern FLAT VECTOR illustration for HumanX 2026 AI conference. Match the style of RSA Conference 2025 poster.

CRITICAL STYLE REQUIREMENTS:
- FLAT VECTOR illustration - NO 3D, NO realistic rendering, NO painterly texture
- Simple geometric shapes with clean edges
- Limited color palette with solid fills

BACKGROUND (must fill entire image):
- Deep purple (#7c3aed) to cyan (#06b6d4) gradient background filling entire image
- San Francisco skyline silhouette in darker purple (Golden Gate Bridge, Transamerica Pyramid)
- Floating neural network nodes and connection lines as subtle pattern
- Abstract AI/brain circuit overlay

RED PANDA CHARACTER (EXACT SPECIFICATIONS - CRITICAL):
- Round face with cream/white patches on cheeks and forehead
- Small simple BLACK DOT EYES (NOT realistic eyes - just black circles)
- Small black nose
- Friendly OPEN MOUTH smile showing warmth
- Dark reddish-brown and bright orange fur as FLAT color shapes (NO texture, NO gradients in fur)
- Ears pointing up with cream inside
- Wearing purple blazer over white shirt - professional but modern
- Standing at left, gesturing toward presentation screen

COMPOSITION:
- Red panda on left at sleek podium
- Large presentation screen on right showing: AI brain icon, neural network diagram, "AI" text
- SOLID dark purple silhouettes of 3-4 attendees in foreground
- Clean, futuristic conference feel

TEXT (REQUIRED): "HUMANX 2026" in bold white at top, "April 6-9, 2026 • San Francisco, CA" below

Style: MUST match RSA 2025 - clean flat vector, professional conference, purple/cyan AI theme`,
  },
  {
    filename: 'gartner-security-2026',
    prompt: `A dark navy blue conference poster illustration. The entire image is filled with a rich navy blue (#1e3a5f) gradient background from edge to edge.

Scene: A flat vector illustration showing a cute red panda mascot presenting at an enterprise security summit. The entire composition sits against the deep navy blue backdrop.

Background: Deep navy blue gradient fills every pixel of the image. Washington DC skyline silhouette (Capitol dome, monuments) appears in slightly darker navy. Gold grid lines create subtle pattern overlay.

Red panda character: Cute cartoon style with round face, cream cheek patches, simple black dot eyes, open mouth smile, flat orange-brown fur. Wearing navy blazer with gold tie. Standing at podium gesturing to screen.

Composition: Red panda at podium on left. Large presentation screen on right showing risk charts, shield icons, governance flowchart. Dark navy silhouettes of 3-4 executives in foreground watching presentation.

Text at top: "GARTNER SECURITY 2026" in white. Below: "June 1-3, 2026 • National Harbor, MD"

Style: Clean flat vector like RSA Conference 2025 poster. Professional enterprise aesthetic. Navy blue background fills entire image.`,
  },
  {
    filename: 'blackhat-2026',
    prompt: `A dark charcoal gray conference poster illustration. The entire image is filled with a deep charcoal (#1a1a2e) to near-black gradient background from edge to edge.

Scene: A flat vector illustration showing a cute red panda mascot at a security conference booth. The entire composition sits against the dark charcoal backdrop.

Background: Dark charcoal gray gradient fills every pixel of the image. Las Vegas skyline silhouette (Stratosphere tower, casino hotels, desert mountains) appears in slightly lighter dark gray. Subtle circuit board pattern overlays the dark background.

Red panda character: Cute cartoon style with round face, cream cheek patches, simple black dot eyes, open mouth smile, flat orange-brown fur. Wearing dark gray blazer over black shirt. Red conference lanyard with badge. Standing at booth on left, gesturing toward screen.

Composition: Red panda at demo booth with laptop on table. Large presentation screen on right showing: red security shield with lock icon, red line graph trending up, identity credential icon. Dark gray silhouettes of 3-4 attendees in foreground watching demo.

Text at top: "BLACK HAT USA 2026" in light gray. Below: "August 1-6, 2026 • Las Vegas, NV"

Style: Clean flat vector exactly like Black Hat USA 2025 poster. Professional hacker conference aesthetic. Dark charcoal background fills entire image. Crimson red accent colors only.`,
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
Style: Venture capital thought leadership, professional media feature, sophisticated tech investment aesthetic`,
  },
  {
    filename: 'defcon-2025',
    prompt: `Create a clean, modern flat graphic illustration for DEF CON 33 (2025) hacker conference. The ENTIRE IMAGE must have a DARK background - NO WHITE.

CRITICAL - BACKGROUND COLOR:
- The ENTIRE background must be filled with DARK CHARCOAL to BLACK gradient - absolutely NO white or light areas
- Dark charcoal (#1a1a2e) at top fading to near-black (#0d0d0d) at bottom
- This is the most important requirement - the background must be COMPLETELY DARK like Black Hat poster

BACKGROUND ELEMENTS:
- Las Vegas skyline silhouette in slightly lighter dark gray (Stratosphere tower, casino hotels)
- Green (#00FF41) circuit traces and network lines as pattern overlay
- Matrix-style subtle code/text falling in background
- Terminal window shapes floating

RED PANDA CHARACTER:
- Round face with cream/white patches on cheeks and forehead
- Small simple BLACK DOT EYES
- Small black nose
- Friendly OPEN MOUTH smile - playful mischievous grin
- Wearing dark gray HOODIE
- Green DEF CON badge on lanyard
- Sitting at center with laptop

COMPOSITION:
- Red panda at center-left at table with open laptop showing green terminal text
- 2-3 hacker friends as stylized flat characters (not just silhouettes) sitting around with laptops
- Everyone wearing hoodies, has badges
- Skull stickers on laptops
- SOLID dark silhouettes of crowd in far background
- Warm community gathering feel despite dark colors

TEXT: "DEF CON 33" in neon green at top, "August 7-10, 2025 • Las Vegas" below

Style: Must look like Black Hat poster - dark filled background, clean flat illustration, hacker aesthetic with green accents`,
  },
  {
    filename: 'blackhat-2025',
    prompt: `Create a clean, modern flat graphic illustration for Black Hat USA 2025 in Las Vegas. Match the polished style of RSA Conference posters.

BACKGROUND (critical - must fill entire image):
- DARK gradient background filling the ENTIRE image - deep charcoal gray at top fading to dark gray
- Las Vegas skyline silhouette across the bottom/middle in darker shade (Stratosphere tower, casino hotel shapes, desert mountains)
- The background must be FILLED with color, not white/empty
- Subtle grid lines or circuit pattern overlay in the dark background

COLOR PALETTE (strict):
- Background: dark charcoal grays and blacks
- Accents: CRIMSON RED (#DC143C) for highlights and icons
- White/light gray for text and secondary elements
- The red panda's orange fur should POP against the dark background

RED PANDA CHARACTER:
- Round face with cream/white patches on cheeks and forehead
- Small simple BLACK DOT EYES
- Small black nose
- Friendly OPEN MOUTH smile showing warmth
- Dark reddish-brown and bright orange fur as flat color shapes
- Wearing dark blazer over black shirt - very professional
- Red lanyard with badge visible
- Standing at left-center, gesturing toward a presentation screen

COMPOSITION:
- Red panda on left side at a sleek demo podium/booth
- Large presentation SCREEN on the right showing: security shield icon, lock icon, threat graph with red data points, profile/identity card icon
- SOLID dark silhouettes of 3-4 attendees in foreground watching (not sketchy outlines - clean solid shapes like RSA image)
- Laptop on podium showing dashboard
- Everything should feel COMPLETE and POLISHED, not sparse

TEXT: "BLACK HAT USA 2025" at top, "August 2-7, 2025 • Las Vegas, NV" below

Style: Premium, dark, professional - like a high-end security conference. Clean flat illustration with rich dark filled background like RSA poster style.`,
  },
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
      execSync(`sips -s format jpeg -s formatOptions 85 "${pngPath}" --out "${jpgPath}"`, {
        stdio: 'pipe',
      });
      console.log(`[${event.filename}] Converted to JPEG`);

      // Remove PNG after successful conversion
      fs.unlinkSync(pngPath);
      console.log(`[${event.filename}] Cleaned up PNG`);
    } catch (_convertError) {
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
    const found = events.find((e) => e.filename === eventName || e.filename.includes(eventName));
    if (found) {
      eventsToProcess = [found];
    } else {
      console.error(`Event not found: ${eventName}`);
      console.log('Available events:', events.map((e) => e.filename).join(', '));
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

// biome-ignore lint/nursery/noFloatingPromises: should probably migrate this to ESM
main();
