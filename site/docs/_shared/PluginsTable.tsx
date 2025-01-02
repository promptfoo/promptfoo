import React from 'react';
import { PLUGINS } from './data/plugins';

const PluginsTable = ({ vulnerabilityType }: { vulnerabilityType: string }) => {
  // Filter for plugins with criminal vulnerability type
  const plugins = PLUGINS.filter((plugin) => plugin.vulnerabilityType === vulnerabilityType);

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
        {plugins.map((plugin) => (
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

export default PluginsTable;
