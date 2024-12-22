export interface Strategy {
  category: string;
  categoryLink?: string;
  strategy: string;
  description: string;
  longDescription: string;
  cost: string;
  asrIncrease: string;
  link?: string;
}

export const strategies: Strategy[] = [
  {
    category: 'Static (Single-Turn)',
    categoryLink: '#static-single-turn',
    strategy: 'Base64',
    description: 'Base64 encoding bypass',
    longDescription: 'Encodes the injected variable using Base64 encoding',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/base64/',
  },
  {
    category: 'Static (Single-Turn)',
    categoryLink: '#static-single-turn',
    strategy: 'Leetspeak',
    description: 'Character substitution',
    longDescription:
      'Converts the injected variable to leetspeak, replacing certain letters with numbers or symbols',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/leetspeak/',
  },
  {
    category: 'Static (Single-Turn)',
    categoryLink: '#static-single-turn',
    strategy: 'ROT13',
    description: 'Letter rotation encoding',
    longDescription:
      'Applies ROT13 encoding to the injected variable, shifting each letter 13 positions in the alphabet',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/rot13/',
  },
  {
    category: 'Static (Single-Turn)',
    categoryLink: '#static-single-turn',
    strategy: 'Prompt Injection',
    description: 'Direct system prompts',
    longDescription: 'Wraps the payload in a prompt injection',
    cost: 'Low',
    asrIncrease: '50-70%',
    link: '/docs/red-team/strategies/prompt-injection/',
  },
  {
    category: 'Static (Single-Turn)',
    categoryLink: '#static-single-turn',
    strategy: 'Multilingual',
    description: 'Cross-language testing',
    longDescription: 'Translates the request to multiple low-resource languages',
    cost: 'Low',
    asrIncrease: '30-40%',
  },
  {
    category: 'Dynamic (Single-Turn)',
    categoryLink: '#dynamic-single-turn',
    strategy: 'Math Prompt',
    description: 'Mathematical encoding',
    longDescription: 'Applies a linear probe jailbreak technique to deliver the payload (Default)',
    cost: 'Medium',
    asrIncrease: '70-80%',
    link: '/docs/red-team/strategies/math-prompt/',
  },
  {
    category: 'Dynamic (Single-Turn)',
    categoryLink: '#dynamic-single-turn',
    strategy: 'Citation',
    description: 'Academic framing',
    longDescription: 'Uses academic citations and references to potentially bypass safety measures',
    cost: 'Medium',
    asrIncrease: '40-60%',
    link: '/docs/red-team/strategies/citation/',
  },
  {
    category: 'Dynamic (Single-Turn)',
    categoryLink: '#dynamic-single-turn',
    strategy: 'Composite',
    description: 'Combined techniques',
    longDescription: 'Combines multiple jailbreak techniques from research papers (Default)',
    cost: 'Medium',
    asrIncrease: '60-80%',
  },
  {
    category: 'Dynamic (Single-Turn)',
    categoryLink: '#dynamic-single-turn',
    strategy: 'Jailbreak',
    description: 'Lightweight iterative refinement',
    longDescription: 'Applies a multi-turn jailbreak technique',
    cost: 'High',
    asrIncrease: '60-80%',
  },
  {
    category: 'Dynamic (Single-Turn)',
    categoryLink: '#dynamic-single-turn',
    strategy: 'Tree-based',
    description: 'Branching attack paths',
    longDescription: 'Applies a tree-based jailbreak technique',
    cost: 'High',
    asrIncrease: '60-80%',
  },
  {
    category: 'Dynamic (Single-Turn)',
    categoryLink: '#dynamic-single-turn',
    strategy: 'Best-of-N',
    description: 'Parallel sampling attack',
    longDescription:
      'Tests multiple variations of prompts in parallel until finding a successful jailbreak',
    cost: 'High',
    asrIncrease: '40-60%',
    link: '/docs/red-team/strategies/best-of-n/',
  },
  {
    category: 'Multi-turn',
    categoryLink: '#multi-turn',
    strategy: 'GOAT',
    description: 'Gradual escalation',
    longDescription: 'Applies a multi-turn jailbreak technique',
    cost: 'High',
    asrIncrease: '70-90%',
  },
  {
    category: 'Multi-turn',
    categoryLink: '#multi-turn',
    strategy: 'Crescendo',
    description: 'Gradual escalation',
    longDescription: 'Applies a multi-turn jailbreak technique',
    cost: 'High',
    asrIncrease: '70-90%',
  },
  {
    category: 'Custom',
    categoryLink: '#custom',
    strategy: 'Custom',
    description: 'User-defined strategies',
    longDescription: 'Raw payloads only (Default)',
    cost: 'Varies',
    asrIncrease: 'Varies',
  },
  {
    category: 'Basic',
    categoryLink: '#basic',
    strategy: 'Basic',
    description: 'Plugin-generated test cases without applied strategies',
    longDescription:
      'Controls whether the original plugin-generated test cases (without any strategies applied) are included in the final output',
    cost: 'Low',
    asrIncrease: 'None',
  },
];
