import React from 'react';
import { PLUGINS, PLUGIN_CATEGORIES } from './data/plugins';
import type { Plugin, PluginCategory } from './data/plugins';
import { getCategoryAnchor } from './utils/categoryUtils';

type GroupedPlugins = Record<PluginCategory, Plugin[]>;
const groupedPlugins: GroupedPlugins = {} as GroupedPlugins;
for (const category of PLUGIN_CATEGORIES) {
  groupedPlugins[category] = PLUGINS.filter((plugin) => plugin.category === category).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

const PluginTable = ({
  shouldRenderCategory = true,
  shouldRenderStrategy = true,
  shouldRenderDescription = true,
  shouldRenderPluginId = true,
}) => {
  return (
    <table>
      <thead>
        <tr>
          {shouldRenderCategory && (
            <th style={{ verticalAlign: 'top', textAlign: 'left' }}>Category</th>
          )}
          {shouldRenderStrategy && <th>Plugin</th>}
          {shouldRenderDescription && <th>Description</th>}
          {shouldRenderPluginId && <th>Plugin ID</th>}
        </tr>
      </thead>
      <tbody>
        {Object.entries(groupedPlugins).map(([category, categoryPlugins]) => (
          <React.Fragment key={category}>
            {categoryPlugins.map((plugin, index) => (
              <tr key={plugin.pluginId}>
                {index === 0 && shouldRenderCategory && (
                  <td
                    rowSpan={categoryPlugins.length}
                    style={{ verticalAlign: 'top' }}
                    id={getCategoryAnchor(plugin.category).slice(1)}
                  >
                    {plugin.category}
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
  const harmfulPlugins = PLUGINS.filter((plugin) => plugin.label === 'harmful');

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
  const piiPlugins = PLUGINS.filter((plugin) => plugin.label === 'pii');

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
  const brandPlugins = PLUGINS.filter((plugin) => plugin.label === 'brand');

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
  const technicalPlugins = PLUGINS.filter((plugin) => plugin.label === 'technical');

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
