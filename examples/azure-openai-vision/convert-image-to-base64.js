#!/usr/bin/env node

/**
 * Simple utility to convert an image file to base64 data URI
 * Usage: node convert-image-to-base64.js <image-path>
 */

const fs = require('fs');
const path = require('path');

const imagePath = process.argv[2];

if (!imagePath) {
  console.error('Usage: node convert-image-to-base64.js <image-path>');
  process.exit(1);
}

try {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64 = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).toLowerCase().slice(1);
  const mimeType = ext === 'jpg' ? 'jpeg' : ext;

  const dataUri = `data:image/${mimeType};base64,${base64}`;

  console.log('\nBase64 Data URI:');
  console.log(dataUri);
  console.log('\nLength:', dataUri.length, 'characters');
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
