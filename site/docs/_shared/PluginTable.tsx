import React from 'react';
import { PLUGINS, PLUGIN_CATEGORIES } from './data/plugins';
import type { Plugin, PluginCategory } from './data/plugins';
import { getCategoryAnchor } from './utils/categoryUtils';

type GroupedPlugins = Record<PluginCategory, Plugin[]>;

interface PluginTableProps {
  vulnerabilityType?: string;
  shouldRenderCategory?: boolean;
  shouldRenderStrategy?: boolean;
  shouldRenderDescription?: boolean;
  shouldRenderPluginId?: boolean;
  shouldGroupByCategory?: boolean;
  showApplicationTypes?: boolean;
}

const PluginTable = ({
  vulnerabilityType,
  shouldRenderCategory = true,
  shouldRenderStrategy = true,
  shouldRenderDescription = true,
  shouldRenderPluginId = true,
  shouldGroupByCategory = false,
  showApplicationTypes = false,
}: PluginTableProps) => {
  let filteredPlugins = PLUGINS;

  // Apply filters if specified
  if (vulnerabilityType) {
    filteredPlugins = filteredPlugins.filter(
      (plugin) => plugin.vulnerabilityType === vulnerabilityType,
    );
  }

  // Group plugins by category if needed
  const groupedPlugins: GroupedPlugins = {} as GroupedPlugins;
  if (shouldGroupByCategory) {
    for (const category of PLUGIN_CATEGORIES) {
      groupedPlugins[category] = filteredPlugins
        .filter((plugin) => plugin.category === category)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return (
    <table>
      <thead>
        <tr>
          {shouldRenderCategory && shouldGroupByCategory && (
            <th style={{ verticalAlign: 'top', textAlign: 'left' }}>Category</th>
          )}
          <th>Plugin Name</th>
          {shouldRenderDescription && <th>Description</th>}
          {shouldRenderPluginId && <th>Plugin ID</th>}
          {showApplicationTypes && (
            <>
              <th>RAG</th>
              <th>Agent</th>
              <th>Chatbot</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {shouldGroupByCategory
          ? Object.entries(groupedPlugins).map(([category, categoryPlugins]) => (
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
                    <td>
                      <a href={plugin.link}>{plugin.name}</a>
                    </td>
                    {shouldRenderDescription && <td>{plugin.description}</td>}
                    {shouldRenderPluginId && (
                      <td>
                        <code>{plugin.pluginId}</code>
                      </td>
                    )}
                    {showApplicationTypes && (
                      <>
                        <td>{plugin.applicationTypes?.rag ? '🚨' : '✅'}</td>
                        <td>{plugin.applicationTypes?.agent ? '🚨' : '✅'}</td>
                        <td>{plugin.applicationTypes?.chat ? '🚨' : '✅'}</td>
                      </>
                    )}
                  </tr>
                ))}
              </React.Fragment>
            ))
          : filteredPlugins.map((plugin) => (
              <tr key={plugin.pluginId}>
                <td>
                  <a href={plugin.link}>{plugin.name}</a>
                </td>
                {shouldRenderDescription && <td>{plugin.description}</td>}
                {shouldRenderPluginId && (
                  <td>
                    <code>{plugin.pluginId}</code>
                  </td>
                )}
                {showApplicationTypes && (
                  <>
                    <td>{plugin.applicationTypes?.rag ? '🚨' : '✅'}</td>
                    <td>{plugin.applicationTypes?.agent ? '🚨' : '✅'}</td>
                    <td>{plugin.applicationTypes?.chat ? '🚨' : '✅'}</td>
                  </>
                )}
              </tr>
            ))}
      </tbody>
    </table>
  );
};

export default PluginTable;
