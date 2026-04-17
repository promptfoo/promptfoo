# openai-agents-basic (D&D Adventure with AI Dungeon Master)

This example demonstrates how to use the OpenAI Agents SDK with promptfoo to create an interactive D&D adventure game powered by an AI Dungeon Master.

## What This Example Shows

- **Multi-turn D&D Adventures**: Agent manages ongoing campaigns across multiple turns
- **Rich Tool Usage**: Agent uses `roll_dice`, `check_inventory`, `describe_scene`, and `check_character_stats` tools
- **D&D 5e Mechanics**: Proper attack rolls, saving throws, ability checks, and combat
- **Dynamic Storytelling**: Agent responds creatively to player actions with atmospheric narration
- **File-based Configuration**: Agent and tools organized in separate TypeScript files
- **Comprehensive Testing**: Test cases verify narrative quality, dice mechanics, and edge cases

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
  - description: Negotiate with the dragon
    vars:
      query: 'I try to convince the dragon to let us pass peacefully'
    assert:
      - type: llm-rubric
        value: Response involves charisma check and dragon's reaction based on roll
```

## Project Structure

```
openai-agents-basic/
├── agents/
│   └── dungeon-master-agent.ts    # D&D Dungeon Master agent
├── tools/
│   └── game-tools.ts              # D&D game mechanics (dice, inventory, stats, scenes)
├── promptfooconfig.yaml           # Test scenarios
├── package.json
└── README.md
```

## How It Works

### Dungeon Master Agent (`agents/dungeon-master-agent.ts`)

The DM agent orchestrates D&D adventures using proper game mechanics:

```typescript
export default new Agent({
  name: 'Dungeon Master',
  instructions: `You are an enthusiastic Dungeon Master running an epic fantasy D&D adventure.

  Your role:
  - Guide players through thrilling quests, combat encounters, and mysteries
  - Use roll_dice for attack rolls, saving throws, ability checks, and damage (D&D 5e rules)
  - Use check_inventory to see what items, equipment, and gold players have
  - Use check_character_stats to view player abilities, HP, AC, and level
  - Use describe_scene to paint vivid, atmospheric pictures of locations`,
  model: 'gpt-4o-mini',
  tools: gameTools,
});
```

### Game Tools (`tools/game-tools.ts`)

Four core tools power the D&D mechanics:

**1. roll_dice** - Simulates D&D dice rolls with modifiers and critical hit detection:

```typescript
export const rollDice = tool({
  name: 'roll_dice',
  description: 'Roll dice for D&D mechanics: attack rolls, damage, saving throws, ability checks',
  parameters: z.object({
    sides: z.number(),
    count: z.number().default(1),
    modifier: z.number().default(0),
    purpose: z.string().default(''),
  }),
  execute: async ({ sides, count, modifier, purpose }) => {
    // Returns rolls, total, notation, and detects natural 20/1 for crits
  },
});
```

**2. check_inventory** - Manages equipped weapons, armor, and carried items:

```typescript
export const checkInventory = tool({
  name: 'check_inventory',
  description: 'Check what items, equipment, and gold the player character has',
  parameters: z.object({
    playerId: z.string().default('player1'),
  }),
  execute: async ({ playerId }) => {
    // Returns equipped weapon, armor, inventory items, and currency
  },
});
```

**3. describe_scene** - Generates atmospheric D&D location descriptions:

```typescript
export const describeScene = tool({
  name: 'describe_scene',
  description: 'Generate vivid descriptions of D&D locations, encounters, and environments',
  parameters: z.object({
    location: z.string(),
    mood: z.string(),
  }),
  execute: async ({ location, mood }) => {
    // Returns immersive scene description with possible actions
  },
});
```

**4. check_character_stats** - Displays full D&D 5e character sheet:

```typescript
export const checkCharacterStats = tool({
  name: 'check_character_stats',
  description: 'View player character stats, abilities, HP, AC, and other D&D 5e attributes',
  parameters: z.object({
    playerId: z.string().default('player1'),
  }),
  execute: async ({ playerId }) => {
    // Returns complete character: ability scores, HP, AC, skills, features
  },
});
```

### Test Scenarios (`promptfooconfig.yaml`)

The config includes engaging D&D test cases:

```yaml
tests:
  - description: Dragon combat with attack roll
    vars:
      query: 'I draw my longsword and attack the red dragon!'
    assert:
      - type: llm-rubric
        value: Response includes dice rolls for attack and damage, describes combat outcome

  - description: Ridiculous player action
    vars:
      query: 'I attempt to seduce the ancient dragon using interpretive dance'
    assert:
      - type: llm-rubric
        value: DM responds with humor and wit while keeping the game engaging
