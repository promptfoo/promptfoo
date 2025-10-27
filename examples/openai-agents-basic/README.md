# openai-agents-basic (Interactive Text Adventure with AI Dungeon Master)

This example demonstrates how to use the OpenAI Agents SDK with promptfoo to create an interactive text adventure game powered by an AI Dungeon Master.

## What This Example Shows

- **Multi-turn Adventures**: Agent manages ongoing narrative across multiple turns
- **Multiple Tools**: Agent uses `roll_dice`, `check_inventory`, and `describe_scene` tools
- **Dynamic Storytelling**: Agent responds creatively to player actions
- **File-based Configuration**: Agent and tools organized in separate TypeScript files
- **Comprehensive Testing**: Test cases verify narrative quality, tool usage, and edge cases

## Prerequisites

- Node.js 20+ (use `nvm use` to align with `.nvmrc`)
- OpenAI API key
- The `@openai/agents` SDK (installed via npm)

## Environment Variables

This example requires:

- `OPENAI_API_KEY` - Your OpenAI API key

You can set it in a `.env` file or directly in your environment:

```bash
export OPENAI_API_KEY=sk-...
```

## Installation

You can run this example with:

```bash
npx promptfoo@latest init --example openai-agents-basic
```

Or if you've cloned the repo:

```bash
cd examples/openai-agents-basic
npm install
```

## Running the Example

### Evaluate the Dungeon Master

```bash
npx promptfoo eval
```

This runs test cases simulating player actions and validates the DM's responses.

### View Results

```bash
npx promptfoo view
```

Opens the evaluation results in a web interface showing how the DM handled different scenarios.

### Test Custom Adventures

Modify `promptfooconfig.yaml` to add your own scenarios:

```yaml
tests:
  - description: Custom adventure scenario
    vars:
      query: 'I investigate the mysterious glowing runes'
    assert:
      - type: llm-rubric
        value: Response describes runes and presents meaningful choices
```

## Project Structure

```
openai-agents-basic/
├── agents/
│   └── weather-agent.ts      # Dungeon Master agent definition
├── tools/
│   └── weather-tools.ts      # Game mechanic tools (dice, inventory, scenes)
├── promptfooconfig.yaml      # Test scenarios
├── package.json
└── README.md
```

## How It Works

### Dungeon Master Agent (`agents/weather-agent.ts`)

The DM agent orchestrates the adventure:

```typescript
export default new Agent({
  name: 'Dungeon Master',
  instructions: `You are an enthusiastic Dungeon Master...
  - Use roll_dice for combat and skill checks
  - Use check_inventory to see what items players have
  - Use describe_scene to paint vivid pictures
  - Be creative and keep the adventure engaging`,
  model: 'gpt-4o-mini',
  tools: dmTools,
});
```

### Game Tools (`tools/weather-tools.ts`)

Three core tools power the game mechanics:

**1. roll_dice** - Simulates dice rolls for combat and skill checks:

```typescript
export const rollDice = tool({
  name: 'roll_dice',
  description: 'Roll dice for combat, skill checks, and other game mechanics',
  parameters: z.object({
    sides: z.number().describe('Number of sides (e.g., 6 for d6, 20 for d20)'),
    count: z.number().default(1).describe('Number of dice to roll'),
  }),
  execute: async ({ sides, count }) => {
    // Returns rolls array and total
  },
});
```

**2. check_inventory** - Manages player items and resources:

```typescript
export const checkInventory = tool({
  name: 'check_inventory',
  description: 'Check what items the player has',
  parameters: z.object({
    playerId: z.string(),
  }),
  execute: async ({ playerId }) => {
    // Returns items, gold, and equipment
  },
});
```

**3. describe_scene** - Generates atmospheric descriptions:

```typescript
export const describeScene = tool({
  name: 'describe_scene',
  description: 'Generate detailed descriptions of locations',
  parameters: z.object({
    location: z.string().describe('Type of location (dungeon, forest, tavern)'),
    mood: z.string().describe('Atmosphere (ominous, peaceful, exciting)'),
  }),
  execute: async ({ location, mood }) => {
    // Returns vivid scene description
  },
});
```

### Test Scenarios (`promptfooconfig.yaml`)

The config includes engaging test cases:

```yaml
tests:
  - description: Dragon combat encounter
    vars:
      query: 'I draw my sword and charge at the dragon!'
    assert:
      - type: llm-rubric
        value: Response includes dice roll and describes combat outcome

  - description: Attempt ridiculous action
    vars:
      query: 'I try to befriend the chest by singing to it'
    assert:
      - type: llm-rubric
        value: DM responds with humor while keeping adventure engaging
```

## Customizing Your Adventure

### Add New Tools

Extend the game with new mechanics:

```typescript
export const castSpell = tool({
  name: 'cast_spell',
  description: 'Cast a magical spell',
  parameters: z.object({
    spell: z.string(),
    target: z.string(),
  }),
  execute: async ({ spell, target }) => {
    // Spell implementation
  },
});

export default [rollDice, checkInventory, describeScene, castSpell];
```

### Customize the Dungeon Master

Modify `agents/weather-agent.ts` to change DM personality:

```typescript
instructions: `You are a dramatic Dungeon Master inspired by high fantasy epics.
- Describe everything with cinematic flair
- Include plot twists and unexpected turns
- Reference classic fantasy tropes with a twist`,
```

### Create Adventure Scenarios

Add complex multi-step scenarios:

```yaml
- description: Multi-step dungeon puzzle
  vars:
    query: 'I examine the ancient mechanism blocking the door'
  assert:
    - type: llm-rubric
      value: Response describes puzzle clearly and hints at solution
    - type: javascript
      value: output.length > 100 # Ensures detailed description
```

## Tracing and Debugging

Tracing is enabled to monitor agent decisions:

```yaml
config:
  tracing: true # Exports to http://localhost:4318
```

View traces to see:

- Which tools the DM used
- Dice roll results
- Decision-making flow
- Token usage per turn

Compatible with Jaeger, Zipkin, or Grafana Tempo.

## Example Interactions

**Combat Scenario:**

```
Player: "I attack the goblin with my rusty sword!"
DM: *rolls 1d20* You rolled a 16! Your blade strikes true,
    dealing *rolls 1d6* 4 damage. The goblin staggers back...
```

**Inventory Check:**

```
Player: "What do I have?"
DM: You rummage through your pack:
    - Rusty Sword (1d6 damage)
    - Health Potion (3 uses, restores 2d4+2 HP)
    - Mysterious Map
    - Torch (5 uses)
    You also have 47 gold pieces.
```

**Scene Description:**

```
Player: "I enter the dungeon"
DM: *describes ominous dungeon scene* The stone corridor stretches
    into darkness. Water drips from the ceiling, and the air smells
    of decay. You hear distant echoes of something moving in the shadows.

    What do you do?
```

## Next Steps

- Add more tools: casting spells, crafting items, trading
- Implement persistent inventory across sessions
- Create branching storylines with handoffs to specialized agents
- Integrate with image generation for scene visualization
- Add multiplayer support with team-based adventures
- Connect to real game databases for persistent worlds

## Learn More

- [OpenAI Agents SDK Documentation](https://github.com/openai/openai-agents-js)
- [Promptfoo Documentation](https://promptfoo.dev)
- [Promptfoo OpenAI Agents Provider](https://promptfoo.dev/docs/providers/openai-agents)
