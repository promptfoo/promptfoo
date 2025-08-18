#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// System prompt for generating high-quality descriptions
const SYSTEM_PROMPT = `You are an expert technical writer specializing in developer documentation and SEO optimization. Your task is to analyze markdown documentation files and generate precise, SEO-optimized meta descriptions.

REQUIREMENTS:
1. Length: 150-160 characters (optimal for search engine snippets)
2. Start with an action verb when appropriate (Configure, Test, Integrate, Use, etc.)
3. Include the most important keywords naturally
4. Be specific about what the page offers - avoid generic descriptions
5. For provider pages: mention specific models or unique capabilities
6. For guide pages: mention the specific problem being solved
7. For red team pages: emphasize the security testing aspect
8. Use technical terms that developers would search for
9. Avoid marketing fluff - be direct and informative
10. Don't use "Learn how to" - jump straight to what the page does

EXAMPLES OF GOOD DESCRIPTIONS:
- "Configure OpenAI GPT-4 and GPT-3.5 models with custom parameters, function calling, and streaming responses for LLM evaluation"
- "Red team SQL injection vulnerabilities by simulating database attacks against LLM-powered applications and agents"
- "Integrate Anthropic's Claude 3 models for advanced reasoning, long-context processing, and constitutional AI testing"

EXAMPLES OF BAD DESCRIPTIONS:
- "Learn about provider integration" (too generic)
- "Documentation for the SQL injection plugin" (doesn't describe value)
- "How to use Claude models" (doesn't specify what or why)`;

// Function to extract frontmatter from markdown
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { frontmatter: '', body: content };

  return {
    frontmatter: match[1],
    body: content.slice(match[0].length),
  };
}

// Function to parse YAML frontmatter (simple parser)
function parseFrontmatter(frontmatterStr) {
  const lines = frontmatterStr.split('\n');
  const result = {};
  let currentKey = null;

  for (const line of lines) {
    if (line.match(/^[a-zA-Z_]+:/)) {
      const [key, ...valueParts] = line.split(':');
      currentKey = key.trim();
      const value = valueParts.join(':').trim();
      result[currentKey] = value.replace(/^["']|["']$/g, '');
    }
  }

  return result;
}

// Function to generate description using Claude
async function generateDescription(filePath, content) {
  try {
    // Extract the first 3000 characters for context (to save tokens)
    const truncatedContent = content.slice(0, 3000);

    const prompt = `Analyze this documentation file and generate a meta description.

File path: ${filePath}
File name: ${path.basename(filePath)}
Directory: ${path.dirname(filePath).split('/').pop()}

Content (truncated):
${truncatedContent}

Generate a single meta description (150-160 characters) that captures the essence of this documentation page. Focus on what developers can DO with this page.

Description:`;

    const response = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 100,
      temperature: 0.3, // Lower temperature for more consistent output
    });

    return response.content[0].text.trim().replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error(`Error generating description for ${filePath}:`, error.message);
    return null;
  }
}

// Function to update frontmatter with new description
function updateFrontmatter(content, description) {
  const { frontmatter, body } = extractFrontmatter(content);
  const parsed = parseFrontmatter(frontmatter);

  // Check if description already exists
  if (parsed.description) {
    console.log('  → Description already exists, skipping');
    return null;
  }

  // Add description to frontmatter
  const updatedFrontmatter = frontmatter + `\ndescription: "${description}"`;

  return `---\n${updatedFrontmatter}\n---${body}`;
}

// Main function to process files
async function processFiles() {
  // Find all markdown files without descriptions
  const siteDir = path.join(__dirname, 'site');
  const files = [];

  function findMarkdownFiles(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        findMarkdownFiles(fullPath);
      } else if (item.endsWith('.md') || item.endsWith('.mdx')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const { frontmatter } = extractFrontmatter(content);
        const parsed = parseFrontmatter(frontmatter);

        // Only process files without descriptions
        if (!parsed.description) {
          files.push({
            path: fullPath,
            relativePath: path.relative(__dirname, fullPath),
            content,
          });
        }
      }
    }
  }

  console.log('🔍 Scanning for markdown files without descriptions...\n');
  findMarkdownFiles(siteDir);

  console.log(`Found ${files.length} files without descriptions\n`);

  if (files.length === 0) {
    console.log('✅ All files already have descriptions!');
    return;
  }

  // Process files in batches to avoid rate limiting
  const BATCH_SIZE = 5;
  const DELAY_MS = 2000; // 2 second delay between batches

  const results = [];

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, Math.min(i + BATCH_SIZE, files.length));

    console.log(
      `\n📝 Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(files.length / BATCH_SIZE)}...`,
    );

    const batchPromises = batch.map(async (file) => {
      console.log(`  Analyzing: ${file.relativePath}`);
      const description = await generateDescription(file.path, file.content);

      if (description) {
        return {
          path: file.path,
          relativePath: file.relativePath,
          description,
          content: file.content,
        };
      }
      return null;
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter((r) => r !== null));

    // Wait between batches to avoid rate limiting
    if (i + BATCH_SIZE < files.length) {
      console.log(`  ⏳ Waiting ${DELAY_MS / 1000} seconds before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  // Display all proposed changes
  console.log('\n' + '='.repeat(80));
  console.log('📋 PROPOSED DESCRIPTIONS');
  console.log('='.repeat(80) + '\n');

  for (const result of results) {
    console.log(`📄 ${result.relativePath}`);
    console.log(`   "${result.description}"`);
    console.log(`   Length: ${result.description.length} characters\n`);
  }

  // Ask for confirmation
  console.log('='.repeat(80));
  console.log(`\n🤔 Ready to update ${results.length} files with new descriptions.`);
  console.log('   Do you want to apply these changes? (yes/no): ');

  // Read user input
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  readline.question('', (answer) => {
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      // Apply changes
      let updatedCount = 0;

      for (const result of results) {
        const updatedContent = updateFrontmatter(result.content, result.description);
        if (updatedContent) {
          fs.writeFileSync(result.path, updatedContent, 'utf-8');
          updatedCount++;
          console.log(`✅ Updated: ${result.relativePath}`);
        }
      }

      console.log(`\n🎉 Successfully updated ${updatedCount} files!`);
    } else {
      console.log('\n❌ Changes cancelled. No files were modified.');
    }

    readline.close();
  });
}

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ Error: ANTHROPIC_API_KEY environment variable is not set');
  console.error('   Please set it in your .env file or export it:');
  console.error('   export ANTHROPIC_API_KEY=your-api-key');
  process.exit(1);
}

// Run the script
processFiles().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
