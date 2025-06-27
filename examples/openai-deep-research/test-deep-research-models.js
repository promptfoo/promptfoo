#!/usr/bin/env node

const { OpenAiResponsesProvider } = require('../../dist/src/providers/openai/responses.js');

// Test that deep research models are properly configured
function testDeepResearchModels() {
  console.log('🧪 Testing OpenAI Deep Research Models Configuration...\n');

  const models = [
    'o3-deep-research',
    'o3-deep-research-2025-06-26',
    'o4-mini-deep-research',
    'o4-mini-deep-research-2025-06-26'
  ];

  let allPassed = true;

  for (const modelName of models) {
    try {
      console.log(`Testing ${modelName}...`);
      
      // Create provider instance
      const provider = new OpenAiResponsesProvider(modelName, {
        config: {
          max_output_tokens: 20000,
          tools: [
            { type: 'web_search_preview' }
          ]
        }
      });

      // Test that it's identified as a reasoning model
      const isReasoning = provider.isReasoningModel();
      console.log(`  ✓ isReasoningModel(): ${isReasoning}`);
      
      // Test that it's identified as a deep research model
      const isDeepResearch = provider.isDeepResearchModel();
      console.log(`  ✓ isDeepResearchModel(): ${isDeepResearch}`);
      
      // Test that it doesn't support temperature (reasoning models don't)
      const supportsTemp = provider.supportsTemperature();
      console.log(`  ✓ supportsTemperature(): ${supportsTemp} (should be false)`);

      // Test that the model name is in the supported list
      const isInList = OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES.includes(modelName);
      console.log(`  ✓ inSupportedList(): ${isInList}`);

      // Validate expectations
      if (!isReasoning) {
        console.log(`  ❌ ERROR: ${modelName} should be identified as a reasoning model`);
        allPassed = false;
      }
      if (!isDeepResearch) {
        console.log(`  ❌ ERROR: ${modelName} should be identified as a deep research model`);
        allPassed = false;
      }
      if (supportsTemp) {
        console.log(`  ❌ ERROR: ${modelName} should not support temperature`);
        allPassed = false;
      }
      if (!isInList) {
        console.log(`  ❌ ERROR: ${modelName} should be in supported model list`);
        allPassed = false;
      }

      console.log(`  ✅ ${modelName} configuration is correct\n`);
      
    } catch (error) {
      console.log(`  ❌ ERROR testing ${modelName}: ${error.message}\n`);
      allPassed = false;
    }
  }

  // Test the API body generation
  try {
    console.log('Testing API body generation...');
    const provider = new OpenAiResponsesProvider('o4-mini-deep-research', {
      config: {
        max_output_tokens: 20000,
        tools: [{ type: 'web_search_preview' }]
      }
    });

    const { body } = provider.getOpenAiBody('Test research prompt');
    
    console.log(`  ✓ Model: ${body.model}`);
    console.log(`  ✓ Input: ${body.input}`);
    console.log(`  ✓ Max output tokens: ${body.max_output_tokens}`);
    console.log(`  ✓ Tools: ${JSON.stringify(body.tools)}`);
    console.log(`  ✓ Text format: ${JSON.stringify(body.text)}`);
    
    if (body.model !== 'o4-mini-deep-research') {
      throw new Error(`Expected model to be 'o4-mini-deep-research', got '${body.model}'`);
    }
    if (body.max_output_tokens !== 20000) {
      throw new Error(`Expected max_output_tokens to be 20000, got ${body.max_output_tokens}`);
    }
    if (!body.tools || body.tools.length !== 1 || body.tools[0].type !== 'web_search_preview') {
      throw new Error(`Expected web_search_preview tool, got ${JSON.stringify(body.tools)}`);
    }
    
    console.log(`  ✅ API body generation is correct\n`);
    
  } catch (error) {
    console.log(`  ❌ ERROR testing API body generation: ${error.message}\n`);
    allPassed = false;
  }

  // Final result
  if (allPassed) {
    console.log('🎉 ALL TESTS PASSED! Deep research models are properly configured.\n');
    console.log('📝 Note: This validates the configuration. To test actual API calls,');
    console.log('   set OPENAI_API_KEY and run: npm run local -- eval -c promptfooconfig-fallback.yaml');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED! Check the errors above.');
    process.exit(1);
  }
}

testDeepResearchModels(); 