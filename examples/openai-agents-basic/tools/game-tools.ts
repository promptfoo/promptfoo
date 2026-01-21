import { tool } from '@openai/agents';
import { z } from 'zod';

/**
 * Tool to roll dice for D&D game mechanics
 */
export const rollDice = tool({
  name: 'roll_dice',
  description:
    'Roll dice for D&D mechanics: attack rolls, damage, saving throws, ability checks, initiative',
  parameters: z.object({
    sides: z.number().describe('Number of sides on the die (e.g., 4, 6, 8, 10, 12, 20, 100)'),
    count: z.number().prefault(1).describe('Number of dice to roll'),
    modifier: z
      .number()
      .prefault(0)
      .describe('Modifier to add to the total (e.g., +5 for STR bonus)'),
    purpose: z
      .string()
      .prefault('')
      .describe('What the roll is for (e.g., "attack roll", "fire damage", "DEX save")'),
  }),
  execute: async ({ sides, count, modifier, purpose }) => {
    const rolls = [];
    let total = 0;
    for (let i = 0; i < count; i++) {
      const roll = Math.floor(Math.random() * sides) + 1;
      rolls.push(roll);
      total += roll;
    }
    const finalTotal = total + modifier;
    const notation =
      modifier >= 0 ? `${count}d${sides}+${modifier}` : `${count}d${sides}${modifier}`;

    // Check for natural 20 or natural 1 on d20 rolls
    let criticalInfo = '';
    if (sides === 20 && count === 1) {
      if (rolls[0] === 20) {
        criticalInfo = ' (Natural 20! Critical hit!)';
      } else if (rolls[0] === 1) {
        criticalInfo = ' (Natural 1! Critical failure!)';
      }
    }

    return {
      rolls,
      modifier,
      total: finalTotal,
      notation,
      purpose: purpose || 'dice roll',
      criticalInfo,
      breakdown: `${rolls.join(' + ')}${modifier !== 0 ? ` + ${modifier}` : ''} = ${finalTotal}${criticalInfo}`,
    };
  },
});

/**
 * Tool to check player inventory
 */
export const checkInventory = tool({
  name: 'check_inventory',
  description: 'Check what items, equipment, and gold the player character has',
  parameters: z.object({
    playerId: z.string().prefault('player1').describe('The player ID'),
  }),
  execute: async ({ playerId }) => {
    // Mock inventory - in a real game this would query a database
    return {
      playerId,
      equippedWeapon: {
        name: 'Longsword +1',
        damage: '1d8+1',
        type: 'slashing',
        properties: ['versatile (1d10)'],
      },
      equippedArmor: {
        name: 'Chain Mail',
        ac: 16,
        type: 'heavy armor',
        stealthDisadvantage: true,
      },
      inventory: [
        {
          name: 'Potion of Healing',
          quantity: 3,
          effect: 'Restores 2d4+2 HP',
          action: 'bonus action to drink',
        },
        {
          name: "Thieves' Tools",
          quantity: 1,
          description: 'Proficiency required to pick locks and disarm traps',
        },
        {
          name: 'Rope (50 ft)',
          quantity: 1,
          description: 'Hempen rope',
        },
        {
          name: 'Torch',
          quantity: 5,
          description: 'Illuminates 20 ft radius for 1 hour',
        },
        {
          name: 'Mysterious Amulet',
          quantity: 1,
          description: 'Glows faintly in the presence of undead. Purpose unknown.',
          rarity: 'uncommon',
        },
      ],
      gold: 47,
      silver: 23,
      copper: 15,
    };
  },
});

/**
 * Tool to generate atmospheric D&D scene descriptions
 */
