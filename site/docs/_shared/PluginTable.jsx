import React from 'react';

const pluginsData = [
  {
    category: 'Security and Access Control',
    name: 'Unauthorized Data Access',
    description: 'Broken Object Level Authorization (BOLA) tests',
    pluginId: 'bola',
    link: '/docs/red-team/plugins/bola/',
    label: null,
  },
  {
    category: 'Security and Access Control',
    name: 'Privilege Escalation',
    description: 'Broken Function Level Authorization (BFLA) tests',
    pluginId: 'bfla',
    link: '/docs/red-team/plugins/bfla/',
    label: null,
  },
  {
    category: 'Security and Access Control',
    name: 'RBAC Enforcement',
    description: 'Tests whether the model properly implements Role-Based Access Control (RBAC)',
    pluginId: 'rbac',
    link: '/docs/red-team/plugins/rbac/',
    label: null,
  },
  {
    category: 'Security and Access Control',
    name: 'Debug Access',
    description: 'Attempts to access or use debugging commands',
    pluginId: 'debug-access',
    link: '/docs/red-team/plugins/debug-access/',
    label: null,
  },
  {
    category: 'Security and Access Control',
    name: 'Shell Injection',
    description: 'Attempts to execute shell commands through the model',
    pluginId: 'shell-injection',
    link: '/docs/red-team/plugins/shell-injection/',
    label: null,
  },
  {
    category: 'Security and Access Control',
    name: 'SQL Injection',
    description: 'Attempts to perform SQL injection attacks to manipulate database queries',
    pluginId: 'sql-injection',
    link: '/docs/red-team/plugins/sql-injection/',
    label: null,
  },
  {
    category: 'Security and Access Control',
    name: 'Malicious Resource Fetching',
    description: 'Server-Side Request Forgery (SSRF) tests',
    pluginId: 'ssrf',
    link: '/docs/red-team/plugins/ssrf/',
    label: null,
  },
  {
    category: 'Security and Access Control',
    name: 'Indirect Prompt Injection',
    description:
      'Tests if the prompt is vulnerable to instructions injected into variables in the prompt',
    pluginId: 'indirect-prompt-injection',
    link: '/docs/red-team/plugins/indirect-prompt-injection/',
    label: null,
  },
  {
    category: 'Security and Access Control',
    name: 'ASCII Smuggling',
    description: 'Attempts to obfuscate malicious content using ASCII smuggling',
    pluginId: 'ascii-smuggling',
    link: '/docs/red-team/plugins/ascii-smuggling/',
    label: null,
  },
  {
    category: 'Security and Access Control',
    name: 'Hijacking',
    description: 'Unauthorized or off-topic resource use',
    pluginId: 'hijacking',
    link: '/docs/red-team/plugins/hijacking/',
    label: null,
  },
  {
    category: 'Security and Access Control',
    name: 'Intent',
    description: 'Attempts to manipulate the model to exhibit specific behaviors',
    pluginId: 'intent',
    link: '/docs/red-team/plugins/intent/',
    label: null,
  },
  {
    category: 'Security and Access Control',
    name: 'PII Leaks',
    description: 'All PII categories',
    pluginId: 'pii',
    link: '/docs/red-team/plugins/pii/',
    label: null,
  },
  {
    category: 'Security and Access Control',
    name: 'PII in API/Database',
    description: 'PII exposed through API or database',
    pluginId: 'pii:api-db',
    link: '/docs/red-team/plugins/pii/',
    label: 'pii',
  },
  {
    category: 'Security and Access Control',
    name: 'Direct PII Exposure',
    description: 'Direct exposure of PII',
    pluginId: 'pii:direct',
    link: '/docs/red-team/plugins/pii/',
    label: 'pii',
  },
  {
    category: 'Security and Access Control',
    name: 'PII in Session Data',
    description: 'PII exposed in session data',
    pluginId: 'pii:session',
    link: '/docs/red-team/plugins/pii/',
    label: 'pii',
  },
  {
    category: 'Security and Access Control',
    name: 'PII via Social Engineering',
    description: 'PII exposed through social engineering',
    pluginId: 'pii:social',
    link: '/docs/red-team/plugins/pii/',
    label: 'pii',
  },
  {
    category: 'Security and Access Control',
    name: 'Cross-Session Leak',
    description: 'Checks for information sharing between unrelated sessions',
    pluginId: 'cross-session-leak',
    link: '/docs/red-team/plugins/cross-session-leak/',
    label: null,
  },
  {
    category: 'Security and Access Control',
    name: 'Privacy Violation',
    description: 'Content violating privacy rights',
    pluginId: 'harmful:privacy',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Security and Access Control',
    name: 'Prompt Extraction',
    description: 'Attempts to get the model to reveal its system prompt',
    pluginId: 'prompt-extraction',
    link: '/docs/red-team/plugins/prompt-extraction/',
    label: null,
  },
  {
    category: 'Compliance and Legal',
    name: 'Intellectual Property Violation',
    description: 'Content violating intellectual property rights',
    pluginId: 'harmful:intellectual-property',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    name: 'Copyright Violations',
    description: 'Content violating copyright laws',
    pluginId: 'harmful:copyright-violations',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    name: 'Unsupervised Contracts',
    description: 'Enters business or legal commitments without supervision',
    pluginId: 'contracts',
    link: '/docs/red-team/plugins/contracts/',
    label: 'brand',
  },
  {
    category: 'Compliance and Legal',
    name: 'Specialized Advice',
    description: 'Providing advice in specialized fields without expertise',
    pluginId: 'harmful:specialized-advice',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    name: 'Violent Crime',
    description: 'Content related to violent criminal activities',
    pluginId: 'harmful:violent-crime',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    name: 'Non-Violent Crime',
    description: 'Content related to non-violent criminal activities',
    pluginId: 'harmful:non-violent-crime',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    name: 'Sex Crimes',
    description: 'Content related to sexual crimes',
    pluginId: 'harmful:sex-crime',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    name: 'Cybercrime',
    description: 'Content related to cybercriminal activities',
    pluginId: 'harmful:cybercrime',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    name: 'Illegal Activities',
    description: 'Content promoting illegal activities',
    pluginId: 'harmful:illegal-activities',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    name: 'Illegal Drugs',
    description: 'Content related to illegal drug use or trade',
    pluginId: 'harmful:illegal-drugs',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    name: 'Chemical & Biological Weapons',
    description: 'Content related to chemical or biological weapons',
    pluginId: 'harmful:chemical-biological-weapons',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    name: 'Indiscriminate Weapons',
    description: 'Content related to weapons without context',
    pluginId: 'harmful:indiscriminate-weapons',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    name: 'Unsafe Practices',
    description: 'Content promoting unsafe or harmful practices',
    pluginId: 'harmful:unsafe-practices',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Trust and Safety',
    name: 'Hijacking',
    description: 'Unauthorized or off-topic resource use',
    pluginId: 'hijacking',
    link: '/docs/red-team/plugins/hijacking/',
    label: null,
  },
  {
    category: 'Trust and Safety',
    name: 'Child Exploitation',
    description: 'Content exploiting or harming children',
    pluginId: 'harmful:child-exploitation',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Trust and Safety',
    name: 'Graphic Content',
    description: 'Displaying graphic or violent content',
    pluginId: 'harmful:graphic-content',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Trust and Safety',
    name: 'Hate Speech',
    description: 'Content that promotes hate or discrimination',
    pluginId: 'harmful:hate',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Trust and Safety',
    name: 'Sexual Content',
    description: 'Explicit or inappropriate sexual content',
    pluginId: 'harmful:sexual-content',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Trust and Safety',
    name: 'Self Harm',
    description: 'Content that encourages self-harm or suicide',
    pluginId: 'harmful:self-harm',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Trust and Safety',
    name: 'Profanity',
    description: 'Content containing profane or inappropriate language',
    pluginId: 'harmful:profanity',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Trust and Safety',
    name: 'Harassment and Bullying',
    description: 'Content that harasses or bullies individuals',
    pluginId: 'harmful:harassment-bullying',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Trust and Safety',
    name: 'Insults',
    description: 'Content that insults or demeans individuals',
    pluginId: 'harmful:insults',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Trust and Safety',
    name: 'Radicalization',
    description: 'Content that promotes radical or extremist views',
    pluginId: 'harmful:radicalization',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Trust and Safety',
    name: 'Political Opinions',
    description: 'Makes political statements',
    pluginId: 'politics',
    link: '/docs/red-team/plugins/politics/',
    label: 'brand',
  },
  {
    category: 'Trust and Safety',
    name: 'Religious Sensitivity',
    description: 'Tests handling of religious content and bias',
    pluginId: 'religion',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Brand',
    name: 'Competitor Endorsement',
    description: 'Competitor mentions and endorsements',
    pluginId: 'competitors',
    link: '/docs/red-team/plugins/competitors/',
    label: null,
  },
  {
    category: 'Brand',
    name: 'Misinformation and Disinformation',
    description: 'Spreading false or misleading information',
    pluginId: 'harmful:misinformation-disinformation',
    link: '/docs/red-team/plugins/harmful/',
    label: 'harmful',
  },
  {
    category: 'Brand',
    name: 'Hallucination',
    description: 'Model generating false or misleading information',
    pluginId: 'hallucination',
    link: '/docs/red-team/plugins/hallucination/',
    label: 'brand',
  },
  {
    category: 'Brand',
    name: 'Overreliance',
    description: 'Model susceptible to relying on an incorrect user assumption or input',
    pluginId: 'overreliance',
    link: '/docs/red-team/plugins/overreliance/',
    label: null,
  },
  {
    category: 'Brand',
    name: 'Excessive Agency',
    description: 'Model taking excessive initiative or misunderstanding its capabilities',
    pluginId: 'excessive-agency',
    link: '/docs/red-team/plugins/excessive-agency/',
    label: 'brand',
  },
  {
    category: 'Brand',
    name: 'Imitation',
    description: 'Imitates people, brands, or organizations',
    pluginId: 'imitation',
    link: '/docs/red-team/plugins/imitation/',
    label: 'brand',
  },
  {
    category: 'Custom',
    name: 'Custom Policy',
    description: 'Violates a custom configured policy',
    pluginId: 'policy',
    link: '/docs/red-team/plugins/custom/',
    label: null,
  },
  {
    category: 'Custom',
    name: 'Intent',
    description: 'Attempts to manipulate the model to exhibit specific behaviors',
    pluginId: 'intent',
    link: '/docs/red-team/plugins/intent/',
    label: null,
  },
];

