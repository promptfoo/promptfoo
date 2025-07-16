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
let options = {
  filename: 'blog-image.png',
  prompt: '',
  inputImage: null,
  mask: null,
  size: '1024x1024',
  quality: 'high',
  format: 'png',
  compression: null,
  background: null,
  n: 1,
};

// Helper function to encode image to base64
function encodeImage(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
}

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
  } else if (args[i] === '--mask' || args[i] === '-m') {
    options.mask = args[i + 1];
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
  -f, --filename <name>     Output filename (default: blog-image.png)
  -p, --prompt <text>       Image generation/editing prompt (required)
  -i, --input <path>        Input image path for editing (optional)
  -m, --mask <path>         Mask image path for inpainting (optional)
  -s, --size <size>         Image size: 1024x1024, 1536x1024, 1024x1536, auto (default: 1024x1024)
  -q, --quality <quality>   Quality: low, medium, high, auto (default: high)
  --format <format>         Output format: png, jpeg, webp (default: png)
  -c, --compression <0-100> Compression level for JPEG/WebP (optional)
  -t, --transparent         Enable transparent background (PNG/WebP only)
  -n, --number <n>          Number of images to generate (default: 1)
  -h, --help               Show this help message

Examples:
  # Generate a new image
  node generate-blog-image.js -f hero.png -p "A red panda reading documentation"
  
  # Edit an existing image
  node generate-blog-image.js -i input.png -f output.png -p "Add a hat to the red panda"
  
  # Edit with a mask (inpainting)
  node generate-blog-image.js -i photo.png -m mask.png -f result.png -p "Replace masked area with flowers"
  
  # Generate with transparency
  node generate-blog-image.js -f sprite.png -p "2D pixel art cat sprite" -t -q high
  
  # Generate multiple variations
  node generate-blog-image.js -f "image-{n}.png" -p "Cybersecurity visualization" -n 3
`);
    process.exit(0);
  }
}

// Validate required parameters
if (!options.prompt) {
  console.error('Please provide a prompt using --prompt or -p');
  console.log('Use --help for usage information');
  process.exit(1);
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

    // Add the mask if provided
    if (options.mask) {
      const maskData = fs.readFileSync(options.mask);
      parts.push(
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="mask"; filename="mask.png"\r\n`,
        `Content-Type: image/png\r\n\r\n`,
      );
      parts.push(maskData);
      parts.push('\r\n');
    }

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

    if (options.mask && !fs.existsSync(options.mask)) {
      throw new Error(`Mask image not found: ${options.mask}`);
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

main();
