export interface Strategy {
  category: string;
  categoryLink?: string;
  strategy: string;
  displayName: string;
  description: string;
  longDescription: string;
  cost: string;
  link?: string;
  recommended?: boolean;
  isRemote?: boolean;
}

export const strategies: Strategy[] = [
  {
    category: 'Custom',
    strategy: 'file://custom-strategy.js',
    displayName: 'Custom Strategies',
    description: 'User-defined transformations',
    longDescription:
      'Allows creation of custom red team testing approaches by programmatically transforming test cases using JavaScript',
    cost: 'Variable',
    link: '/docs/red-team/strategies/custom/',
  },
  {
    category: 'Custom',
    strategy: 'custom',
    displayName: 'Custom Strategy',
    description: 'Custom prompt-based multi-turn strategy',
    longDescription:
      'Uses natural language instructions to guide a reusable multi-turn red team strategy',
    cost: 'Variable',
    link: '/docs/red-team/strategies/custom-strategy/',
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'best-of-n',
    displayName: 'Best-of-N',
    description: 'Parallel sampling attack',
    longDescription:
      'Tests multiple variations in parallel using the Best-of-N technique from published research',
    cost: 'High',
    link: '/docs/red-team/strategies/best-of-n/',
    isRemote: true,
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'citation',
    displayName: 'Citation',
    description: 'Academic framing',
    longDescription:
      'Tests vulnerability to academic authority bias by framing harmful requests in research contexts',
    cost: 'Medium',
    link: '/docs/red-team/strategies/citation/',
    isRemote: true,
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'authoritative-markup-injection',
    displayName: 'Authoritative Markup Injection',
    description: 'Structured format authority',
    longDescription:
      'Tests vulnerability to authoritative formatting by embedding prompts in structured markup that exploits trust in formatted content',
    cost: 'Medium',
    link: '/docs/red-team/strategies/authoritative-markup-injection/',
    isRemote: true,
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'jailbreak:composite',
    displayName: 'Composite Jailbreaks',
    description: 'Combined techniques',
    longDescription:
      'Chains multiple jailbreak techniques from published research to create compound attacks',
    cost: 'Medium',
    link: '/docs/red-team/strategies/composite-jailbreaks/',
    recommended: true,
    isRemote: true,
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'gcg',
    displayName: 'Greedy Coordinate Gradient (GCG)',
    description: 'Transferable adversarial suffixes',
    longDescription:
      'Generates Greedy Coordinate Gradient-inspired adversarial suffixes with hosted inference; it does not calculate gradients against the target',
    cost: 'High',
    link: '/docs/red-team/strategies/gcg/',
    isRemote: true,
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'jailbreak:meta',
    displayName: 'Meta-Agent Jailbreaks',
    description: 'Strategic taxonomy builder',
    longDescription:
      'Builds custom attack taxonomies and learns from all attempts using persistent strategic memory to choose which attack types work against your specific target',
    cost: 'High',
    link: '/docs/red-team/strategies/meta/',
    recommended: true,
    isRemote: true,
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'jailbreak:likert',
    displayName: 'Likert-based Jailbreaks',
    description: 'Academic evaluation framework',
    longDescription:
      'Leverages academic evaluation frameworks and Likert scales to frame harmful requests within research contexts',
    cost: 'Medium',
    link: '/docs/red-team/strategies/likert/',
    isRemote: true,
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'math-prompt',
    displayName: 'Math Prompt',
    description: 'Mathematical encoding',
    longDescription:
      'Tests resilience against mathematical notation-based attacks using set theory and abstract algebra',
    cost: 'Medium',
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
    link: '/docs/red-team/strategies/goat/',
    isRemote: true,
  },
  {
    category: 'Multi-turn',
    strategy: 'jailbreak:hydra',
    displayName: 'Hydra Multi-turn',
    description: 'Adaptive multi-turn branching',
    longDescription:
      'Adaptive multi-turn jailbreak agent that pivots across branches with persistent scan-wide memory to uncover hidden vulnerabilities',
    cost: 'High',
    link: '/docs/red-team/strategies/hydra/',
    recommended: true,
    isRemote: true,
  },
  {
    category: 'Multi-turn',
    strategy: 'jailbreak:goblin',
    displayName: 'Goblin Multi-turn',
    description: 'Encoding, math, and logic attacks',
    longDescription:
      'Multi-turn jailbreak strategy focused on encoding techniques, math, and logic problems',
    cost: 'High',
    link: '/docs/red-team/strategies/goblin/',
    isRemote: true,
  },
  {
    category: 'Multi-turn',
    strategy: 'mischievous-user',
    displayName: 'Mischievous User',
    description: 'Mischievous user conversations',
    longDescription: 'Simulates a multi-turn conversation between a mischievous user and an agent',
    cost: 'High',
    link: '/docs/red-team/strategies/mischievous-user/',
  },
  {
    category: 'Indirect Prompt Injection',
    strategy: 'indirect-web-pwn',
    displayName: 'Indirect Web Pwn',
    description: 'Malicious web-content injection',
    longDescription:
      'Requires Promptfoo Cloud and a browsing-capable target; tests whether agents follow injected instructions or exfiltrate data from attacker-controlled web content',
    cost: 'High',
    link: '/docs/red-team/strategies/indirect-web-pwn/',
    isRemote: true,
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'video',
    displayName: 'Video Encoding',
    description: 'Text-to-video encoding bypass',
    longDescription:
      'Tests handling of text embedded in videos and encoded as base64 to potentially bypass text-based content filters',
    cost: 'Low',
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
    link: '/docs/red-team/strategies/audio/',
    isRemote: true,
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'base64',
    displayName: 'Base64',
    description: 'Base64 encoding bypass',
    longDescription:
      'Tests detection and handling of Base64-encoded malicious payloads to bypass content filters',
    cost: 'Low',
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
    link: '/docs/red-team/strategies/leetspeak/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'jailbreak-templates',
    displayName: 'Jailbreak Templates',
    description: 'Static jailbreak templates',
    longDescription:
      'Tests LLM resistance to known jailbreak techniques (DAN, Skeleton Key, etc.) using static templates. Note: Does not cover modern prompt injection techniques.',
    cost: 'Low',
    link: '/docs/red-team/strategies/jailbreak-templates/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'rot13',
    displayName: 'ROT13',
    description: 'Letter rotation encoding',
    longDescription:
      'Tests handling of ROT13-encoded malicious payloads by rotating each letter 13 positions in the alphabet',
    cost: 'Low',
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
    link: '/docs/red-team/strategies/other-encodings/#emoji-encoding',
  },
  {
    category: 'Custom',
    strategy: 'layer',
    displayName: 'Layer',
    description: 'Compose multiple strategies',
    longDescription:
      'Composes multiple red team strategies sequentially, such as jailbreak:meta followed by base64',
    cost: 'Variable',
    link: '/docs/red-team/strategies/layer/',
  },
  {
    category: 'Regression',
    strategy: 'retry',
    displayName: 'Retry',
    description: 'Historical failure testing',
    longDescription:
      'Automatically incorporates previously failed test cases into your test suite, creating a regression testing system that learns from past failures',
    cost: 'Low',
    link: '/docs/red-team/strategies/retry/',
    recommended: false,
  },
];
