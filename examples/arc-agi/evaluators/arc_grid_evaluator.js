// ARC-AGI Grid Evaluator
// Checks if the predicted output matches the expected output grid exactly

// Extract the output from the response
let predicted;

// Handle different response formats
if (output.includes('<output>')) {
  // Extract from XML tags
  const match = output.match(/<output>([\s\S]*?)<\/output>/);
  if (match) {
    try {
      predicted = JSON.parse(match[1].trim());
    } catch (e) {
      // Try to clean up common issues
      const cleaned = match[1].trim().replace(/'/g, '"');
      predicted = JSON.parse(cleaned);
    }
  }
} else if (output.includes('```json')) {
  // Extract from JSON code block
  const match = output.match(/```json\s*([\s\S]*?)\s*```/);
  if (match) {
    predicted = JSON.parse(match[1]);
  }
} else if (output.includes('```')) {
  // Extract from any code block
  const match = output.match(/```(?:\w+)?\s*([\s\S]*?)\s*```/);
  if (match) {
    const codeContent = match[1];
    // Look for array pattern
    const arrayMatch = codeContent.match(/(\[\[[\s\S]*?\]\])/);
    if (arrayMatch) {
      predicted = JSON.parse(arrayMatch[1].replace(/'/g, '"'));
    }
  }
} else if (output.includes('def transform')) {
  // For program synthesis, try to extract the final output
  const patterns = [
    /(?:output|result|final_output)\s*=\s*(\[\[[\s\S]*?\]\])/,
    /return\s+(\[\[[\s\S]*?\]\])/,
    /print\s*\(\s*(\[\[[\s\S]*?\]\])\s*\)/
  ];
  
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      predicted = JSON.parse(match[1].replace(/'/g, '"'));
      break;
    }
  }
} else {
  // Try to parse the entire output as JSON
  try {
    predicted = JSON.parse(output);
  } catch (e) {
    // Try to find a JSON array anywhere in the output
    const match = output.match(/\[\[[\s\S]*?\]\]/);
    if (match) {
      predicted = JSON.parse(match[0].replace(/'/g, '"'));
    }
  }
}

if (!predicted) {
  return {
    pass: false,
    score: 0,
    reason: 'Could not extract a valid output grid from the response'
  };
}

const expected = context.vars.expected_output;

// Ensure both are arrays
if (!Array.isArray(predicted) || !Array.isArray(expected)) {
  return {
    pass: false,
    score: 0,
    reason: 'Output or expected value is not an array'
  };
}

// Check if dimensions match
if (predicted.length !== expected.length || 
    (predicted[0] && expected[0] && predicted[0].length !== expected[0].length)) {
  return {
    pass: false,
    score: 0,
    reason: `Dimension mismatch. Expected ${expected.length}x${expected[0]?.length || 0}, got ${predicted.length}x${predicted[0]?.length || 0}`
  };
}

// Calculate pixel accuracy
let correct = 0;
let total = 0;
let mismatchDetails = [];

for (let i = 0; i < expected.length; i++) {
  for (let j = 0; j < expected[i].length; j++) {
    total++;
    if (predicted[i] && predicted[i][j] === expected[i][j]) {
      correct++;
    } else {
      if (mismatchDetails.length < 5) { // Only show first 5 mismatches
        mismatchDetails.push(`[${i},${j}]: expected ${expected[i][j]}, got ${predicted[i]?.[j]}`);
      }
    }
  }
}

const accuracy = total > 0 ? correct / total : 0;
const pass = accuracy === 1.0;

let reason = pass ? 'Perfect match! ✅' : `Pixel accuracy: ${(accuracy * 100).toFixed(1)}% (${correct}/${total} pixels)`;
if (!pass && mismatchDetails.length > 0) {
  reason += '\nFirst mismatches: ' + mismatchDetails.join(', ');
  if (total - correct > 5) {
    reason += `, ... and ${total - correct - mismatchDetails.length} more`;
  }
}

return {
  pass,
  score: accuracy,
  reason
}; 