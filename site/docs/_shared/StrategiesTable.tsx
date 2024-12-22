import React from 'react';

const strategiesData = [
  {
    category: 'Static (Single-Turn)',
    strategy: 'Base64',
    description: 'Base64 encoding bypass',
    longDescription: 'Encodes the injected variable using Base64 encoding',
    cost: 'Low',
    asrIncrease: '20-30%',
    link: '/docs/red-team/strategies/base64/',
  },
  {
    category: 'Static (Single-Turn)',
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
    strategy: 'Prompt Injection',
    description: 'Direct system prompts',
    longDescription: 'Wraps the payload in a prompt injection',
    cost: 'Low',
    asrIncrease: '50-70%',
    link: '/docs/red-team/strategies/prompt-injection/',
  },
  {
    category: 'Static (Single-Turn)',
    strategy: 'Multilingual',
    description: 'Cross-language testing',
    longDescription: 'Translates the request to multiple low-resource languages',
    cost: 'Low',
    asrIncrease: '30-40%',
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'Math Prompt',
    description: 'Mathematical encoding',
    longDescription: 'Applies a linear probe jailbreak technique to deliver the payload (Default)',
    cost: 'Medium',
    asrIncrease: '70-80%',
    link: '/docs/red-team/strategies/math-prompt/',
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'Citation',
    description: 'Academic framing',
    longDescription: 'Uses academic citations and references to potentially bypass safety measures',
    cost: 'Medium',
    asrIncrease: '40-60%',
    link: '/docs/red-team/strategies/citation/',
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'Composite',
    description: 'Combined techniques',
    longDescription: 'Combines multiple jailbreak techniques from research papers (Default)',
    cost: 'Medium',
    asrIncrease: '60-80%',
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'Jailbreak',
    description: 'Lightweight iterative refinement',
    longDescription: 'Applies a multi-turn jailbreak technique',
    cost: 'High',
    asrIncrease: '60-80%',
  },
  {
    category: 'Dynamic (Single-Turn)',
    strategy: 'Tree-based',
    description: 'Branching attack paths',
    longDescription: 'Applies a tree-based jailbreak technique',
    cost: 'High',
    asrIncrease: '60-80%',
  },
  {
    category: 'Multi-turn',
    strategy: 'GOAT',
    description: 'Gradual escalation',
    longDescription: 'Applies a multi-turn jailbreak technique',
    cost: 'High',
    asrIncrease: '70-90%',
  },
  {
    category: 'Multi-turn',
    strategy: 'Crescendo',
    description: 'Gradual escalation',
    longDescription: 'Applies a multi-turn jailbreak technique',
    cost: 'High',
    asrIncrease: '70-90%',
  },
  {
    category: 'Custom',
    strategy: 'Custom',
    description: 'User-defined strategies',
    longDescription: 'Raw payloads only (Default)',
    cost: 'Varies',
    asrIncrease: 'Varies',
  },
  {
    category: 'Basic',
    strategy: 'Basic',
    description: 'Plugin-generated test cases without applied strategies',
    longDescription:
      'Controls whether the original plugin-generated test cases (without any strategies applied) are included in the final output',
    cost: 'Varies',
    asrIncrease: 'Varies',
  },
];

const StrategiesTable = ({
  shouldRenderCategory = true,
  shouldRenderStrategy = true,
  shouldRenderDescription = true,
  shouldRenderLongDescription = true,
  shouldRenderCost = true,
  shouldRenderAsrIncrease = true,
}) => {
  return (
    <table>
      <thead>
        <tr>
          {shouldRenderCategory && <th>Category</th>}
          {shouldRenderStrategy && <th>Strategy</th>}
          {shouldRenderDescription && <th>Description</th>}
          {shouldRenderLongDescription && <th>Detailed Description</th>}
          {shouldRenderCost && <th>Cost</th>}
          {shouldRenderAsrIncrease && <th>ASR Increase over No Strategy</th>}
        </tr>
      </thead>
      <tbody>
        {strategiesData.map((strategy, index) => (
          <tr key={index}>
            {shouldRenderCategory && <td>{strategy.category}</td>}
            {shouldRenderStrategy && (
              <td>
                <a href={strategy.link}>{strategy.strategy}</a>
              </td>
            )}
            {shouldRenderDescription && <td>{strategy.description}</td>}
            {shouldRenderLongDescription && <td>{strategy.longDescription}</td>}
            {shouldRenderCost && <td>{strategy.cost}</td>}
            {shouldRenderAsrIncrease && <td>{strategy.asrIncrease}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default StrategiesTable;
