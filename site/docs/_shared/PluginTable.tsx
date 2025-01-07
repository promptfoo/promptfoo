import React from 'react';
import { PLUGINS, PLUGIN_CATEGORIES } from './data/plugins';
import type { Plugin, PluginCategory } from './data/plugins';
import { getCategoryAnchor } from './utils/categoryUtils';

type GroupedPlugins = Record<PluginCategory, Plugin[]>;

interface PluginTableProps {
  vulnerabilityType?: string;
  shouldRenderCategory?: boolean;
  shouldRenderDescription?: boolean;
  shouldRenderPluginId?: boolean;
  shouldGroupByCategory?: boolean;
  showApplicationTypes?: boolean;
}

const styles = {
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    tableLayout: 'fixed' as const,
  },
  th: {
    padding: '12px 8px',
    textAlign: 'left' as const,
    whiteSpace: 'nowrap' as const,
    borderBottom: '2px solid var(--ifm-table-border-color)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  td: {
    padding: '8px',
    borderBottom: '1px solid var(--ifm-table-border-color)',
    verticalAlign: 'top' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // Column-specific widths
  columns: {
    category: { width: '15%', fontWeight: 'bold' },
    name: { width: '20%', fontWeight: 'bold' },
    description: { width: '40%', whiteSpace: 'normal' as const },
    pluginId: { width: '15%' },
    indicator: { width: '5%', textAlign: 'center' as const },
  },
  code: {
    whiteSpace: 'nowrap' as const,
    fontSize: '0.9em',
  },
  link: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
};

const PluginTable = ({
  vulnerabilityType,
  shouldRenderCategory = true,
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
    <table style={styles.table}>
      <thead>
        <tr>
          {shouldRenderCategory && shouldGroupByCategory && (
            <th style={{ ...styles.th, ...styles.columns.category }}>Category</th>
          )}
          <th style={{ ...styles.th, ...styles.columns.name }}>Plugin Name</th>
          {shouldRenderDescription && (
            <th style={{ ...styles.th, ...styles.columns.description }}>Description</th>
          )}
          {shouldRenderPluginId && (
            <th style={{ ...styles.th, ...styles.columns.pluginId }}>Plugin ID</th>
          )}
          {showApplicationTypes && (
            <>
              <th style={{ ...styles.th, ...styles.columns.indicator }}>RAG</th>
              <th style={{ ...styles.th, ...styles.columns.indicator }}>Agent</th>
              <th style={{ ...styles.th, ...styles.columns.indicator }}>Chatbot</th>
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
                        style={{ ...styles.td, ...styles.columns.category }}
                        id={getCategoryAnchor(plugin.category).slice(1)}
                      >
                        {plugin.category}
                      </td>
                    )}
                    <td style={{ ...styles.td, ...styles.columns.name }}>
                      <a href={plugin.link} style={styles.link} title={plugin.name}>
                        {plugin.name}
                      </a>
                    </td>
                    {shouldRenderDescription && (
                      <td style={{ ...styles.td, ...styles.columns.description }}>
                        {plugin.description}
                      </td>
                    )}
                    {shouldRenderPluginId && (
                      <td style={{ ...styles.td, ...styles.columns.pluginId }}>
                        <code style={styles.code}>{plugin.pluginId}</code>
                      </td>
                    )}
                    {showApplicationTypes && (
                      <>
                        <td style={{ ...styles.td, ...styles.columns.indicator }}>
                          {plugin.applicationTypes?.rag ? '🚨' : '✅'}
                        </td>
                        <td style={{ ...styles.td, ...styles.columns.indicator }}>
                          {plugin.applicationTypes?.agent ? '🚨' : '✅'}
                        </td>
                        <td style={{ ...styles.td, ...styles.columns.indicator }}>
                          {plugin.applicationTypes?.chat ? '🚨' : '✅'}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </React.Fragment>
            ))
          : filteredPlugins.map((plugin) => (
              <tr key={plugin.pluginId}>
                <td style={styles.td}>
                  <a href={plugin.link}>{plugin.name}</a>
                </td>
                {shouldRenderDescription && <td style={styles.td}>{plugin.description}</td>}
                {shouldRenderPluginId && (
                  <td style={styles.td}>
                    <code style={styles.code}>{plugin.pluginId}</code>
                  </td>
                )}
                {showApplicationTypes && (
                  <>
                    <td style={styles.td}>{plugin.applicationTypes?.rag ? '🚨' : '✅'}</td>
                    <td style={styles.td}>{plugin.applicationTypes?.agent ? '🚨' : '✅'}</td>
                    <td style={styles.td}>{plugin.applicationTypes?.chat ? '🚨' : '✅'}</td>
                  </>
                )}
              </tr>
            ))}
      </tbody>
    </table>
  );
};

export default PluginTable;
