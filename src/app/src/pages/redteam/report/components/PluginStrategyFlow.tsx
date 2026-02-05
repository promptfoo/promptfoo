// PluginStrategyFlow.tsx

import React, { useMemo } from 'react';

import { displayNameOverrides } from '@promptfoo/redteam/constants';
import { Layer, Rectangle, ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import { getPluginIdFromResult, getStrategyIdFromTest, type TestWithMetadata } from './shared';

interface PluginStrategyFlowProps {
  failuresByPlugin: TestWithMetadata[];
  passesByPlugin: TestWithMetadata[];
}

// Helper to get CSS variable value and return as hsl() string
const getCssVarAsHsl = (varName: string, fallbackHsl: string): string => {
  if (typeof window === 'undefined') {
    return `hsl(${fallbackHsl})`;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  // Validate that value looks like HSL format (e.g., "222.2 84% 4.9%")
  if (value && /^[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(value)) {
    return `hsl(${value})`;
  }
  return `hsl(${fallbackHsl})`;
};

// biome-ignore lint/suspicious/noExplicitAny: FIXME: This type in sankey is private
type SankeyNodeOptions = any;
// biome-ignore lint/suspicious/noExplicitAny: FIXME: This type in sankey is private
type SankeyLinkOptions = any;

// Add custom node component
const CustomNode = ({ x, y, width, height, index, payload, containerWidth }: SankeyNodeOptions) => {
  const textRef = React.useRef<SVGTextElement>(null);
  const [labelWidth, setLabelWidth] = React.useState(0);
  const isOut = x + width + 6 > containerWidth;
  const displayName =
    payload.name === 'Pass'
      ? 'Defended'
      : payload.name === 'Fail'
        ? 'Vulnerable'
        : displayNameOverrides[payload.name as keyof typeof displayNameOverrides] || payload.name;

  const label = `${displayName} (${payload.value || 0})`;
  const color =
    payload.name === 'Pass' ? '#2e7d32' : payload.name === 'Fail' ? '#d32f2f' : '#8884d8';

  // Get theme colors from CSS variables
  const bgColor = getCssVarAsHsl('--card', '0 0% 100%');
  const borderColor = getCssVarAsHsl('--border', '214.3 31.8% 91.4%');
  const textColor = getCssVarAsHsl('--foreground', '222.2 84% 4.9%');

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  React.useEffect(() => {
    if (textRef.current) {
      setLabelWidth(textRef.current.getComputedTextLength() + 16);
    }
  }, [label]);

  return (
    <Layer key={`CustomNode${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={color} fillOpacity="0.8" />
      {labelWidth > 0 && (
        <rect
          x={isOut ? x - labelWidth - 6 : x + width + 6}
          y={y + height / 2 - 8}
          width={labelWidth}
          height={20}
          rx={10}
          ry={10}
          fill={bgColor}
          stroke={borderColor}
        />
      )}
      <text
        ref={textRef}
        textAnchor={isOut ? 'end' : 'start'}
        x={isOut ? x - 14 : x + width + 14}
        y={y + height / 2 + 5}
        fontSize="12"
        fill={textColor}
      >
        {label}
      </text>
    </Layer>
  );
};

// Helper function to interpolate between colors
const interpolateColor = (ratio: number) => {
  // Define colors: red -> yellow -> green
  const colors = {
    red: { r: 0xd3, g: 0x2f, b: 0x2f }, // #d32f2f
    yellow: { r: 0xff, g: 0xeb, b: 0x3b }, // #ffeb3b
    green: { r: 0x2e, g: 0x7d, b: 0x32 }, // #2e7d32
  };

  if (ratio <= 0.5) {
    // Interpolate from red to yellow
    const t = ratio * 2; // normalize to 0-1 range
    return `#${Math.round(colors.red.r + (colors.yellow.r - colors.red.r) * t)
      .toString(16)
      .padStart(2, '0')}${Math.round(colors.red.g + (colors.yellow.g - colors.red.g) * t)
      .toString(16)
      .padStart(2, '0')}${Math.round(colors.red.b + (colors.yellow.b - colors.red.b) * t)
      .toString(16)
      .padStart(2, '0')}`;
  } else {
    // Interpolate from yellow to green
    const t = (ratio - 0.5) * 2; // normalize to 0-1 range
    return `#${Math.round(colors.yellow.r + (colors.green.r - colors.yellow.r) * t)
      .toString(16)
      .padStart(2, '0')}${Math.round(colors.yellow.g + (colors.green.g - colors.yellow.g) * t)
      .toString(16)
      .padStart(2, '0')}${Math.round(colors.yellow.b + (colors.green.b - colors.yellow.b) * t)
      .toString(16)
      .padStart(2, '0')}`;
  }
};

const CustomLink = (props: SankeyLinkOptions) => {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } =
    props;

  // Calculate pass ratio and determine color
  const passRatio = payload.source.passRatio || 0;
  const color = interpolateColor(passRatio);

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
        fillOpacity={1.0}
        strokeWidth="0"
      />
    </Layer>
  );
};

const PluginStrategyFlow = ({ failuresByPlugin, passesByPlugin }: PluginStrategyFlowProps) => {
  // Extract plugin -> strategy -> outcome mappings from the test records
  const data = useMemo(() => {
    // We'll aggregate counts of tests by (plugin, strategy, outcome)
    const linkCounts: Record<string, Record<string, { pass: number; fail: number }>> = {};

    function processTests(tests: TestWithMetadata[], isPassing: boolean) {
      for (const t of tests) {
        const pluginId = t.result ? getPluginIdFromResult(t.result) : undefined;

        const strategyId = getStrategyIdFromTest(t);

        if (!pluginId || strategyId === 'basic') {
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

    const totalPasses = strategies.reduce((acc, s) => {
      let strategyPasses = 0;
      for (const p of plugins) {
        if (linkCounts[p][s]) {
          strategyPasses += linkCounts[p][s].pass;
        }
      }
      return acc + strategyPasses;
    }, 0);

    const totalFails = strategies.reduce((acc, s) => {
      let strategyFails = 0;
      for (const p of plugins) {
        if (linkCounts[p][s]) {
          strategyFails += linkCounts[p][s].fail;
        }
      }
      return acc + strategyFails;
    }, 0);

    // Build nodes array with labels
    const nodes = [
      // Plugin nodes
      ...plugins.map((p) => {
        const totalTests = Object.values(linkCounts[p]).reduce(
          (acc, curr) => acc + curr.pass + curr.fail,
          0,
        );
        const totalPasses = Object.values(linkCounts[p]).reduce((acc, curr) => acc + curr.pass, 0);
        return {
          name: p,
          displayName: p,
          passRatio: totalTests > 0 ? totalPasses / totalTests : 0,
          value: totalTests,
        };
      }),
      // Strategy nodes
      ...strategies.map((s) => {
        let totalPass = 0;
        let totalTests = 0;
        for (const p of plugins) {
          if (linkCounts[p][s]) {
            totalPass += linkCounts[p][s].pass;
            totalTests += linkCounts[p][s].pass + linkCounts[p][s].fail;
          }
        }
        return {
          name: s,
          displayName: s,
          passRatio: totalTests > 0 ? totalPass / totalTests : 0,
          value: totalTests,
        };
      }),
      // Outcome nodes
      { name: 'Pass', displayName: 'Pass', passRatio: 1, value: totalPasses },
      { name: 'Fail', displayName: 'Fail', passRatio: 0, value: totalFails },
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
      <div className="mt-4 text-center">
        <p className="text-muted-foreground">No data available to display the strategy flow.</p>
      </div>
    );
  }

  return (
    <div className="h-[400px] w-full">
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
              const data = payload[0];
              const { source, target, value } = data;
              return (
                <div className="rounded border border-border bg-card px-3 py-2 text-sm shadow-sm">
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
