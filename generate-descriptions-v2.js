#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Load .env file
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Context about promptfoo for better descriptions
const PROMPTFOO_CONTEXT = `
Promptfoo is the leading open-source LLM testing and red teaming framework. It helps developers:
- Evaluate and compare LLM outputs
- Red team AI systems for security vulnerabilities  
- Test for prompt injection, jailbreaks, and other attacks
- Integrate with 50+ LLM providers
- Run in CI/CD pipelines
Key differentiators: Most comprehensive red teaming capabilities, largest provider support, enterprise-ready.
Competitors: Garak, PyRIT, LangSmith (but we're open source and more comprehensive).
`;

// Different system prompts for different page types
const SYSTEM_PROMPTS = {
  'red-team': `You are a security-focused technical writer creating meta descriptions for AI red teaming documentation.

${PROMPTFOO_CONTEXT}

REQUIREMENTS:
1. Length: 140-155 characters (optimal for Google SERP)
2. MUST start with "Red team" or similar security action verb
3. Include specific attack/vulnerability type being tested
4. Mention the security outcome or what gets protected
5. Use terms like: adversarial testing, security assessment, vulnerability detection
6. Convey urgency - these are critical security issues
7. Be specific about the threat model

FORMULA: "Red team [specific vulnerability] by [method] to [outcome/protection]"

GOOD EXAMPLES:
- "Red team SQL injection attacks by simulating malicious database queries to protect LLM-powered applications from data breaches"
- "Red team prompt extraction vulnerabilities using advanced techniques to prevent system prompt leakage in production AI"`,

  providers: `You are a technical writer creating meta descriptions for LLM provider integration documentation.

${PROMPTFOO_CONTEXT}

REQUIREMENTS:  
1. Length: 140-155 characters
2. Start with action verb: Configure, Connect, Integrate, Deploy, Use
3. MUST mention specific models or unique capabilities of this provider
4. Include use case or what makes this provider special
5. Keywords: API, models, inference, deployment, integration
6. Mention compatibility (OpenAI-compatible, local, cloud, etc.) when relevant

FORMULA: "[Action] [Provider]'s [specific models/feature] for [use case/benefit]"

GOOD EXAMPLES:
- "Configure OpenAI's GPT-4, GPT-4o, and o1 models with function calling, streaming, and advanced parameters for LLM testing"
- "Deploy Llama 3.3 locally with Ollama for private, offline LLM evaluation without sending data to external APIs"`,

  guides: `You are creating meta descriptions for technical guides and tutorials.

${PROMPTFOO_CONTEXT}

REQUIREMENTS:
1. Length: 140-155 characters  
2. Focus on the PROBLEM being solved, not the solution
3. Include specific metrics, models, or techniques being compared
4. Use outcome-focused language
5. Include numbers/data when relevant (X vs Y comparison, N% improvement)
6. Keywords: benchmark, compare, evaluate, optimize, measure

FORMULA: "[Problem/Comparison] with [specific method] to [measurable outcome]"

GOOD EXAMPLES:
- "Compare GPT-4o vs Claude 3.7 Opus performance on reasoning tasks with automated benchmarks to choose the best model"
- "Eliminate LLM hallucinations using fact-checking assertions and grounding techniques for reliable AI applications"`,

  strategies: `You are a security researcher creating meta descriptions for jailbreak and attack strategies.

${PROMPTFOO_CONTEXT}

REQUIREMENTS:
1. Length: 140-155 characters
2. Explain the attack technique clearly
3. Include technical details (encoding, multi-turn, etc.)
4. Mention effectiveness or research backing
5. Use security terminology: bypass, evade, exploit, jailbreak
6. Convey sophistication level

GOOD EXAMPLES:
- "Bypass LLM safety filters using multilingual prompt injection across 30+ languages to uncover localization vulnerabilities"
- "Execute multi-turn jailbreaks with GOAT's 97% success rate using adversarial AI to dynamically adapt attack strategies"`,

  default: `You are a technical writer creating SEO-optimized meta descriptions for developer documentation.

${PROMPTFOO_CONTEXT}

REQUIREMENTS:
1. Length: 140-155 characters (optimal for Google SERP)
2. Start with an action verb when appropriate
3. Be specific about capabilities and benefits
4. Include technical keywords developers search for
5. Avoid generic phrases like "Learn how to" or "Documentation for"
6. Focus on what developers can DO with this page

GOOD EXAMPLES:
- "Configure automated LLM evaluation pipelines with assertions, metrics, and CI/CD integration for production AI testing"
- "Troubleshoot common LLM testing issues with solutions for rate limits, API errors, and performance optimization"`,
};

// Function to determine page type from path
function getPageType(filePath) {
  if (filePath.includes('/red-team/')) {
    if (filePath.includes('/strategies/')) return 'strategies';
    return 'red-team';
  }
  if (filePath.includes('/providers/')) return 'providers';
  if (filePath.includes('/guides/')) return 'guides';
  return 'default';
}

