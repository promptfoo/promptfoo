import React from 'react';
import { PLUGINS } from './data/plugins';

const HarmfulPluginsTable = () => {
  // Filter for plugins with harmful vulnerability type
  const harmfulPlugins = PLUGINS.filter((plugin) => plugin.vulnerabilityType === 'harmful');

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

export default HarmfulPluginsTable;