```

## Customizing Your Adventure

### Add New Tools

Extend the game with new D&D mechanics:

```typescript
export const castSpell = tool({
  name: 'cast_spell',
  description: 'Cast a D&D spell',
  parameters: z.object({
    spell: z.string(),
    target: z.string(),
    spellLevel: z.number(),
  }),
  execute: async ({ spell, target, spellLevel }) => {
    // Spell implementation with saving throws
  },
});

export default [rollDice, checkInventory, describeScene, checkCharacterStats, castSpell];
```

### Customize the Dungeon Master

Modify `agents/dungeon-master-agent.ts` to change DM personality:

```typescript
instructions: `You are a dramatic Dungeon Master inspired by classic fantasy epics.
- Describe everything with cinematic flair and dramatic tension
- Include plot twists and moral dilemmas
- Reference classic D&D adventures with unique twists
- Make combat visceral and choices consequential`,
```

### Create Adventure Scenarios

Add complex multi-step scenarios:

```yaml
- description: Multi-step puzzle challenge
  vars:
    query: 'I examine the ancient mechanism blocking the door'
  assert:
    - type: llm-rubric
      value: Response describes puzzle mechanics clearly with hints toward solution
    - type: javascript
      value: output.length > 150 # Ensures detailed description
```

## Tracing and Debugging

Tracing is enabled in the configuration to capture agent execution details:

```yaml
config:
  tracing: true # Attempts to export traces via OTLP to http://localhost:4318
```

The agent will attempt to export OpenTelemetry traces showing:

- Which tools the DM used (roll_dice, check_inventory, etc.)
- Dice roll results (including natural 20s and 1s)
- Decision-making flow across multiple turns
- Token usage per interaction

### Viewing Traces

To view traces, you'll need an OTLP-compatible collector running on `http://localhost:4318`. Popular options:

**Quick Setup with Jaeger:**

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

Then visit `http://localhost:16686` to view traces.

**Note:** If no trace collector is running, the agent will log warnings but continue working normally. Tracing failures don't affect evaluation results.

## Example Interactions

**Combat Scenario:**

```
Player: "I attack the goblin with my longsword!"
DM: *rolls 1d20+5* You rolled a 18 total! Your blade strikes true.
    *rolls 1d8+4* You deal 9 slashing damage. The goblin staggers back,
    clutching its wounded side...
```

**Natural 20:**

```
Player: "I attack the dragon!"
DM: *rolls 1d20+5* Natural 20! Critical hit! Your longsword finds a gap
    in the dragon's scales. *rolls 2d8+4* You deal a devastating 16 damage!
```

**Character Stats Check:**

```
Player: "What are my current stats?"
DM: You're Thorin Ironforge, a Level 5 Mountain Dwarf Fighter:
    - HP: 42/47
    - AC: 18 (Chain Mail)
    - STR: 16 (+3), DEX: 12 (+1), CON: 16 (+3)
    - Special: Second Wind, Action Surge, Darkvision
```

**Scene Description:**

```
Player: "I enter the ancient crypt"
DM: *describes ominous crypt* Rows of stone sarcophagi line the walls,
    some with their lids askew. The air is thick and stale. Strange scratch
    marks mar the inside of several coffins. Your torch reveals fresh
    footprints in the dust - heading deeper into the crypt.

    What do you do?
```

## Next Steps

- Add spell casting tools for wizard/cleric characters
- Implement rest mechanics (short rest, long rest)
- Create branching storylines with NPC handoffs
- Add encounter builders for balanced combat
- Integrate with D&D Beyond API for real character data
- Support multiplayer with party-based adventures
- Add condition tracking (poisoned, frightened, etc.)

## Learn More

- [OpenAI Agents SDK Documentation](https://github.com/openai/openai-agents-js)
- [Promptfoo Documentation](https://promptfoo.dev)
- [Promptfoo OpenAI Agents Provider](https://promptfoo.dev/docs/providers/openai-agents)
- [D&D 5e System Reference](https://www.dndbeyond.com/sources/basic-rules)