export const describeScene = tool({
  name: 'describe_scene',
  description: 'Generate vivid descriptions of D&D locations, encounters, and environments',
  parameters: z.object({
    location: z
      .string()
      .describe('The type of location (dungeon, cave, forest, tavern, castle, crypt, etc.)'),
    mood: z
      .string()
      .describe('The atmosphere or mood (ominous, peaceful, exciting, mysterious, etc.)'),
  }),
  execute: async ({ location, mood }) => {
    // Mock scene generation - could integrate with image generation APIs or LLMs
    const scenes: Record<string, Record<string, string>> = {
      dungeon: {
        ominous:
          'The stone corridor stretches into darkness ahead. Water drips from the vaulted ceiling, each drop echoing like a distant heartbeat. The air reeks of decay and ancient evil. You hear something large shifting in the shadows beyond your torchlight.',
        exciting:
          'Torches blaze along the walls, illuminating elaborate murals depicting ancient battles. A locked iron door stands ahead, its surface covered in arcane runes that pulse with faint blue light. Behind it, you hear the unmistakable clink of gold.',
        mysterious:
          'The chamber walls are covered floor-to-ceiling with strange glyphs that seem to shift when you look directly at them. A stone pedestal in the center holds an ornate crystal that hums with magical energy.',
      },
      forest: {
        peaceful:
          'Golden sunlight filters through the ancient oak canopy. Birds sing melodious songs while a babbling brook winds through moss-covered stones. The air smells of pine and wildflowers.',
        ominous:
          'The forest has gone deathly quiet. Not a single bird calls. The trees loom overhead like skeletal fingers, blocking out the sun. The underbrush rustles though there is no wind. You are definitely being watched.',
        mysterious:
          'A circle of mushrooms glows faintly in the twilight. Within it stands a weathered stone arch covered in Elvish script. The air shimmers like heat waves, though it is cool here.',
      },
      tavern: {
        exciting:
          'The tavern buzzes with energy. A dwarf arm-wrestles an orc in the corner while a bard plays a rousing tune. The smell of roasted meat and ale fills the air. Every patron seems to have a story to tell.',
        peaceful:
          'The cozy inn offers a warm fire crackling in the hearth. A few locals chat quietly over mugs of ale. The innkeeper polishes glasses behind the bar and nods warmly as you enter.',
        ominous:
          'The tavern falls silent as you enter. Hooded figures huddle in dark corners, their conversations stopping mid-sentence. The bartender eyes you warily, one hand below the bar.',
      },
      crypt: {
        ominous:
          'Rows of stone sarcophagi line the walls, some with their lids askew. The air is thick and stale. Strange scratch marks mar the inside of several coffins. Your torch reveals fresh footprints in the dust - heading deeper into the crypt.',
        mysterious:
          'An underground chapel dedicated to a forgotten god. The altar bears offerings that look disturbingly fresh. Ghostly whispers echo from the walls, speaking in languages you almost recognize.',
      },
    };

    const description =
      scenes[location]?.[mood] ||
      `You find yourself in ${location} with ${mood} atmosphere. The details remain unclear.`;

    return {
      location,
      mood,
      description,
      possibleActions: [
        'investigate the area',
        'search for hidden items or passages',
        'proceed cautiously',
        'take a short rest',
        'examine something specific',
      ],
      lightLevel:
        location === 'dungeon' || location === 'crypt' ? 'dark (torch required)' : 'normal',
    };
  },
});

/**
 * Tool to check character stats and abilities
 */
export const checkCharacterStats = tool({
  name: 'check_character_stats',
  description: 'View player character stats, abilities, HP, AC, and other D&D 5e attributes',
  parameters: z.object({
    playerId: z.string().prefault('player1').describe('The player ID'),
  }),
  execute: async ({ playerId }) => {
    // Mock character - in a real game this would query a database
    return {
      playerId,
      name: 'Thorin Ironforge',
      race: 'Mountain Dwarf',
      class: 'Fighter',
      level: 5,
      background: 'Soldier',
      alignment: 'Lawful Good',
      proficiencyBonus: 3,
      armorClass: 18,
      initiative: 1,
      speed: 25,
      hitPoints: {
        current: 42,
        maximum: 47,
        temporary: 0,
      },
      abilityScores: {
        strength: { score: 16, modifier: 3 },
        dexterity: { score: 12, modifier: 1 },
        constitution: { score: 16, modifier: 3 },
        intelligence: { score: 10, modifier: 0 },
        wisdom: { score: 13, modifier: 1 },
        charisma: { score: 8, modifier: -1 },
      },
      savingThrows: {
        strength: 6,
        dexterity: 1,
        constitution: 6,
        intelligence: 0,
        wisdom: 1,
        charisma: -1,
      },
      skills: {
        athletics: 6,
        intimidation: 2,
        perception: 4,
        survival: 4,
      },
      features: [
        'Second Wind (1/short rest) - Bonus action to heal 1d10+5 HP',
        'Action Surge (1/short rest) - Take one additional action',
        'Fighting Style: Dueling (+2 damage when wielding one-handed weapon)',
        'Darkvision (60 ft)',
        'Dwarven Resilience (advantage on saving throws vs poison)',
      ],
      conditions: [],
      deathSaves: {
        successes: 0,
        failures: 0,
      },
    };
  },
});

export default [rollDice, checkInventory, describeScene, checkCharacterStats];
