// ARC-AGI-3 Agent Evaluator
// Evaluates Python-based game agents by executing their code

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function evaluate(output, context) {
  // Extract Python code
  const codeMatch = output.match(/```python\s*([\s\S]*?)\s*```/);
  if (!codeMatch) {
    return { pass: false, score: 0, reason: 'No Python code found in response' };
  }
  
  const pythonCode = codeMatch[1];
  const tempId = crypto.randomBytes(8).toString('hex');
  const tempFile = path.join('/tmp', `arc_agent_${tempId}.py`);
  
  const fullScript = `
import json
import sys

${pythonCode}

# Test execution
state = ${context.vars.game_state}
available_actions = ${context.vars.available_actions}
history = ${context.vars.action_history}

try:
    if 'choose_action' not in globals():
        print(json.dumps({"error": "No choose_action function found"}))
        sys.exit(1)
    
    result = choose_action(state, available_actions, history)
    
    # Validate result structure
    if not isinstance(result, dict) or 'action' not in result:
        print(json.dumps({"error": "Result must be a dict with 'action' key"}))
        sys.exit(1)
    
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
`;
  
  try {
    fs.writeFileSync(tempFile, fullScript);
    const pythonOutput = execSync(`python3 ${tempFile}`, {
      timeout: 3000,
      encoding: 'utf8'
    });
    
    const result = JSON.parse(pythonOutput);
    
    if (result.error) {
      return { pass: false, score: 0, reason: `Python error: ${result.error}` };
    }
    
    // Check if action is valid
    const availableActions = JSON.parse(context.vars.available_actions);
    if (!availableActions.includes(result.action)) {
      return { 
        pass: false, 
        score: 0, 
        reason: `Invalid action: ${result.action}. Available: ${availableActions.join(', ')}` 
      };
    }
    
    // Evaluate based on the test scenario
    let score = 0.5; // Base score for valid action
    let reason = `Executed action: ${result.action}`;
    let pass = false;
    
    // Navigation scenario evaluation
    if (context.vars.objective && context.vars.objective.includes("Reach the target")) {
      const state = JSON.parse(context.vars.game_state);
      const playerPos = state.player_pos;
      const targetPos = state.target_pos;
      
      // Calculate if action moves towards target
      const dx = targetPos[0] - playerPos[0];
      const dy = targetPos[1] - playerPos[1];
      
      const goodMoves = [];
      if (dx > 0) goodMoves.push('MOVE_RIGHT');
      if (dx < 0) goodMoves.push('MOVE_LEFT');
      if (dy > 0) goodMoves.push('MOVE_DOWN');
      if (dy < 0) goodMoves.push('MOVE_UP');
      
      if (goodMoves.includes(result.action)) {
        score = 1.0;
        pass = true;
        reason = `✅ Good move: ${result.action} moves towards target`;
      } else if (result.action === 'RESET') {
        score = 0.1;
        reason = `Reset action - not optimal for reaching target`;
      } else {
        score = 0.3;
        reason = `Suboptimal: ${result.action} doesn't move directly towards target`;
      }
    }
    
    // Exploration scenario evaluation
    else if (context.vars.objective && context.vars.objective.includes("Find and collect")) {
      const state = JSON.parse(context.vars.game_state);
      
      // Good actions depend on context
      if (result.action === 'EXPLORE' && state.items_found < state.total_items) {
        score = 1.0;
        pass = true;
        reason = `✅ Good choice: Exploring to find remaining items`;
      } else if (result.action === 'COLLECT') {
        score = 0.8;
        pass = true;
        reason = `Collect action - make sure item is present`;
      } else if (['MOVE_UP', 'MOVE_DOWN', 'MOVE_LEFT', 'MOVE_RIGHT'].includes(result.action)) {
        score = 0.6;
        pass = true;
        reason = `Movement action - exploring new areas`;
      }
    }
    
    return { pass, score, reason };
    
  } catch (error) {
    let errorMsg = 'Unknown error';
    if (error.code === 'ETIMEDOUT') {
      errorMsg = 'Python execution timed out (3s limit)';
    } else if (error.message) {
      errorMsg = error.message.split('\n')[0];
    }
    
    return { pass: false, score: 0, reason: `Execution failed: ${errorMsg}` };
  } finally {
    try { 
      fs.unlinkSync(tempFile); 
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

module.exports = evaluate; 