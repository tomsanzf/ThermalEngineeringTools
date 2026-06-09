import { Config, Flow } from '../types';
import { NAMED_COLORS } from '../constants';

export function hexToRgb(hex: string) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function interpolateRgb(v: number, minV: number, maxV: number, col1: string, col2: string, opacity: number) {
  if (maxV === minV) {
    const [r, g, b] = hexToRgb(col1);
    return `rgba(${r},${g},${b},${opacity})`;
  }
  const f = Math.max(0, Math.min(1, (v - minV) / (maxV - minV)));
  const [r1, g1, b1] = hexToRgb(col1);
  const [r2, g2, b2] = hexToRgb(col2);
  return `rgba(${Math.round(r1 + (r2 - r1) * f)},${Math.round(g1 + (g2 - g1) * f)},${Math.round(b1 + (b2 - b1) * f)},${opacity})`;
}

export function getLinkColor(colorVal: string | number, cfg: Config, opacityOverride?: number) {
  const opacity = opacityOverride !== undefined ? opacityOverride : cfg.linkOpacity;
  if (!colorVal && colorVal !== 0) return `rgba(150,150,150,${opacity})`;
  const s = String(colorVal).trim().toLowerCase();
  if (s === 'elec') return `rgba(0,200,0,${opacity})`;
  if (s === 'black') return `rgba(0,0,0,${opacity})`;
  if (s.startsWith('#')) {
    try {
      const [r, g, b] = hexToRgb(s);
      return `rgba(${r},${g},${b},${opacity})`;
    } catch {
      return `rgba(150,150,150,${opacity})`;
    }
  }
  const v = parseFloat(s);
  if (isNaN(v)) return `rgba(150,150,150,${opacity})`;
  const { highVal, midVal, lowVal, hotHighCol, hotLowCol, coldHighCol, coldLowCol } = cfg;
  if (v >= midVal) return interpolateRgb(v, midVal, highVal, hotLowCol, hotHighCol, opacity);
  return interpolateRgb(v, lowVal, midVal, coldLowCol, coldHighCol, opacity);
}

export function resolveNodeColor(s: string | undefined, fallback: string) {
  if (!s) return fallback;
  const low = s.trim().toLowerCase();
  if (low.startsWith('#') && (low.length === 4 || low.length === 7)) return s.trim().toUpperCase();
  return NAMED_COLORS[low] || fallback;
}

export function buildSankeyData(flows: Flow[], cfg: Config) {
  const labels: string[] = [],
    l2i: Record<string, number> = {},
    src: number[] = [],
    tgt: number[] = [],
    val: number[] = [],
    linkColors: string[] = [],
    isGhost: boolean[] = [],
    warnings: string[] = [];

  flows.forEach(row => {
    let source = String(row.Source || '').trim();
    let target = String(row.Target || '').trim();
    if (!source || !target) return;
    const parsed = parseFloat(String(row.Value || '').replace(',', '.'));
    if (isNaN(parsed)) {
      warnings.push(`⚠️ Cannot parse value "${row.Value}" for ${source} → ${target}`);
      return;
    }
    let v2 = parsed;
    if (v2 < 0) {
      [source, target, v2] = [target, source, Math.abs(v2)];
    }
    const ghost = (v2 === 0);
    for (const n of [source, target]) {
      if (!(n in l2i)) {
        l2i[n] = labels.length;
        labels.push(n);
      }
    }
    src.push(l2i[source]);
    tgt.push(l2i[target]);
    val.push(ghost ? 0.001 : v2);
    isGhost.push(ghost);
    linkColors.push(getLinkColor(row.Color, cfg, ghost ? cfg.ghostOpacity : undefined));
  });

  return { labels, src, tgt, val, linkColors, isGhost, warnings };
}

