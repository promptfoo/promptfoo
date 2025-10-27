import { tool } from '@openai/agents';
import { z } from 'zod';

/**
 * Tool to roll dice for game mechanics
 */
export const rollDice = tool({
  name: 'roll_dice',
  description: 'Roll dice for combat, skill checks, and other game mechanics',
  parameters: z.object({
    sides: z.number().describe('Number of sides on the die (e.g., 6 for d6, 20 for d20)'),
    count: z.number().default(1).describe('Number of dice to roll'),
  }),
  execute: async ({ sides, count }) => {
    const rolls = [];
    let total = 0;
    for (let i = 0; i < count; i++) {
      const roll = Math.floor(Math.random() * sides) + 1;
      rolls.push(roll);
      total += roll;
    }
    return {
      rolls,
      total,
      notation: `${count}d${sides}`,
    };
  },
});

/**
 * Tool to check player inventory
 */
export const checkInventory = tool({
  name: 'check_inventory',
  description: 'Check what items the player has in their inventory',
  parameters: z.object({
    playerId: z.string().describe('The player ID'),
  }),
  execute: async ({ playerId }) => {
    // Mock inventory - in a real game this would query a database
    return {
      playerId,
      items: [
        { name: 'Rusty Sword', damage: '1d6', description: 'A sword that has seen better days' },
        { name: 'Health Potion', uses: 3, description: 'Restores 2d4+2 HP' },
        { name: 'Mysterious Map', description: 'Shows the location of a hidden dungeon' },
        { name: 'Torch', uses: 5, description: 'Illuminates dark places' },
      ],
      gold: 47,
    };
  },
});

/**
 * Tool to generate atmospheric scene descriptions
 */
export const describeScene = tool({
  name: 'describe_scene',
  description: 'Generate detailed descriptions of locations and encounters',
  parameters: z.object({
    location: z.string().describe('The type of location (dungeon, forest, tavern, etc.)'),
    mood: z.string().describe('The atmosphere or mood (ominous, peaceful, exciting, etc.)'),
  }),
  execute: async ({ location, mood }) => {
    // Mock scene generation - could integrate with image generation APIs
    const scenes: Record<string, Record<string, string>> = {
      dungeon: {
        ominous:
          'The stone corridor stretches into darkness. Water drips from the ceiling, and the air smells of decay. You hear distant echoes of something moving in the shadows.',
        exciting:
          'Torches flicker on the walls, illuminating ancient runes. Treasure glints from behind iron bars. Adventure awaits!',
      },
      forest: {
        peaceful:
          'Sunlight filters through the canopy. Birds sing melodious songs. A gentle breeze carries the scent of wildflowers.',
        ominous:
          'The trees loom overhead, blocking out the sun. Every shadow seems to move. Something is watching you.',
      },
    };
    const description = scenes[location]?.[mood] || 'An unremarkable place.';
    return {
      location,
      mood,
      description,
      possibleActions: ['explore', 'search for items', 'rest', 'continue onward'],
    };
  },
});

export default [rollDice, checkInventory, describeScene];
