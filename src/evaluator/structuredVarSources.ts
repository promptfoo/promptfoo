// The reader persists a graph of authored containers. A true edge denotes an
// already-loaded field, a numeric edge points to another container in the graph.
type Sources = Record<string, unknown>;
type SourceLayer = { vars?: unknown; metadata?: Record<string, unknown> };

const structuredVarSources = Symbol('structuredVarSources');
type MarkedVars = Record<string, unknown> & { [structuredVarSources]?: Sources };

export function getStructuredVarSources(test?: SourceLayer): Sources | undefined {
  const internal = test?.metadata?.__promptfoo;
  if (!internal || typeof internal !== 'object') {
    return undefined;
  }
  const sources: unknown = Object.getOwnPropertyDescriptor(internal, 'structuredVarSources')?.value;
  return sources && typeof sources === 'object' && !Array.isArray(sources)
    ? (sources as Sources)
    : undefined;
}

// Ordinary strategy spreads retain this symbol. It adds no prompt variable or JSON field.
export function materializedSources(vars: MarkedVars | undefined) {
  return vars?.[structuredVarSources];
}

// A string array expands by index. Resolve the selected source slot separately
// for each row, even when an authored URI equals one returned as data.
export function markVarCombination(
  row: MarkedVars,
  previous: MarkedVars,
  key: string,
  source: unknown,
  index?: number,
) {
  let selected = source;
  if (index !== undefined && Array.isArray(source) && Array.isArray(source[0])) {
    const child = source[0].find(
      (edge: unknown) => Array.isArray(edge) && edge[0] === String(index),
    )?.[1];
    selected = child === true ? true : undefined;
    if (Number.isInteger(child) && Array.isArray(source[child])) {
      selected = { nodes: source, rootIndex: child };
    }
  }
  const next = { ...materializedSources(previous) };
  if (selected !== undefined) {
    Object.defineProperty(next, key, { value: selected, enumerable: true });
  }
  markStructuredVarSources(row, next);
}

export function markStructuredVarSources(vars: MarkedVars, sources?: Sources) {
  if (sources) {
    Object.defineProperty(vars, structuredVarSources, {
      value: sources,
      enumerable: true,
      configurable: true,
    });
  }
}

export function structuredVarSlots(vars: MarkedVars) {
  const slots = new WeakMap<object, Set<string>>();
  function mark(parent: object, key: string) {
    const keys = slots.get(parent) ?? new Set<string>();
    keys.add(key);
    slots.set(parent, keys);
  }
  for (const [root, graph] of Object.entries(vars[structuredVarSources] ?? {})) {
    if (graph === true) {
      mark(vars, root);
      continue;
    }
    const nodes = Array.isArray(graph)
      ? graph
      : graph && Object.getOwnPropertyDescriptor(graph, 'nodes')?.value;
    const index = Array.isArray(graph)
      ? 0
      : graph && Object.getOwnPropertyDescriptor(graph, 'rootIndex')?.value;
    if (Array.isArray(nodes) && Number.isInteger(index) && index >= 0 && index < nodes.length) {
      markDescendantSlots(vars, root, nodes, index, mark);
    }
  }
  return slots;
}

function markDescendantSlots(
  vars: MarkedVars,
  root: string,
  graph: unknown[],
  rootIndex: number,
  mark: (parent: object, key: string) => void,
) {
  const pending: [unknown, number][] = [
    [Object.getOwnPropertyDescriptor(vars, root)?.value, rootIndex],
  ];
  const seen = new WeakMap<object, Set<number>>();
  while (pending.length) {
    const [parent, index] = pending.pop()!;
    if (!parent || typeof parent !== 'object' || seen.get(parent)?.has(index)) {
      continue;
    }
    const indexes = seen.get(parent) ?? new Set<number>();
    indexes.add(index);
    seen.set(parent, indexes);
    const edges = graph[index];
    if (!Array.isArray(edges)) {
      continue;
    }
    for (const edge of edges) {
      if (!Array.isArray(edge) || typeof edge[0] !== 'string') {
        continue;
      }
      const [key, source] = edge;
      if (source === true) {
        mark(parent, key);
      } else if (Number.isInteger(source) && source >= 0 && source < graph.length) {
        pending.push([Object.getOwnPropertyDescriptor(parent, key)?.value, source]);
      }
    }
  }
}

export function mergeStructuredVarSources(...layers: (SourceLayer | undefined)[]) {
  if (!layers.some(getStructuredVarSources)) {
    return {};
  }
  const sources = new Map<string, unknown>();
  for (const layer of layers) {
    for (const key of Object.keys(layer?.vars ?? {})) {
      sources.delete(key);
    }
    for (const [key, source] of Object.entries(getStructuredVarSources(layer) ?? {})) {
      sources.set(key, source);
    }
  }
  return {
    __promptfoo: {
      ...Object.assign({}, ...layers.map((layer) => layer?.metadata?.__promptfoo)),
      structuredVarSources: Object.fromEntries(sources),
    },
  };
}