export function computeSankeyMetrics(scenario: { flows: Flow[], hasDraggedNodes?: boolean, nodePositions?: any, nodeSpacing?: number }, cfg: Config) {
  const pad = scenario.nodeSpacing ?? cfg.nodeSpacing;
  const { src, tgt, val, labels } = buildSankeyData(scenario.flows, cfg);
  if (!labels.length) return { ppu: Infinity, cols: {} as Record<string, { n: number; v: number }>, pad, availableHeight: cfg.figHeight - 2 * cfg.vMargin };

  const nodeIn = new Array(labels.length).fill(0);
  const nodeOut = new Array(labels.length).fill(0);
  for (let i = 0; i < src.length; i++) {
    nodeOut[src[i]] += val[i];
    nodeIn[tgt[i]] += val[i];
  }
  const nodeValues = labels.map((_, i) => Math.max(nodeIn[i], nodeOut[i]));

  let nodeX: number[] | undefined;
  if (scenario.hasDraggedNodes && scenario.nodePositions && Object.keys(scenario.nodePositions).length > 0) {
    const xs = labels.map(l => scenario.nodePositions[l]?.x);
    if (xs.every(x => x != null)) nodeX = xs as number[];
  }
  if (!nodeX && cfg.nodeAlignment !== 'justify') {
    nodeX = computeAlignedX(src, tgt, val, labels, cfg.nodeAlignment);
  }
  if (!nodeX) {
    nodeX = computeAlignedX(src, tgt, val, labels, 'justify');
  }

  const cols: Record<string, { n: number; v: number, nx: number }> = {};
  nodeX.forEach((nx, i) => {
    const k = nx.toFixed(2);
    if (!cols[k]) cols[k] = { n: 0, v: 0, nx };
    cols[k].n += 1;
    cols[k].v += nodeValues[i];
  });

  // Account for backward links (recirculation overhead)
  for (let i = 0; i < src.length; i++) {
    const sX = nodeX[src[i]];
    const tX = nodeX[tgt[i]];
    if (tX <= sX) {
      Object.values(cols).forEach(col => {
        if (col.nx >= tX - 0.001 && col.nx <= sX + 0.001) {
          col.v += val[i];
        }
      });
    }
  }

  const availableHeight = cfg.figHeight - 2 * cfg.vMargin;

  let minPPU = Infinity;
  Object.values(cols).forEach(col => {
    if (col.n === 0) return;
    const ppu = Math.max(0, availableHeight - pad * (col.n - 1)) / (col.v || 1e-5);
    if (ppu < minPPU) minPPU = ppu;
  });

  return { ppu: minPPU, cols, pad, availableHeight };
}

export function getExportDimensions(config: Config) {
  if (config.aspectRatio === 'custom' || config.aspectRatio === 'fit') {
    return { width: config.figWidth, height: config.figHeight };
  }
  let ratio = 16 / 9;
  if (config.aspectRatio === '4:3') ratio = 4 / 3;
  if (config.aspectRatio === '1:1') ratio = 1;
  return { width: config.figWidth, height: Math.round(config.figWidth / ratio) };
}

export function computeAlignedX(src: number[], tgt: number[], val: number[], labels: string[], alignment: string) {
  const N = labels.length;
  const minDepth = new Array(N).fill(Infinity);
  const maxDepth = new Array(N).fill(-Infinity);

  const outEdges: number[][] = Array.from({ length: N }, () => []);
  const inEdges: number[][] = Array.from({ length: N }, () => []);
  src.forEach((s, i) => {
    outEdges[s].push(tgt[i]);
    inEdges[tgt[i]].push(s);
  });

  const sources = labels.map((_, i) => i).filter(i => inEdges[i].length === 0);
  
  // FORWARD PASS (minDepth)
  // Fix: Use a queue that also tracks the path to detect cycles
  const queue = sources.map(s => ({ node: s, path: new Set([s]) }));
  sources.forEach(s => {
    minDepth[s] = 0;
  });

  // Handle case where all nodes are in a loop (no sources)
  if (queue.length === 0 && N > 0) {
    queue.push({ node: 0, path: new Set([0]) });
    minDepth[0] = 0;
  }

  while (queue.length) {
    const { node: cur, path } = queue.shift()!;
    outEdges[cur].forEach(next => {
      // Prevent infinite loops by checking if 'next' is already in the current path
      if (!path.has(next) && minDepth[cur] + 1 < minDepth[next]) {
        minDepth[next] = minDepth[cur] + 1;
        const newPath = new Set(path);
        newPath.add(next);
        queue.push({ node: next, path: newPath });
      }
    });
  }
  for (let i = 0; i < N; i++) if (minDepth[i] === Infinity) minDepth[i] = 0;

  const sinks = labels.map((_, i) => i).filter(i => outEdges[i].length === 0);
  const maxD = Math.max(...minDepth);
  if (maxD === 0) return labels.map(() => 0.5);

  // BACKWARD PASS (maxDepth)
  // Fix: Add cycle detection here too
  sinks.forEach(s => {
    maxDepth[s] = maxD;
  });
  const queue2 = sinks.map(s => ({ node: s, path: new Set([s]) }));
  
   // Handle case where all nodes are in a loop (no sinks)
  if (queue2.length === 0 && N > 0) {
     const lastNode = minDepth.indexOf(maxD);
     queue2.push({ node: lastNode, path: new Set([lastNode]) });
     maxDepth[lastNode] = maxD;
  }

  while (queue2.length) {
    const { node: cur, path } = queue2.shift()!;
    inEdges[cur].forEach(prev => {
      // Prevent infinite loops backward
      if (!path.has(prev) && maxDepth[cur] - 1 > maxDepth[prev]) {
        maxDepth[prev] = maxDepth[cur] - 1;
        const newPath = new Set(path);
        newPath.add(prev);
        queue2.push({ node: prev, path: newPath });
      }
    });
  }
  for (let i = 0; i < N; i++) if (maxDepth[i] === -Infinity) maxDepth[i] = maxD;

  const cols = alignment === 'left' ? minDepth
    : alignment === 'right' ? maxDepth
      : alignment === 'center' ? labels.map((_, i) => Math.round((minDepth[i] + maxDepth[i]) / 2))
        : minDepth;

  const colMax = Math.max(...cols, 1);
  return cols.map(c => 0.01 + (c / colMax) * 0.95);
}

