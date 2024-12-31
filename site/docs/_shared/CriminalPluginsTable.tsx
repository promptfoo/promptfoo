import React from 'react';
import { PLUGINS } from './data/plugins';

const CriminalPluginsTable = () => {
  // Filter for plugins with criminal vulnerability type
  const criminalPlugins = PLUGINS.filter(plugin => 
    plugin.vulnerabilityType === 'criminal'
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
        {criminalPlugins.map((plugin) => (
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

export default CriminalPluginsTable; 