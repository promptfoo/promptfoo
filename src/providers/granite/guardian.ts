import path from 'path';
import logger from '../../logger';
import type { ApiModerationProvider, TokenUsage } from '../../types';
import { runCommand } from '../../util/command';

interface GraniteGuardianModerationResult {
  label: string;
  confidence: string;
  probability: number;
  error?: string;
}

/**
 * Provider for Granite Guardian content moderation
 */
export const createGraniteGuardianProvider = (): ApiModerationProvider => {
  const id = () => 'granite-guardian';

  const callModerationApi = async (
    userPrompt: string,
    assistantResponse: string,
    categories?: string[],
  ) => {
    try {
      // Create a temporary Python script to run the moderation
      const scriptPath = path.join(process.cwd(), 'tmp_granite_guardian.py');
      const fs = await import('fs');

      const pythonScript = `
import os
import re
import sys
import json
import math
import torch
from transformers import AutoTokenizer
from vllm import LLM, SamplingParams

def parse_output(output):
    label, confidence, prob_of_risk = None, None, None
    
    if output.outputs[0].logprobs is not None:
        prob = get_probabilities(output.outputs[0].logprobs)
        prob_of_risk = prob[1].item()
    
    output_text = output.outputs[0].text.strip()
    res = re.search(r"^\\w+", output_text, re.MULTILINE).group(0).strip()
    
    if "Yes".lower() == res.lower():
        label = "Yes"
    elif "No".lower() == res.lower():
        label = "No"
    else:
        label = "Failed"
    
    confidence_match = re.search(r'<confidence> (.*?) </confidence>', output_text)
    confidence = confidence_match.group(1).strip() if confidence_match else "Medium"
    
    return label, confidence, prob_of_risk

def get_probabilities(logprobs):
    safe_token_prob = 1e-50
    risky_token_prob = 1e-50
    for gen_token_i in logprobs:
        for token_prob in gen_token_i.values():
            decoded_token = token_prob.decoded_token
            if decoded_token.strip().lower() == "no".lower():
                safe_token_prob += math.exp(token_prob.logprob)
            if decoded_token.strip().lower() == "yes".lower():
                risky_token_prob += math.exp(token_prob.logprob)

    probabilities = torch.softmax(
        torch.tensor([math.log(safe_token_prob), math.log(risky_token_prob)]), dim=0
    )

    return probabilities

def check_moderation(user_text, assistant_text=None, categories=None):
    try:
        model_path = "ibm-granite/granite-guardian-3.2-3b-a800m"
        tokenizer = AutoTokenizer.from_pretrained(model_path)
        
        sampling_params = SamplingParams(temperature=0.0, logprobs=20)
        model = LLM(model=model_path, tensor_parallel_size=1)
        
        # Default to harm if no categories specified
        if not categories or len(categories) == 0:
            risk_name = "harm"
        else:
            # Use the first category
            risk_name = categories[0]
            
        # Check if we need to check the user prompt or assistant response
        if assistant_text:
            messages = [{"role": "user", "content": user_text}, 
                        {"role": "assistant", "content": assistant_text}]
        else:
            messages = [{"role": "user", "content": user_text}]
            
        guardian_config = {"risk_name": risk_name}
        chat = tokenizer.apply_chat_template(messages, 
                                             guardian_config=guardian_config, 
                                             tokenize=False, 
                                             add_generation_prompt=True)
        
        output = model.generate(chat, sampling_params, use_tqdm=False)
        label, confidence, prob_of_risk = parse_output(output[0])
        
        result = {
            "label": label,
            "confidence": confidence,
            "probability": prob_of_risk
        }
        
        print(json.dumps(result))
        return 0
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return 1

if __name__ == "__main__":
    # Get arguments from stdin
    data = json.loads(sys.stdin.read())
    user_text = data.get("user_text", "")
    assistant_text = data.get("assistant_text", None)
    categories = data.get("categories", [])
    
    sys.exit(check_moderation(user_text, assistant_text, categories))
      `;

      fs.writeFileSync(scriptPath, pythonScript);

      // Prepare the data for the Python script
      const data = {
        user_text: userPrompt,
        assistant_text: assistantResponse,
        categories: categories || [], // Pass the categories from the function parameter
      };

      // Run the Python script
      const { stdout, stderr } = await runCommand('python3', [scriptPath], {
        input: JSON.stringify(data),
      });

      // Clean up
      fs.unlinkSync(scriptPath);

      if (stderr) {
        logger.error(`Granite Guardian moderation error: ${stderr}`);
        return {
          flags: [],
          error: `Error running Granite Guardian: ${stderr}`,
        };
      }

      try {
        const result: GraniteGuardianModerationResult = JSON.parse(stdout);

        if (result.error) {
          return {
            flags: [],
            error: `Granite Guardian error: ${result.error}`,
          };
        }

        // If the label is "Yes", it means the content is flagged
        if (result.label === 'Yes') {
          const category = categories && categories.length > 0 ? categories[0] : 'harm';
          return {
            flags: [
              {
                code: category,
                description: `Content flagged for ${category} with ${result.confidence} confidence (${Math.round(result.probability * 100)}%)`,
              },
            ],
          };
        }

        // If the label is "No", the content is not flagged
        return {
          flags: [],
        };
      } catch (error) {
        logger.error(`Error parsing Granite Guardian result: ${error}`);
        return {
          flags: [],
          error: `Error parsing Granite Guardian result: ${error}`,
        };
      }
    } catch (error) {
      logger.error(`Granite Guardian error: ${error}`);
      return {
        flags: [],
        error: `Granite Guardian error: ${error}`,
      };
    }
  };

  return {
    id,
    callModerationApi,
  };
};

export default createGraniteGuardianProvider;
