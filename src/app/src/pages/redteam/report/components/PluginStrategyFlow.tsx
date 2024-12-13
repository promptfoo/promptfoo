// PluginStrategyFlow.tsx
import React, { useMemo } from 'react';
import { displayNameOverrides } from '@promptfoo/redteam/constants';
import { type EvaluateResult, type GradingResult } from '@promptfoo/types';
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from 'recharts';
import { getPluginIdFromResult, getStrategyIdFromGradingResult } from './shared';

interface TestRecord {
  prompt: string;
  output: string;
  gradingResult?: GradingResult;
  result?: EvaluateResult;
}

interface PluginStrategyFlowProps {
  failuresByPlugin: TestRecord[];
  passesByPlugin: TestRecord[];
  strategyStats: Record<string, { pass: number; total: number }>;
}

// Add custom node component
const CustomNode = ({ x, y, width, height, index, payload, containerWidth }: any) => {
  const isOut = x + width + 6 > containerWidth;
  const displayName =
    displayNameOverrides[payload.name as keyof typeof displayNameOverrides] || payload.name;
  const color =
    payload.name === 'Pass'
      ? '#2e7d32' // success.dark
      : payload.name === 'Fail'
        ? '#d32f2f' // error.dark
        : '#8884d8'; // default purple

  return (
    <Layer key={`CustomNode${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={color} fillOpacity="0.8" />
      <text
        textAnchor={isOut ? 'end' : 'start'}
        x={isOut ? x - 6 : x + width + 6}
        y={y + height / 2}
        fontSize="14"
        fill="#000"
      >
        {displayName}
      </text>
    </Layer>
  );
};

// Add these color constants at the top
const COLORS = {
  pass: '#2e7d32', // success.dark
  fail: '#d32f2f', // error.dark
  default: '#8884d8', // default purple
};

const CustomLink = (props: any) => {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } =
    props;
  const targetNode = payload.target;
  const color =
    targetNode.name === 'Pass'
      ? COLORS.pass
      : targetNode.name === 'Fail'
        ? COLORS.fail
        : COLORS.default;

  return (
    <Layer>
      <path
        d={`
          M${sourceX},${sourceY + linkWidth / 2}
          C${sourceControlX},${sourceY + linkWidth / 2}
            ${targetControlX},${targetY + linkWidth / 2}
            ${targetX},${targetY + linkWidth / 2}
          L${targetX},${targetY - linkWidth / 2}
          C${targetControlX},${targetY - linkWidth / 2}
            ${sourceControlX},${sourceY - linkWidth / 2}
            ${sourceX},${sourceY - linkWidth / 2}
          Z
        `}
        fill={color}
        fillOpacity={0.5}
        strokeWidth="0"
      />
    </Layer>
  );
};

const PluginStrategyFlow: React.FC<PluginStrategyFlowProps> = ({
  failuresByPlugin,
  passesByPlugin,
  strategyStats,
}) => {
  // Extract plugin -> strategy -> outcome mappings from the test records
  const data = useMemo(() => {
    // We'll aggregate counts of tests by (plugin, strategy, outcome)
    const linkCounts: Record<string, Record<string, { pass: number; fail: number }>> = {};

    function processTests(tests: TestRecord[], isPassing: boolean) {
      for (const t of tests) {
        const pluginId = t.result ? getPluginIdFromResult(t.result) : undefined;
        const strategyId = t.gradingResult
          ? getStrategyIdFromGradingResult(t.gradingResult)
          : undefined;

        if (!pluginId || !strategyId) {
          continue;
        }

        if (!linkCounts[pluginId]) {
          linkCounts[pluginId] = {};
        }
        if (!linkCounts[pluginId][strategyId]) {
          linkCounts[pluginId][strategyId] = { pass: 0, fail: 0 };
        }

        if (isPassing) {
          linkCounts[pluginId][strategyId].pass++;
        } else {
          linkCounts[pluginId][strategyId].fail++;
        }
      }
    }

    processTests(failuresByPlugin, false);
    processTests(passesByPlugin, true);

    // Extract unique plugin and strategy names
    const plugins = Object.keys(linkCounts);
    const strategies = Array.from(new Set(plugins.flatMap((p) => Object.keys(linkCounts[p]))));

    // Build nodes array with labels
    const nodes = [
      // Plugin nodes
      ...plugins.map((p) => ({ name: p, displayName: p })),
      // Strategy nodes
      ...strategies.map((s) => ({ name: s, displayName: s })),
      // Outcome nodes
      { name: 'Pass', displayName: 'Pass' },
      { name: 'Fail', displayName: 'Fail' },
    ];

    // Create indices for looking up node positions
    const pluginIndex: Record<string, number> = {};
    plugins.forEach((p, i) => {
      pluginIndex[p] = i;
    });

    const strategyIndex: Record<string, number> = {};
    strategies.forEach((s, i) => {
      strategyIndex[s] = i + plugins.length;
    });

    const outcomeIndex = {
      Pass: nodes.length - 2,
      Fail: nodes.length - 1,
    };

    // Build links array
    const links: { source: number; target: number; value: number }[] = [];

    // Plugin -> Strategy links
    for (const p of plugins) {
      for (const s of Object.keys(linkCounts[p])) {
        const total = linkCounts[p][s].pass + linkCounts[p][s].fail;
        if (total > 0) {
          links.push({
            source: pluginIndex[p],
            target: strategyIndex[s],
            value: total,
          });
        }
      }
    }

    // Strategy -> Outcome links
    for (const s of strategies) {
      let totalPass = 0;
      let totalFail = 0;

      // Sum up passes/fails for this strategy across all plugins
      for (const p of plugins) {
        if (linkCounts[p][s]) {
          totalPass += linkCounts[p][s].pass;
          totalFail += linkCounts[p][s].fail;
        }
      }

      if (totalPass > 0) {
        links.push({
          source: strategyIndex[s],
          target: outcomeIndex.Pass,
          value: totalPass,
        });
      }

      if (totalFail > 0) {
        links.push({
          source: strategyIndex[s],
          target: outcomeIndex.Fail,
          value: totalFail,
        });
      }
    }

    return { nodes, links };
  }, [failuresByPlugin, passesByPlugin]);

  if (data.nodes.length === 0 || data.links.length === 0) {
    return (
      <div style={{ textAlign: 'center', marginTop: '1em' }}>
        <p>No data available to display the strategy flow.</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 400 }}>
      <ResponsiveContainer>
        <Sankey
          data={data}
          nodePadding={50}
          nodeWidth={15}
          margin={{ top: 20, bottom: 20, left: 100, right: 100 }}
          link={<CustomLink />}
          node={<CustomNode />}
        >
          <Tooltip
            content={({ payload }) => {
              if (!payload?.[0]) {
                return null;
              }
              const data = payload[0] as any;
              const { source, target, value } = data;
              return (
                <div
                  className="custom-tooltip"
                  style={{
                    backgroundColor: 'white',
                    padding: '5px 10px',
                    border: '1px solid #ccc',
                  }}
                >
                  <strong>
                    {source?.name} → {target?.name}
                  </strong>
                  : {value} tests
                </div>
              );
            }}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
};

export default PluginStrategyFlow;
