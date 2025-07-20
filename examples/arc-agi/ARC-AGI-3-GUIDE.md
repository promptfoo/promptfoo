# ARC-AGI-3 Integration Guide

ARC-AGI-3 is the latest evolution of the ARC benchmark, introducing interactive game-based challenges that test AI agents' abilities in:
- Exploration
- Planning and action sequences
- Memory and state tracking
- Goal acquisition
- Alignment with objectives

## Key Differences from ARC-AGI-1/2

| Feature    | ARC-AGI-1/2            | ARC-AGI-3                      |
| ---------- | ---------------------- | ------------------------------ |
| Format     | Static grid puzzles    | Interactive games              |
| Evaluation | Single-shot prediction | Multi-turn gameplay            |
| API        | Local file-based       | Real-time API                  |
| Metrics    | Accuracy only          | Score, efficiency, exploration |

## Getting Started with ARC-AGI-3

### 1. Setup

```bash
# Clone the ARC-AGI-3-Agents repository
git clone https://github.com/arcprize/ARC-AGI-3-Agents.git
cd ARC-AGI-3-Agents

# Install dependencies
uv sync

# Set up environment
cp .env-example .env
# Add your ARC_API_KEY from https://three.arcprize.org/
```

### 2. Understanding the Game Loop

ARC-AGI-3 games follow this pattern:
1. Agent receives game state
2. Agent chooses an action
3. Game updates and returns new state
4. Repeat until win/loss condition

### 3. promptfoo Integration

We've created configurations to evaluate AI models as ARC-AGI-3 agents:

```yaml
# arc-agi-3-agent.yaml
tests:
  - vars:
      game_state: # Current game JSON
      available_actions: # Valid actions
      objective: # Goal description
    assert:
      - type: javascript
        value: file://evaluators/arc_agi_3_agent_evaluator.js
```

### 4. Agent Implementation Pattern

```python
def choose_action(state, available_actions, history):
    """
    Analyze game state and return best action.
    
    Args:
        state: Dict with game information
        available_actions: List of valid action names
        history: List of previous actions
    
    Returns:
        Dict with 'action' key and optional 'parameters'
    """
    # Your agent logic here
    return {"action": "MOVE_RIGHT", "parameters": {}}
```

### 5. Evaluation Metrics

The evaluator checks:
- **Action Validity**: Is the action in available_actions?
- **Goal Progress**: Does the action move towards the objective?
- **Efficiency**: Is it the optimal move?
- **Exploration**: Does it discover new information?

### 6. Example Games

- **ls20**: Navigation puzzle
- **maze**: Pathfinding challenge
- **collect**: Resource gathering
- **puzzle**: Multi-step reasoning

### 7. Running Evaluations

```bash
# Test agent implementations
promptfoo eval -c arc-agi-3-agent.yaml

# Compare multiple models
promptfoo eval -c arc-agi-3-agent.yaml --providers anthropic:claude-3 openai:gpt-4

# View results
promptfoo view
```

## Best Practices

1. **Start Simple**: Test with basic navigation tasks first
2. **Log Decisions**: Have agents explain their reasoning
3. **Handle Edge Cases**: Check for obstacles, boundaries
4. **Balance Exploration**: Don't just exploit known paths
5. **Memory Management**: Track visited states efficiently

## Integration with ARC-AGI-3 API

For full integration:

```python
import requests

# Initialize game
response = requests.post(
    "https://api.three.arcprize.org/game/start",
    headers={"X-API-Key": os.getenv("ARC_API_KEY")},
    json={"game_id": "ls20"}
)

# Game loop
while not game_over:
    action = agent.choose_action(state)
    response = requests.post(
        "https://api.three.arcprize.org/game/action",
        headers={"X-API-Key": os.getenv("ARC_API_KEY")},
        json=action
    )
    state = response.json()
```

## Future Enhancements

- Real-time game visualization in promptfoo UI
- Multi-agent swarm evaluation
- Performance profiling and bottleneck analysis
- Integration with ARC-AGI-3 leaderboards

## Resources

- [ARC-AGI-3 Documentation](https://three.arcprize.org/docs)
- [Agent Templates](https://github.com/arcprize/ARC-AGI-3-Agents/tree/main/agents/templates)
- [Game Replays](https://three.arcprize.org/replay/)
- [Community Discord](https://discord.gg/arcprize) 