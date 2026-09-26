# openai-agents-basic (D&D Adventure with AI Dungeon Master)

This example evaluates a D&D-themed agent built with the OpenAI Agents SDK. The agent uses dice tools and sample character data to respond to player actions.

## What This Example Shows

- **Independent D&D scenarios**: Each test starts a fresh agent run; conversation history is not shared between tests
- **Tool calls**: Agent uses `roll_dice`, `check_inventory`, `describe_scene`, and `check_character_stats` tools
- **File-based Configuration**: Agent and tools organized in separate TypeScript files
- **Scenario checks**: Rubric and content assertions evaluate selected player actions

The agents use `gpt-6-luna` through the SDK’s default Responses API.

## Prerequisites

- Node.js >=22.22.0 (Node.js 24 LTS recommended)
- OpenAI API key
- The `@openai/agents` SDK (installed via npm)

## Environment Variables

This example requires:

- `OPENAI_API_KEY` - Your OpenAI API key

Export the key before running the eval, or pass `--env-file .env` if you store it in a file:

```bash
export OPENAI_API_KEY=sk-...
```

## Installation

You can run this example with:

```bash
npx promptfoo@latest init --example openai-agents-basic
cd openai-agents-basic
npm install
```

Or if you've cloned the repo:

```bash
cd examples/openai-agents-basic
npm install
```

## Running the Example

### Evaluate the Dungeon Master

```bash
npx promptfoo@latest eval --no-cache
```

This runs test cases simulating player actions and validates the DM's responses.

### View Results

```bash
npx promptfoo@latest view
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

```text
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

The agent is instructed to use the game tools when responding to player actions:

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
  model: 'gpt-6-luna',
  tools: gameTools,
});
```

### Game Tools (`tools/game-tools.ts`)

The example provides four tools:

**1. roll_dice** - Simulates D&D dice rolls with modifiers and critical hit detection:

```typescript
export const rollDice = tool({
  name: 'roll_dice',
  description: 'Roll dice for D&D mechanics: attack rolls, damage, saving throws, ability checks',
  parameters: z.object({
    sides: z.number(),
    count: z.number().prefault(1),
    modifier: z.number().prefault(0),
    purpose: z.string().prefault(''),
  }),
  execute: async ({ sides, count, modifier, purpose }) => {
    // Returns rolls, total, notation, and detects natural 20/1 for crits
  },
});
```

**2. check_inventory** - Returns sample weapons, armor, and carried items:

```typescript
export const checkInventory = tool({
  name: 'check_inventory',
  description: 'Check what items, equipment, and gold the player character has',
  parameters: z.object({
    playerId: z.string().prefault('player1'),
  }),
  execute: async ({ playerId }) => {
    // Returns equipped weapon, armor, inventory items, and currency
  },
});
```

**3. describe_scene** - Returns a fixture scene description:

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

**4. check_character_stats** - Returns sample character stats:

```typescript
export const checkCharacterStats = tool({
  name: 'check_character_stats',
  description: 'View player character stats, abilities, HP, AC, and other D&D 5e attributes',
  parameters: z.object({
    playerId: z.string().prefault('player1'),
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

Promptfoo tracing is optional and disabled in the checked-in config. To capture SDK tool
calls in Promptfoo, enable the receiver at the top level and tracing on the provider:

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318

providers:
  - id: openai:agents:dungeon-master
    config:
      agent: file://./agents/dungeon-master-agent.ts
      tracing: true
      maxTurns: 20
```

Run the eval, then open a result’s **Trace Timeline** to inspect tool calls and
model turns. See the [tracing guide](https://www.promptfoo.dev/docs/tracing/).

## Example Interactions

**Combat Scenario:**

```text
Player: "I attack the goblin with my longsword!"
DM: *rolls 1d20+5* You rolled a 18 total! Your blade strikes true.
    *rolls 1d8+4* You deal 9 slashing damage. The goblin staggers back,
    clutching its wounded side...
```

**Natural 20:**

```text
Player: "I attack the dragon!"
DM: *rolls 1d20+5* Natural 20! Critical hit! Your longsword finds a gap
    in the dragon's scales. *rolls 2d8+4* You deal a devastating 16 damage!
```

**Character Stats Check:**

```text
Player: "What are my current stats?"
DM: You're Thorin Ironforge, a Level 5 Mountain Dwarf Fighter:
    - HP: 42/47
    - AC: 18 (Chain Mail)
    - STR: 16 (+3), DEX: 12 (+1), CON: 16 (+3)
    - Special: Second Wind, Action Surge, Darkvision
```

**Scene Description:**

```text
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