const PluginTable = ({
  shouldRenderCategory = true,
  shouldRenderStrategy = true,
  shouldRenderDescription = true,
  shouldRenderPluginId = true,
}) => {
  // Group plugins by category
  const groupedPlugins = pluginsData.reduce((acc, plugin) => {
    if (!acc[plugin.category]) {
      acc[plugin.category] = [];
    }
    acc[plugin.category].push(plugin);
    return acc;
  }, {});

  return (
    <table>
      <thead>
        <tr>
          {shouldRenderCategory && (
            <th style={{ verticalAlign: 'top', textAlign: 'left' }}>Category</th>
          )}
          {shouldRenderStrategy && <th>Strategy</th>}
          {shouldRenderDescription && <th>Description</th>}
          {shouldRenderPluginId && <th>Plugin ID</th>}
        </tr>
      </thead>
      <tbody>
        {Object.entries(groupedPlugins).map(([category, plugins]) => (
          <React.Fragment key={category}>
            {plugins.map((plugin, index) => (
              <tr key={plugin.pluginId}>
                {index === 0 && shouldRenderCategory && (
                  <td rowSpan={plugins.length} style={{ verticalAlign: 'top' }}>
                    {category}
                  </td>
                )}
                {shouldRenderStrategy && (
                  <td>
                    <a href={plugin.link}>{plugin.name}</a>
                  </td>
                )}
                {shouldRenderDescription && <td>{plugin.description}</td>}
                {shouldRenderPluginId && (
                  <td>
                    <code>{plugin.pluginId}</code>
                  </td>
                )}
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
};

const HarmfulPluginsTable = () => {
  // Filter plugins with 'harmful' label
  const harmfulPlugins = pluginsData.filter((plugin) => plugin.label === 'harmful');

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Description</th>
          <th>Plugin ID</th>
        </tr>
      </thead>
      <tbody>
        {harmfulPlugins.map((plugin) => (
          <tr key={plugin.pluginId}>
            <td>
              <a href={plugin.link}>{plugin.name}</a>
            </td>
            <td>{plugin.description}</td>
            <td>
              <code>{plugin.pluginId}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const PIIPluginsTable = () => {
  // Filter plugins with 'pii' label
  const piiPlugins = pluginsData.filter((plugin) => plugin.label === 'pii');

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Description</th>
          <th>Plugin ID</th>
        </tr>
      </thead>
      <tbody>
        {piiPlugins.map((plugin) => (
          <tr key={plugin.pluginId}>
            <td>
              <a href={plugin.link}>{plugin.name}</a>
            </td>
            <td>{plugin.description}</td>
            <td>
              <code>{plugin.pluginId}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const BrandPluginsTable = () => {
  // Filter plugins with 'brand' label
  const brandPlugins = pluginsData.filter((plugin) => plugin.label === 'brand');

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Description</th>
          <th>Plugin ID</th>
        </tr>
      </thead>
      <tbody>
        {brandPlugins.map((plugin) => (
          <tr key={plugin.pluginId}>
            <td>
              <a href={plugin.link}>{plugin.name}</a>
            </td>
            <td>{plugin.description}</td>
            <td>
              <code>{plugin.pluginId}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const TechnicalPluginsTable = () => {
  // Filter plugins with 'technical' label
  const technicalPlugins = pluginsData.filter((plugin) => plugin.label === 'technical');

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Description</th>
          <th>Plugin ID</th>
        </tr>
      </thead>
      <tbody>
        {technicalPlugins.map((plugin) => (
          <tr key={plugin.pluginId}>
            <td>
              <a href={plugin.link}>{plugin.name}</a>
            </td>
            <td>{plugin.description}</td>
            <td>
              <code>{plugin.pluginId}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export { HarmfulPluginsTable, PIIPluginsTable, BrandPluginsTable, TechnicalPluginsTable };
export default PluginTable;