export function computePreservedPositions(scenario: { flows: Flow[], hasDraggedNodes?: boolean, nodePositions?: any, nativePositions?: any, nodeSpacing?: number }, config: Config): Record<string, { x: number; y: number }> {
  const { flows } = scenario;
  const { labels, src, tgt, val } = buildSankeyData(flows, config);
  if (!labels.length) return {};

  // 1. Derive input order of unique nodes
  const orderedNodes: string[] = [];
  flows.forEach(flow => {
    const source = String(flow.Source || '').trim();
    const target = String(flow.Target || '').trim();
    if (source && !orderedNodes.includes(source)) {
      orderedNodes.push(source);
    }
    if (target && !orderedNodes.includes(target)) {
      orderedNodes.push(target);
    }
  });

  // 2. Determine x positions (columns)
  let nodeX: number[] | undefined;
  if (scenario.hasDraggedNodes && scenario.nodePositions && Object.keys(scenario.nodePositions).length > 0) {
    const xs = labels.map(l => scenario.nodePositions[l]?.x);
    if (xs.every(x => x != null)) nodeX = xs as number[];
  }
  if (!nodeX && scenario.nativePositions && Object.keys(scenario.nativePositions).length > 0) {
    const xs = labels.map(l => scenario.nativePositions[l]?.x);
    if (xs.every(x => x != null)) nodeX = xs as number[];
  }

  // Fall back to cycle-safe longest-path layering (topological columns) to prevent clumping
  if (!nodeX) {
    const N = labels.length;
    const outEdges: number[][] = Array.from({ length: N }, () => []);
    const inEdges: number[][] = Array.from({ length: N }, () => []);
    src.forEach((s, i) => {
      outEdges[s].push(tgt[i]);
      inEdges[tgt[i]].push(s);
    });

    const sources = labels.map((_, i) => i).filter(i => inEdges[i].length === 0);
    const longestDepth = new Array(N).fill(0);
    
    const queue = sources.map(s => ({ node: s, path: new Set([s]) }));
    if (queue.length === 0 && N > 0) {
      queue.push({ node: 0, path: new Set([0]) });
    }

    while (queue.length) {
      const { node: cur, path } = queue.shift()!;
      outEdges[cur].forEach(next => {
        if (!path.has(next) && longestDepth[cur] + 1 > longestDepth[next]) {
          longestDepth[next] = longestDepth[cur] + 1;
          const newPath = new Set(path);
          newPath.add(next);
          queue.push({ node: next, path: newPath });
        }
      });
    }

    const colMax = Math.max(...longestDepth, 1);
    nodeX = longestDepth.map(c => 0.01 + (c / colMax) * 0.95);
  }

  const nodeXMap: Record<string, number> = {};
  labels.forEach((label, idx) => {
    nodeXMap[label] = nodeX![idx];
  });

  // Calculate tie-breaker offsets based on the average index of flows each node is involved in.
  // This helps break vertical layout ties in a way that aligns node heights with their logical connection levels.
  const nodeScores: Record<string, number> = {};
  const nodeCounts: Record<string, number> = {};
  labels.forEach(l => {
    nodeScores[l] = 0;
    nodeCounts[l] = 0;
  });

  flows.forEach((flow, idx) => {
    const source = String(flow.Source || '').trim();
    const target = String(flow.Target || '').trim();
    if (source && target) {
      nodeScores[source] += idx;
      nodeCounts[source] += 1;
      nodeScores[target] += idx;
      nodeCounts[target] += 1;
    }
  });

  const nodeYOffsets: Record<string, number> = {};
  labels.forEach(l => {
    const avg = nodeCounts[l] > 0 ? (nodeScores[l] / nodeCounts[l]) : 0;
    const xVal = nodeXMap[l] || 0;
    const orderIdx = orderedNodes.indexOf(l);
    // Downstream nodes (larger xVal) get placed slightly higher.
    // Index in orderedNodes serves as a final unique tie-breaker.
    nodeYOffsets[l] = avg - xVal * 0.05 + orderIdx * 0.001;
  });

  // 3. Determine scale/PPU using computeSankeyMetrics with corrected columns
  const tempNodePositions: Record<string, { x: number; y: number }> = {};
  labels.forEach((label, idx) => {
    tempNodePositions[label] = { x: nodeX![idx], y: 0.5 };
  });

  const tempScenario = {
    ...scenario,
    hasDraggedNodes: true,
    nodePositions: tempNodePositions
  };

  const { ppu, pad, availableHeight } = computeSankeyMetrics(tempScenario, config);

  // Compute node incoming/outgoing values
  const nodeIn = new Array(labels.length).fill(0);
  const nodeOut = new Array(labels.length).fill(0);
  for (let i = 0; i < src.length; i++) {
    nodeOut[src[i]] += val[i];
    nodeIn[tgt[i]] += val[i];
  }
  const nodeValues: Record<string, number> = {};
  labels.forEach((label, idx) => {
    nodeValues[label] = Math.max(nodeIn[idx], nodeOut[idx]);
  });

  // 4. Group nodes by column (round x to 3 decimals to avoid floating point issues)
  const columns: Record<string, string[]> = {};
  labels.forEach(label => {
    const x = nodeXMap[label];
    const k = x.toFixed(3);
    if (!columns[k]) {
      columns[k] = [];
    }
    columns[k].push(label);
  });

  // Sort nodes in each column according to their first appearance in the flows list to preserve input order
  Object.keys(columns).forEach(colKey => {
    columns[colKey].sort((a, b) => {
      const idxA = orderedNodes.indexOf(a);
      const idxB = orderedNodes.indexOf(b);
      return (idxA === -1 ? 9999 : idxA) - (idxB === -1 ? 9999 : idxB);
    });
  });

  const sortedNodesForTieBreaker = Object.keys(nodeYOffsets).sort((a, b) => nodeYOffsets[a] - nodeYOffsets[b]);
  const numNodes = sortedNodesForTieBreaker.length;

  // 5. Calculate Y centers for each node in each column
  const positions: Record<string, { x: number; y: number }> = {};
  
  Object.keys(columns).forEach(colKey => {
    const colNodes = columns[colKey];
    const n = colNodes.length;
    
    // Sum of heights of all nodes in this column
    let totalNodeHeight = 0;
    colNodes.forEach(node => {
      const val = nodeValues[node] || 0;
      totalNodeHeight += val * ppu;
    });
    
    const totalSpacing = pad * (n - 1);
    const totalColHeight = totalNodeHeight + totalSpacing;
    
    // Starting Y coordinate in pixels from the top domain bound
    const yStart = availableHeight > totalColHeight ? (availableHeight - totalColHeight) / 2 : 0;
    
    let currentTop = yStart;
    colNodes.forEach(node => {
      const val = nodeValues[node] || 0;
      const height = val * ppu;
      const center = currentTop + height / 2;
      
      // Relative center Y coordinate with a tiny tie-breaker offset to dictate link ordering
      const relativeY = availableHeight > 0 ? center / availableHeight : 0.5;
      const rank = sortedNodesForTieBreaker.indexOf(node);
      const tieBreaker = (rank - (numNodes - 1) / 2) * 0.002;
      
      positions[node] = {
        x: nodeXMap[node],
        y: relativeY + tieBreaker
      };
      
      currentTop += height + pad;
    });
  });

  return positions;
}