// Function to extract meaningful content from markdown
function extractMeaningfulContent(content, filePath) {
  const lines = content.split('\n');
  const meaningfulParts = [];

  // Extract title
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    meaningfulParts.push(`Title: ${titleMatch[1]}`);
  }

  // Extract first paragraph after title
  const firstParaMatch = content.match(/^#[^#][\s\S]*?\n\n(.+?)(?:\n\n|$)/m);
  if (firstParaMatch) {
    meaningfulParts.push(`Introduction: ${firstParaMatch[1]}`);
  }

  // Extract section headers to understand structure
  const headers = content.match(/^##\s+.+$/gm);
  if (headers) {
    meaningfulParts.push(`Sections: ${headers.slice(0, 5).join(', ')}`);
  }

  // Extract code configuration examples if present
  const configMatch = content.match(/```yaml[\s\S]*?```/);
  if (configMatch) {
    meaningfulParts.push(`Has configuration examples`);
  }

  // Extract key features or purposes
  const purposeMatch = content.match(/purpose[s]?:([\s\S]*?)(?:^#|^##|\n\n)/im);
  if (purposeMatch) {
    meaningfulParts.push(`Purpose: ${purposeMatch[1].slice(0, 200)}`);
  }

  // For providers, extract model names
  if (filePath.includes('/providers/')) {
    const modelMatches = content.match(
      /\b(gpt-4|claude|llama|mistral|gemini|palm|command|jurassic)[\w-]*\b/gi,
    );
    if (modelMatches) {
      const unique = [...new Set(modelMatches.map((m) => m.toLowerCase()))];
      meaningfulParts.push(`Models: ${unique.slice(0, 5).join(', ')}`);
    }
  }

  // Add the first 1500 chars as fallback context
  meaningfulParts.push(`\nContent excerpt:\n${content.slice(0, 1500)}`);

  return meaningfulParts.join('\n\n');
}

// Function to generate description using Claude
async function generateDescription(filePath, content, retryCount = 0) {
  try {
    const pageType = getPageType(filePath);
    const systemPrompt = SYSTEM_PROMPTS[pageType];
    const meaningfulContent = extractMeaningfulContent(content, filePath);

    const prompt = `Analyze this ${pageType} documentation page and generate a meta description.

File: ${path.basename(filePath)}
Path: ${filePath}
Type: ${pageType}

${meaningfulContent}

CRITICAL: Generate exactly ONE meta description (140-155 characters).
Do not include quotes. Do not include explanation. Just the description text.

Description:`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022', // Using latest Sonnet for better quality/cost ratio
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 100,
      temperature: 0.2, // Lower for consistency
    });

    const description = response.content[0].text.trim().replace(/^["']|["']$/g, '');

    // Validate description
    if (description.length < 100 || description.length > 170) {
      console.warn(`  ⚠️  Description length ${description.length} outside target range`);
      if (retryCount < 1) {
        console.log(`  🔄 Retrying...`);
        return generateDescription(filePath, content, retryCount + 1);
      }
    }

    return description;
  } catch (error) {
    console.error(`  ❌ Error for ${path.basename(filePath)}: ${error.message}`);
    if (retryCount < 1) {
      console.log(`  🔄 Retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return generateDescription(filePath, content, retryCount + 1);
    }
    return null;
  }
}

// Function to process frontmatter properly
function updateFileWithDescription(content, description) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    // No frontmatter, add it
    return `---\ndescription: "${description}"\n---\n${content}`;
  }

  try {
    const frontmatterContent = frontmatterMatch[1];
    const frontmatterData = yaml.load(frontmatterContent) || {};

    // Check if description exists
    if (frontmatterData.description && !process.argv.includes('--force')) {
      return null;
    }

    // Add or update description
    frontmatterData.description = description;

    // Convert back to YAML
    const newFrontmatter = yaml.dump(frontmatterData, {
      lineWidth: -1, // Don't wrap lines
      quotingType: '"', // Use double quotes
      forceQuotes: false, // Only quote when necessary
    });

    // Reconstruct the file
    const body = content.slice(frontmatterMatch[0].length);
    return `---\n${newFrontmatter}---${body}`;
  } catch (error) {
    console.error('  ❌ YAML parsing error:', error.message);
    return null;
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const forceMode = args.includes('--force');
  const specificPath = args.find((arg) => !arg.startsWith('--'));

  if (args.includes('--help')) {
    console.log(`
Usage: node generate-descriptions-v2.js [options] [path]

Options:
  --test     Process only 5 files for testing
  --force    Regenerate descriptions even if they exist
  --export   Export to JSON without applying changes
  [path]     Process only files in specific directory

Examples:
  node generate-descriptions-v2.js --test
  node generate-descriptions-v2.js site/docs/providers
  node generate-descriptions-v2.js --force site/docs/red-team
`);
    process.exit(0);
  }

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set. Add to .env or export it.');
    process.exit(1);
  }

  // Find files
  const baseDir = specificPath ? path.resolve(specificPath) : path.join(__dirname, 'site');
  const files = [];

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;

    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        scanDir(fullPath);
      } else if (item.endsWith('.md') || item.endsWith('.mdx')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

        if (frontmatterMatch) {
          try {
            const data = yaml.load(frontmatterMatch[1]) || {};
            if (!data.description || forceMode) {
              files.push({
                path: fullPath,
                relativePath: path.relative(__dirname, fullPath),
                content,
                existingDescription: data.description,
              });
            }
          } catch (e) {
            // Include files with invalid YAML
            files.push({
              path: fullPath,
              relativePath: path.relative(__dirname, fullPath),
              content,
              yamlError: true,
            });
          }
        } else {
          // Include files without frontmatter
          files.push({
            path: fullPath,
            relativePath: path.relative(__dirname, fullPath),
            content,
            noFrontmatter: true,
          });
        }
      }
    }
  }

  console.log('🔍 Scanning for markdown files...\n');
  scanDir(baseDir);

  if (files.length === 0) {
    console.log('✅ No files need descriptions!');
    process.exit(0);
  }

  // In test mode, only process first 10
  const filesToProcess = testMode ? files.slice(0, 10) : files;

  console.log(`📊 Found ${files.length} files to process`);
  if (testMode) console.log(`  🧪 Test mode: Processing only first 10 files`);
  if (forceMode) console.log(`  💪 Force mode: Regenerating existing descriptions`);
  console.log('');

  // Process in batches
  const BATCH_SIZE = 3; // Smaller batches for better quality
  const results = [];

  for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
    const batch = filesToProcess.slice(i, Math.min(i + BATCH_SIZE, filesToProcess.length));
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(filesToProcess.length / BATCH_SIZE);

    console.log(`\n📝 Batch ${batchNum}/${totalBatches}`);
    console.log('─'.repeat(50));

    const batchPromises = batch.map(async (file) => {
      const type = getPageType(file.path);
      console.log(`  📄 ${path.basename(file.path)} (${type})`);

      if (file.yamlError) {
        console.log(`     ⚠️  YAML parse error - skipping`);
        return null;
      }

      const description = await generateDescription(file.path, file.content);

      if (description) {
        console.log(`     ✓ Generated: ${description.length} chars`);
        return {
          ...file,
          description,
          pageType: type,
        };
      }
      return null;
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter((r) => r !== null));

    // Rate limit delay
    if (i + BATCH_SIZE < filesToProcess.length) {
      console.log(`\n⏳ Waiting 2s before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Display results
  console.log('\n' + '═'.repeat(80));
  console.log('📋 GENERATED DESCRIPTIONS');
  console.log('═'.repeat(80) + '\n');

  // Group by type
  const byType = {};
  for (const result of results) {
    if (!byType[result.pageType]) byType[result.pageType] = [];
    byType[result.pageType].push(result);
  }

  for (const [type, items] of Object.entries(byType)) {
    console.log(`\n📁 ${type.toUpperCase()} (${items.length} files)`);
    console.log('─'.repeat(50));

    for (const item of items) {
      console.log(`\n📄 ${item.relativePath}`);
      if (item.existingDescription) {
        console.log(`   OLD: "${item.existingDescription}"`);
      }
      console.log(`   NEW: "${item.description}"`);
      console.log(`   Length: ${item.description.length} chars`);
    }
  }

  // Summary statistics
  console.log('\n' + '═'.repeat(80));
  console.log('📊 SUMMARY');
  console.log('─'.repeat(50));
  console.log(`  Total files processed: ${results.length}`);
  console.log(
    `  Average length: ${Math.round(results.reduce((a, r) => a + r.description.length, 0) / results.length)} chars`,
  );
  console.log(
    `  By type: ${Object.entries(byType)
      .map(([t, items]) => `${t}=${items.length}`)
      .join(', ')}`,
  );

  if (args.includes('--export')) {
    const exportPath = 'descriptions-export.json';
    const exportData = results.map((r) => ({
      file: r.relativePath,
      description: r.description,
      type: r.pageType,
      length: r.description.length,
    }));
    fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
    console.log(`\n✅ Exported to ${exportPath}`);
    process.exit(0);
  }

  // Ask for confirmation
  console.log('\n' + '═'.repeat(80));
  console.log(`\n🤔 Apply these descriptions to ${results.length} files?`);

  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  readline.question('   Type "yes" to confirm, anything else to cancel: ', (answer) => {
    if (answer.toLowerCase() === 'yes') {
      let updated = 0;
      let failed = 0;

      for (const result of results) {
        const newContent = updateFileWithDescription(result.content, result.description);
        if (newContent) {
          try {
            fs.writeFileSync(result.path, newContent, 'utf-8');
            console.log(`✅ ${result.relativePath}`);
            updated++;
          } catch (error) {
            console.error(`❌ Failed to write ${result.relativePath}: ${error.message}`);
            failed++;
          }
        } else if (!result.existingDescription) {
          console.log(`⏭️  Skipped ${result.relativePath} (already has description)`);
        }
      }

      console.log(
        `\n🎉 Complete! Updated ${updated} files${failed > 0 ? `, ${failed} failed` : ''}`,
      );
    } else {
      console.log('\n❌ Cancelled. No files modified.');
    }

    readline.close();
  });
}

// Run
main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
