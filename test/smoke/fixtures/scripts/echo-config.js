#!/usr/bin/env node
// Helper script that echoes back the prompt config including tools and tool_choice
// exec provider passes: [node, script, prompt, providerConfig, contextConfig]
const prompt = process.argv[2];
const providerConfig = JSON.parse(process.argv[3] || '{}');
console.log(JSON.stringify({
  prompt: prompt,
  tools: providerConfig.config?.tools,
  tool_choice: providerConfig.config?.tool_choice
}));
