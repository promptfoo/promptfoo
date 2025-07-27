export interface Strategy {
  category: string;
  categoryLink?: string;
  strategy: string;
  displayName: string;
  description: string;
  longDescription: string;
  cost: string;
  asrIncrease: string;
  link?: string;
  recommended?: boolean;
}

export const strategies: Strategy[] = [
  {
    category: 'Custom',
    strategy: 'custom',
    displayName: 'Custom Strategies',
    description: 'User-defined transformations',
    longDescription:
      'Allows creation of custom red team testing approaches by programmatically transforming test cases using JavaScript',
    cost: 'Variable',
    asrIncrease: 'Variable',
    link: '/docs/red-team/strategies/custom/',
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'best-of-n',
    displayName: 'Best-of-N',
    description: 'Parallel sampling attack',
    longDescription:
      'Tests multiple variations in parallel using the Best-of-N technique from Anthropic research',
    cost: 'High',
    asrIncrease: '40-60%',
    link: '/docs/red-team/strategies/best-of-n/',
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'citation',
    displayName: 'Citation',
    description: 'Academic framing',
    longDescription:
      'Tests vulnerability to academic authority bias by framing harmful requests in research contexts',
    cost: 'Medium',
    asrIncrease: '40-60%',
    link: '/docs/red-team/strategies/citation/',
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'jailbreak:composite',
    displayName: 'Composite Jailbreaks',
    description: 'Combined techniques',
    longDescription:
      'Chains multiple jailbreak techniques from research papers to create more sophisticated attacks',
    cost: 'Medium',
    asrIncrease: '60-80%',
    link: '/docs/red-team/strategies/composite-jailbreaks/',
    recommended: true,
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'gcg',
    displayName: 'GCG',
    description: 'Gradient-based optimization',
    longDescription:
      'Implements the Greedy Coordinate Gradient attack method for finding adversarial prompts using gradient-based search techniques',
    cost: 'High',
    asrIncrease: '0-10%',
    link: '/docs/red-team/strategies/gcg/',
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'jailbreak',
    displayName: 'Jailbreak',
    description: 'Lightweight iterative refinement',
    longDescription:
      'Uses an LLM-as-a-Judge to iteratively refine prompts until they bypass security controls',
    cost: 'High',
    asrIncrease: '60-80%',
    link: '/docs/red-team/strategies/iterative/',
    recommended: true,
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'jailbreak:likert',
    displayName: 'Likert-based Jailbreaks',
    description: 'Academic evaluation framework',
    longDescription:
      'Leverages academic evaluation frameworks and Likert scales to frame harmful requests within research contexts',
    cost: 'Medium',
    asrIncrease: '40-60%',
    link: '/docs/red-team/strategies/likert/',
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'math-prompt',
    displayName: 'Math Prompt',
    description: 'Mathematical encoding',
    longDescription:
      'Tests resilience against mathematical notation-based attacks using set theory and abstract algebra',
    cost: 'Medium',
    asrIncrease: '40-60%',
    link: '/docs/red-team/strategies/math-prompt/',
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'jailbreak:tree',
    displayName: 'Tree-based',
    description: 'Branching attack paths',
    longDescription:
      'Creates a tree of attack variations based on the Tree of Attacks research paper',
    cost: 'High',
    asrIncrease: '60-80%',
    link: '/docs/red-team/strategies/tree/',
  },
  {
    category: 'Multi-turn',
    strategy: 'crescendo',
    displayName: 'Crescendo',
    description: 'Gradual escalation',
    longDescription:
      'Gradually escalates prompt harm over multiple turns while using backtracking to optimize attack paths',
    cost: 'High',
    asrIncrease: '70-90%',
    link: '/docs/red-team/strategies/multi-turn/',
  },
  {
    category: 'Multi-turn',
    strategy: 'goat',
    displayName: 'GOAT',
    description: 'Generative Offensive Agent Tester',
    longDescription:
      'Uses a Generative Offensive Agent Tester to dynamically generate multi-turn conversations',
    cost: 'High',
    asrIncrease: '70-90%',
    link: '/docs/red-team/strategies/goat/',
  },
  {
    category: 'Multi-turn',
    strategy: 'mischievous-user',
    displayName: 'Mischievous User',
    description: 'Mischievous user conversations',
    longDescription: 'Simulates a multi-turn conversation between a mischievous user and an agent',
    cost: 'High',
    asrIncrease: '10-20%',
    link: '/docs/red-team/strategies/mischievous-user/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'video',
    displayName: 'Video Encoding',
    description: 'Text-to-video encoding bypass',
    longDescription:
      'Tests handling of text embedded in videos and encoded as base64 to potentially bypass text-based content filters',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/video/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'image',
    displayName: 'Image Encoding',
    description: 'Text-to-image encoding bypass',
    longDescription:
      'Tests handling of text embedded in images and encoded as base64 to potentially bypass text-based content filters',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/image/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'audio',
    displayName: 'Audio Encoding',
    description: 'Text-to-speech encoding bypass',
    longDescription:
      'Tests handling of text converted to speech audio and encoded as base64 to potentially bypass text-based content filters',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/audio/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'base64',
    displayName: 'Base64',
    description: 'Base64 encoding bypass',
    longDescription:
      'Tests detection and handling of Base64-encoded malicious payloads to bypass content filters',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/base64/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'hex',
    displayName: 'Hex',
    description: 'Hex encoding bypass',
    longDescription:
      'Tests detection and handling of hex-encoded malicious payloads to bypass content filters',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/hex/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'homoglyph',
    displayName: 'Homoglyph',
    description: 'Unicode confusable characters',
    longDescription:
      'Tests detection and handling of text with homoglyphs (visually similar Unicode characters) to bypass content filters',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/homoglyph/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'basic',
    displayName: 'Basic',
    description: 'Plugin-generated test cases',
    longDescription:
      'Controls whether original plugin-generated test cases are included without any strategies applied',
    cost: 'Low',
    asrIncrease: 'None',
    link: '/docs/red-team/strategies/basic/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'leetspeak',
    displayName: 'Leetspeak',
    description: 'Character substitution',
    longDescription:
      'Tests handling of leetspeak-encoded malicious content by replacing standard letters with numbers or special characters',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/leetspeak/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'multilingual',
    displayName: 'Multilingual',
    description: 'Cross-language testing',
    longDescription:
      'Tests handling of inputs across multiple languages, focusing on low-resource languages that may bypass content filters',
    cost: 'Low',
    asrIncrease: '30-40%',
    link: '/docs/red-team/strategies/multilingual/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'prompt-injection',
    displayName: 'Prompt Injection',
    description: 'Direct system prompts',
    longDescription:
      'Tests common direct prompt injection vulnerabilities using a curated list of injection techniques',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/prompt-injection/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'rot13',
    displayName: 'ROT13',
    description: 'Letter rotation encoding',
    longDescription:
      'Tests handling of ROT13-encoded malicious payloads by rotating each letter 13 positions in the alphabet',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/rot13/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'morse',
    displayName: 'Morse Code',
    description: 'Dots and dashes encoding',
    longDescription:
      'Tests handling of text encoded in Morse code (dots and dashes) to potentially bypass content filters',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/other-encodings/#morse-code',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'piglatin',
    displayName: 'Pig Latin',
    description: 'Word transformation encoding',
    longDescription:
      'Tests handling of text transformed into Pig Latin (rearranging word parts) to potentially bypass content filters',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/other-encodings/#pig-latin',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'camelcase',
    displayName: 'camelCase',
    description: 'camelCase transformation',
    longDescription:
      'Tests handling of text transformed into camelCase (removing spaces and capitalizing words) to potentially bypass content filters',
    cost: 'Low',
    asrIncrease: '0-5%',
    link: '/docs/red-team/strategies/other-encodings/#camelcase',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'emoji',
    displayName: 'Emoji Smuggling',
    description: 'Variation selector encoding',
    longDescription:
      'Tests hiding UTF-8 payloads inside emoji variation selectors to evaluate filter evasion.',
    cost: 'Low',
    asrIncrease: '0-5%',
    link: '/docs/red-team/strategies/other-encodings/#emoji-encoding',
  },
  {
    category: 'Regression',
    strategy: 'retry',
    displayName: 'Retry',
    description: 'Historical failure testing',
    longDescription:
      'Automatically incorporates previously failed test cases into your test suite, creating a regression testing system that learns from past failures',
    cost: 'Low',
    asrIncrease: '50-70%',
    link: '/docs/red-team/strategies/retry/',
    recommended: false,
  },
  {
    category: 'Multi-turn',
    strategy: 'pandamonium',
    displayName: 'Pandamonium',
    description: 'Dynamic attack generation',
    longDescription:
      'Advanced automated red teaming technique that dynamically generates single or multi-turn conversations aimed at bypassing safety measures',
    cost: 'High',
    asrIncrease: '70-90%',
    link: '/docs/red-team/strategies/pandamonium/',
  },
];
