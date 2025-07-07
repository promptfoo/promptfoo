#!/usr/bin/env node

/**
 * Helper script to convert local images to base64 format for use in tests
 * Usage: node convert-image-to-base64.js <image-path>
 */

const fs = require('fs');
const path = require('path');

function convertImageToBase64(imagePath) {
  try {
    // Read the image file
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Convert to base64
    const base64String = imageBuffer.toString('base64');
    
    // Get the file extension to determine MIME type
    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp'
    };
    
    const mimeType = mimeTypes[ext] || 'image/jpeg';
    
    // Create the data URI
    const dataUri = `data:${mimeType};base64,${base64String}`;
    
    return {
      base64: base64String,
      dataUri: dataUri,
      mimeType: mimeType,
      size: imageBuffer.length
    };
  } catch (error) {
    console.error('Error converting image:', error.message);
    return null;
  }
}

// Command line usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node convert-image-to-base64.js <image-path>');
    console.log('Example: node convert-image-to-base64.js ./my-image.jpg');
    process.exit(1);
  }
  
  const imagePath = args[0];
  
  if (!fs.existsSync(imagePath)) {
    console.error(`Error: File not found: ${imagePath}`);
    process.exit(1);
  }
  
  const result = convertImageToBase64(imagePath);
  
  if (result) {
    console.log('\n=== Image Conversion Results ===');
    console.log(`File: ${path.basename(imagePath)}`);
    console.log(`MIME Type: ${result.mimeType}`);
    console.log(`Size: ${(result.size / 1024).toFixed(2)} KB`);
    console.log('\n--- Data URI (for use in promptfoo tests) ---');
    console.log(result.dataUri.substring(0, 100) + '...');
    console.log('\n--- Base64 Only (first 100 chars) ---');
    console.log(result.base64.substring(0, 100) + '...');
    console.log('\n--- Full Data URI ---');
    console.log('(Copy the line below for use in your tests)');
    console.log(result.dataUri);
  }
}

module.exports = { convertImageToBase64 }; 