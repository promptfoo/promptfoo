import React from 'react';
import { PLUGINS } from './data/plugins';

const SecurityPluginsTable = () => {
  // Filter for plugins with security vulnerability type
  const securityPlugins = PLUGINS.filter(plugin => 
    plugin.vulnerabilityType === 'security'
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
        {securityPlugins.map((plugin) => (
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

export default SecurityPluginsTable; 