import React from 'react';
import { PLUGINS } from './data/plugins';

const MisinformationPluginsTable = () => {
  // Filter for plugins with misinformation and misuse vulnerability type
  const misinformationPlugins = PLUGINS.filter(
    (plugin) => plugin.vulnerabilityType === 'misinformation and misuse',
  );

  return (
    <table>
      <thead>
        <tr>
          <th>Plugin Name</th>
          <th>Description</th>
          <th>Plugin ID</th>
        </tr>
      </thead>
      <tbody>
        {misinformationPlugins.map((plugin) => (
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

export default MisinformationPluginsTable;
