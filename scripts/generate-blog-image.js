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

// Default options
const DEFAULT_OPTIONS = {
  filename: 'blog-image.jpg',
  prompt: '',
  inputImage: null,
  size: '1024x1024',
  quality: 'high',
  format: 'jpeg',
  compression: null,
  background: null,
  n: 1,
};

// Valid sizes for gpt-image-1
const VALID_SIZES = ['1024x1024', '1024x1792', '1792x1024'];

// Valid formats
const VALID_FORMATS = ['png', 'jpeg', 'webp'];

// Valid quality levels
const VALID_QUALITY = ['low', 'medium', 'high', 'auto'];

// Parse command line arguments
const args = process.argv.slice(2);
let options = { ...DEFAULT_OPTIONS };

// Parse arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--filename' || args[i] === '-f') {
    options.filename = args[i + 1];
    i++;
  } else if (args[i] === '--prompt' || args[i] === '-p') {
    options.prompt = args[i + 1];
    i++;
  } else if (args[i] === '--input' || args[i] === '-i') {
    options.inputImage = args[i + 1];
    i++;
  } else if (args[i] === '--size' || args[i] === '-s') {
    options.size = args[i + 1];
    i++;
  } else if (args[i] === '--quality' || args[i] === '-q') {
    options.quality = args[i + 1];
    i++;
  } else if (args[i] === '--format') {
    options.format = args[i + 1];
    i++;
  } else if (args[i] === '--compression' || args[i] === '-c') {
    options.compression = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--transparent' || args[i] === '-t') {
    options.background = 'transparent';
  } else if (args[i] === '--number' || args[i] === '-n') {
    options.n = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Usage: node generate-blog-image.js [options]

Options:
  -f, --filename <name>     Output filename (default: ${DEFAULT_OPTIONS.filename})
  -p, --prompt <text>       Image generation/editing prompt (required)
  -i, --input <path>        Input image path for editing (optional)
  -s, --size <size>         Image size: ${VALID_SIZES.join(', ')}, auto (default: ${DEFAULT_OPTIONS.size})
  -q, --quality <quality>   Quality: ${VALID_QUALITY.join(', ')} (default: ${DEFAULT_OPTIONS.quality})
  --format <format>         Output format: ${VALID_FORMATS.join(', ')} (default: ${DEFAULT_OPTIONS.format})
  -c, --compression <0-100> Compression level for JPEG/WebP (optional)
  -t, --transparent         Enable transparent background (PNG/WebP only)
  -n, --number <n>          Number of images to generate (default: ${DEFAULT_OPTIONS.n})
  -h, --help               Show this help message
  --mcp-server             Run as an MCP server instead of CLI mode

Examples:
  # Generate a new image
  node generate-blog-image.js -f hero.png -p "A red panda reading documentation"
  
  # Edit an existing image
  node generate-blog-image.js -i input.png -f output.png -p "Add a hat to the red panda"
  
  # Generate with transparency
  node generate-blog-image.js -f sprite.png -p "2D pixel art cat sprite" -t -q high
  
  # Generate multiple variations
  node generate-blog-image.js -f "image-{n}.png" -p "Cybersecurity visualization" -n 3
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

// Only validate parameters if not running as MCP server
if (!process.argv.includes('--mcp-server')) {
  // Validate required parameters
  if (!options.prompt) {
    console.error('Please provide a prompt using --prompt or -p');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  // Validate filename for security
  if (options.filename.includes('..') || options.filename.startsWith('/')) {
    console.error('Invalid filename: Path traversal or absolute paths not allowed');
    process.exit(1);
  }

  // Validate size parameter for gpt-image-1
  if (options.size !== 'auto' && !VALID_SIZES.includes(options.size)) {
    console.error(
      `Invalid size: ${options.size}. Valid sizes are: ${VALID_SIZES.join(', ')}, auto`,
    );
    process.exit(1);
  }
}

// Update filename extension based on format
if (!options.filename.includes('.')) {
  options.filename += `.${options.format}`;
} else {
  const ext = path.extname(options.filename).slice(1);
  if (ext !== options.format) {
    console.warn(`Warning: filename extension (${ext}) doesn't match format (${options.format})`);
  }
}

async function generateOrEditImage() {
  const isEditing = !!options.inputImage;
  const endpoint = isEditing ? '/v1/images/edits' : '/v1/images/generations';

  let requestData = {
    model: 'gpt-image-1',
    prompt: options.prompt,
    size: options.size,
    quality: options.quality,
    n: options.n,
  };

  // Note: The current Image API for gpt-image-1 doesn't support format/compression/background parameters directly
  // These features are mentioned in the docs but may require the Responses API or post-processing
  // For now, we'll generate PNG images and can add format conversion later if needed

  let body;
  let headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
  };

  if (isEditing) {
    // For edits, we need to use multipart/form-data
    const boundary = `----FormBoundary${Date.now()}`;
    headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;

    const parts = [];

    // Add the image
    const imageData = fs.readFileSync(options.inputImage);
    parts.push(
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="image"; filename="image.png"\r\n`,
      `Content-Type: image/png\r\n\r\n`,
    );
    parts.push(imageData);
    parts.push('\r\n');

    // Add other fields
    for (const [key, value] of Object.entries(requestData)) {
      if (value !== null && value !== undefined) {
        parts.push(
          `--${boundary}\r\n`,
          `Content-Disposition: form-data; name="${key}"\r\n\r\n`,
          `${value}\r\n`,
        );
      }
    }

    parts.push(`--${boundary}--\r\n`);

    // Combine all parts
    const textParts = [];
    const bufferParts = [];

    for (const part of parts) {
      if (typeof part === 'string') {
        textParts.push(Buffer.from(part));
      } else {
        if (textParts.length > 0) {
          bufferParts.push(Buffer.concat(textParts));
          textParts.length = 0;
        }
        bufferParts.push(part);
      }
    }

    if (textParts.length > 0) {
      bufferParts.push(Buffer.concat(textParts));
    }

    body = Buffer.concat(bufferParts);
    headers['Content-Length'] = body.length;
  } else {
    // For generations, use JSON
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(requestData);
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  const requestOptions = {
    hostname: 'api.openai.com',
    port: 443,
    path: endpoint,
    method: 'POST',
    headers: headers,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
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
            resolve(response.data);
          }
        } catch (error) {
          console.error('Failed to parse response:', responseBody);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(body);
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
    const action = options.inputImage ? 'Editing' : 'Generating';
    console.log(`${action} image with gpt-image-1...`);

    if (options.inputImage && !fs.existsSync(options.inputImage)) {
      throw new Error(`Input image not found: ${options.inputImage}`);
    }

    const images = await generateOrEditImage();

    for (let i = 0; i < images.length; i++) {
      const imageData = images[i];
      let outputFilename = options.filename;

      // Handle multiple images
      if (images.length > 1) {
        const ext = path.extname(outputFilename);
        const base = outputFilename.slice(0, -ext.length);
        if (base.includes('{n}')) {
          outputFilename = base.replace('{n}', i + 1) + ext;
        } else {
          outputFilename = `${base}-${i + 1}${ext}`;
        }
      }

      const outputPath = path.join(
        __dirname,
        '..',
        'site',
        'static',
        'img',
        'blog',
        outputFilename,
      );

      // Ensure directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      if (imageData.b64_json) {
        // If we get base64 data, save it directly
        const buffer = Buffer.from(imageData.b64_json, 'base64');
        fs.writeFileSync(outputPath, buffer);
        console.log(`Image saved to: ${outputPath}`);
      } else if (imageData.url) {
        // If we get a URL, download the image
        await downloadImage(imageData.url, outputPath);
        console.log(`Image downloaded and saved to: ${outputPath}`);
      } else {
        console.error('Unexpected response format:', imageData);
      }
    }
  } catch (error) {
    console.error(`Error ${options.inputImage ? 'editing' : 'generating'} image:`, error);
    process.exit(1);
  }
}

// Check if running as MCP server
if (process.argv.includes('--mcp-server')) {
  // Dynamic imports for MCP server mode
  Promise.all([
    import('@modelcontextprotocol/sdk/server/index.js'),
    import('@modelcontextprotocol/sdk/server/stdio.js'),
  ])
    .then(([{ Server }, { StdioServerTransport }]) => {
      // Create MCP server
      const server = new Server(
        {
          name: 'blog-image-generator',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        },
      );

      // Define the blog image generation tool
      const tools = [
        {
          name: 'generate_blog_image',
          description:
            'Generate or edit blog images using OpenAI gpt-image-1 API following Promptfoo style guide',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: `Image generation/editing prompt (required).

Example prompt for a system cards blog post:
"Create a professional hero image for a blog post about LLM System Cards and AI Safety Documentation.
The image should feature:
- A cute red panda character (the Promptfoo mascot) in a cybersecurity/tech setting
- The red panda should be examining or holding system documentation, security reports, or technical papers
- Include visual elements that suggest security, transparency, and documentation (like shields, locks, checklists, or documents)
- Modern tech aesthetic with a color palette that includes: deep purples, teals, and orange accents (matching Promptfoo's brand)
- The style should be professional but approachable, similar to tech blog illustrations
- Background could include subtle circuit patterns, document icons, or security symbols
- The red panda should look intelligent and focused, perhaps wearing glasses or holding a magnifying glass
- Overall mood: trustworthy, technical, but friendly
Style: Modern tech illustration, clean lines, professional but approachable, suitable for a security-focused blog post"`,
              },
              filename: {
                type: 'string',
                description: `Output filename (default: ${DEFAULT_OPTIONS.filename})`,
                default: DEFAULT_OPTIONS.filename,
              },
              inputImage: {
                type: 'string',
                description: 'Input image path for editing (optional)',
              },
              size: {
                type: 'string',
                description: 'Image size',
                enum: [...VALID_SIZES, 'auto'],
                default: DEFAULT_OPTIONS.size,
              },
              quality: {
                type: 'string',
                description: 'Image quality',
                enum: VALID_QUALITY,
                default: DEFAULT_OPTIONS.quality,
              },
              format: {
                type: 'string',
                description: 'Output format',
                enum: VALID_FORMATS,
                default: DEFAULT_OPTIONS.format,
              },
              numberOfImages: {
                type: 'integer',
                description: 'Number of images to generate',
                minimum: 1,
                maximum: 10,
                default: DEFAULT_OPTIONS.n,
              },
            },
            required: ['prompt'],
          },
        },
        {
          name: 'get_style_guide',
          description: 'Get the Promptfoo blog image style guide and example prompts',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ];

      // Style guide content
      const styleGuide = `# Promptfoo Blog Image Style Guide

## Brand Colors
- Deep purples
- Teals
- Orange accents

## Style Requirements
- Modern tech illustration aesthetic
- Clean lines
- Professional but approachable
- Suitable for technical blog posts

## Red Panda Mascot Guidelines
- Should appear cute and intelligent
- Often shown in tech/cybersecurity settings
- Can be wearing glasses or holding tech items
- Should look focused and engaged

 ## Example Prompt:
 Create a professional hero image for a blog post about LLM System Cards and AI Safety Documentation.
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

      // Handle tool listing
      server.setRequestHandler('tools/list', async () => {
        return { tools };
      });

      // Handle tool calls
      server.setRequestHandler('tools/call', async (request) => {
        const { name, arguments: args } = request.params;

        try {
          let result;

          switch (name) {
            case 'generate_blog_image': {
              // Set up options from MCP arguments
              Object.assign(options, {
                prompt: args.prompt,
                filename: args.filename || DEFAULT_OPTIONS.filename,
                inputImage: args.inputImage,
                size: args.size || DEFAULT_OPTIONS.size,
                quality: args.quality || DEFAULT_OPTIONS.quality,
                format: args.format || DEFAULT_OPTIONS.format,
                n: args.numberOfImages || DEFAULT_OPTIONS.n,
              });

              // Update filename extension based on format
              if (!options.filename.includes('.')) {
                options.filename += `.${options.format}`;
              }

              // Validate parameters
              if (!options.prompt) {
                throw new Error('Prompt is required');
              }

              if (options.filename.includes('..') || options.filename.startsWith('/')) {
                throw new Error('Invalid filename: Path traversal or absolute paths not allowed');
              }

              if (options.size !== 'auto' && !VALID_SIZES.includes(options.size)) {
                throw new Error(
                  `Invalid size: ${options.size}. Valid sizes are: ${VALID_SIZES.join(', ')}, auto`,
                );
              }

              // Run the main image generation function
              await main();

              result = `Image generation completed. Check the output directory for: ${options.filename}`;
              break;
            }

            case 'get_style_guide': {
              result = styleGuide;
              break;
            }

            default:
              throw new Error(`Unknown tool: ${name}`);
          }

          return {
            content: [
              {
                type: 'text',
                text: String(result),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      });

      // Start the MCP server
      async function startMcpServer() {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error('Blog Image Generator MCP Server running...');
      }

      startMcpServer().catch((error) => {
        console.error('MCP Server error:', error);
        process.exit(1);
      });
    })
    .catch((error) => {
      console.error('Failed to load MCP dependencies:', error);
      console.error('Make sure to install: npm install @modelcontextprotocol/sdk');
      process.exit(1);
    });
} else {
  // Normal CLI mode
  main();
}
