import React from 'react';
import { PLUGINS } from './data/plugins';

const PrivacyPluginsTable = () => {
  // Filter for plugins with privacy vulnerability type
  const privacyPlugins = PLUGINS.filter((plugin) => plugin.vulnerabilityType === 'privacy');

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
        {privacyPlugins.map((plugin) => (
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

export default PrivacyPluginsTable;
