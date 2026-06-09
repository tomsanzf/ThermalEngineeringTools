import React, { useEffect, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import { Config, Scenario } from '../types';
import { buildSankeyData, computeAlignedX, resolveNodeColor, interpolateRgb } from '../lib/sankeyUtils';

interface SankeyDiagramProps {
  scenario: Scenario;
  config: Config;
  onNodeDrag?: (positions: Record<string, { x: number; y: number }>) => void;
  animating: boolean;
  animSpeed: number;
  onRenderedPositions?: (positions: Record<string, { x: number; y: number }>) => void;
  onRenderedPPU?: (ppu: number) => void;
  preserveInputOrder?: boolean;
}

export const SankeyDiagram: React.FC<SankeyDiagramProps> = ({
  scenario,
  config,
  onNodeDrag,
  animating,
  animSpeed,
  onRenderedPositions,
  onRenderedPPU,
  preserveInputOrder
}) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<any>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  
  const [dimensions, setDimensions] = useState<{width: number, height: number} | null>(null);

  // Measure container initially and on resize
  useEffect(() => {
    if (!outerRef.current) return;
    
    const updateDims = (width: number, height: number) => {
      if (width < 10 || height < 10) return;
      setDimensions(prev => (!prev || prev.width !== width || prev.height !== height) ? {width, height} : prev);
    };

    const rect = outerRef.current.getBoundingClientRect();
    updateDims(rect.width, rect.height);

    const ro = new ResizeObserver(entries => {
      for (let entry of entries) {
        updateDims(entry.contentRect.width, entry.contentRect.height);
      }
    });

    ro.observe(outerRef.current);
    observerRef.current = ro;

    return () => ro.disconnect();
  }, []);

  let wrapperStyle: React.CSSProperties = { width: '100%', height: '100%' };
  let currentHeight = dimensions?.height || config.figHeight;

  if (dimensions && config.aspectRatio && config.aspectRatio !== 'fit') {
    let ratio = 16 / 9;
    if (config.aspectRatio === '4:3') ratio = 4 / 3;
    if (config.aspectRatio === '1:1') ratio = 1;
    if (config.aspectRatio === 'custom') ratio = config.figWidth / (config.figHeight || 1);

    const containerRatio = dimensions.width / dimensions.height;
    if (containerRatio > ratio) {
      wrapperStyle = { height: '100%', width: dimensions.height * ratio };
      currentHeight = dimensions.height;
    } else {
      wrapperStyle = { width: '100%', height: dimensions.width / ratio };
      currentHeight = dimensions.width / ratio;
    }
  }

  // Trigger Plotly resize when bounds change
  useEffect(() => {
    if (plotRef.current) {
      Plotly.Plots.resize(plotRef.current);
    }
  }, [dimensions, config.aspectRatio]);

  useEffect(() => {
    if (!containerRef.current) return;

    const { labels, src, tgt, val, linkColors } = buildSankeyData(scenario.flows, config);

    if (!labels.length) {
      if (plotRef.current) Plotly.purge(containerRef.current);
      return;
    }

    const nodeIn = new Array(labels.length).fill(0);
    const nodeOut = new Array(labels.length).fill(0);
    for (let i = 0; i < src.length; i++) {
      nodeOut[src[i]] += val[i];
      nodeIn[tgt[i]] += val[i];
    }

    const displayLabels = labels.map((l, i) => {
      const total = Math.round(Math.max(nodeIn[i], nodeOut[i]));
      return l ? `${l}<br>${total.toLocaleString('en').replace(/,/g, '\u2009')} ${config.valueUnit}` : '';
    });

    const resolvedDefault = resolveNodeColor(config.defaultNodeColor, '#808080');
    const nodeColors = labels.map(l => {
      if (!l) return 'rgba(0,0,0,0)';
      const raw = scenario.nodeColorOverrides[l];
      return (raw !== undefined && raw !== '') ? resolveNodeColor(raw, resolvedDefault) : resolvedDefault;
    });

    let nodeX: number[] | undefined, nodeY: number[] | undefined;
    if (scenario.hasDraggedNodes && Object.keys(scenario.nodePositions).length > 0) {
      const parsedX = labels.map(l => l ? scenario.nodePositions[l]?.x : undefined).filter(x => x !== undefined) as number[];
      const sortedX = parsedX.sort((a,b) => a-b);
      let safeX = 0;
      let found = false;
      for (let i = 0; i < sortedX.length - 1; i++) {
        if (sortedX[i+1] - sortedX[i] > 0.05) {
          safeX = sortedX[i] + 0.025;
          found = true;
          break;
        }
      }
      if (!found) safeX = (sortedX[sortedX.length - 1] || 0) + 0.05;
      if (safeX > 1) safeX = -0.5; // push completely out of bounds left
      
      const xs = labels.map((l, i) => l ? scenario.nodePositions[l]?.x : (i === labels.length - 2 ? safeX : safeX + 0.001));
      const ys = labels.map((l, i) => l ? scenario.nodePositions[l]?.y : 0.5);
      if (xs.every(x => x != null)) {
        nodeX = xs as number[];
        nodeY = ys as number[];
      }
    }

    if (!nodeX && config.nodeAlignment !== 'justify') {
      nodeX = computeAlignedX(src, tgt, val, labels, config.nodeAlignment);
    }

    const nodeMeta = labels.map((l, i) => [l || 'Phantom', nodeIn[i], nodeOut[i]]);
    const linkMeta = src.map((s, i) => [labels[s] || 'Phantom', labels[tgt[i]] || 'Phantom', val[i]]);

    // Calculate scaling factor from base height of 800
    const BASE_HEIGHT = 800;
    const scaleFactor = currentHeight / BASE_HEIGHT;
    
    // Scale config values proportionally
    const scaledNodeSpacing = (scenario.nodeSpacing ?? config.nodeSpacing) * scaleFactor;
    const scaledNodeThickness = config.nodeThickness * scaleFactor;
    const scaledLabelSize = config.labelSize * scaleFactor;
    const scaledVMargin = config.vMargin * scaleFactor;
    const scaledHMargin = config.hMargin * scaleFactor;

    const nodeSpec: any = {
      pad: scaledNodeSpacing,
      thickness: scaledNodeThickness,
      label: displayLabels,
      align: config.nodeAlignment,
      color: nodeColors,
      line: { color: config.bgColor, width: 1 },
      customdata: nodeMeta,
      hovertemplate: '<b>%{customdata[0]}</b><br>Input: %{customdata[1]:.0f}<br>Output: %{customdata[2]:.0f}<extra></extra>',
    };

    if (nodeX && nodeY) {
      nodeSpec.x = nodeX;
      nodeSpec.y = nodeY;
    } else if (nodeX) {
      nodeSpec.x = nodeX;
      nodeSpec.y = null;
    } else {
      nodeSpec.x = null;
      nodeSpec.y = null;
    }

    const sankeyTrace: any = {
      type: 'sankey',
      orientation: config.orientation,
      arrangement: preserveInputOrder ? 'freeform' : config.nodeArrangement,
      textfont: { color: config.labelColor, size: Math.max(8, scaledLabelSize) },
      node: nodeSpec,
      link: {
        source: src,
        target: tgt,
        value: val,
        color: linkColors,
        arrowlen: config.arrowSize,
        customdata: linkMeta,
        hovertemplate: '<b>%{customdata[0]}</b> → <b>%{customdata[1]}</b><br>Flow: %{customdata[2]:.0f} ' + config.valueUnit + '<extra></extra>',
      },
    };

    // Build gradient bar
    const N = 20;
    const { highVal, lowVal, midVal, hotHighCol, hotLowCol, coldHighCol, coldLowCol } = config;
    const range = highVal - lowVal;
    const barColors = [];
    for (let i = 0; i < N; i++) {
      const v2 = highVal - (i + 0.5) * (range / N);
      let c = v2 >= midVal
        ? interpolateRgb(v2, midVal, highVal, hotLowCol, hotHighCol, 1.0)
        : interpolateRgb(v2, lowVal, midVal, coldLowCol, coldHighCol, 1.0);
      barColors.push(c.replace(/,\s*[\d.]+\)$/, ')').replace('rgba', 'rgb'));
    }
    const midTick = N * (midVal - lowVal) / (range || 1);
    const barTraces = barColors.map((color, i) => ({
      type: 'bar', x: [''], y: [1], base: N - i - 1,
      marker: { color, line: { width: 0 } },
      showlegend: false, hoverinfo: 'skip',
    }));

    const barW = 0.015;
    // For width properties, using config.figWidth for horizontal proportion logic,
    // though the actual container width will dictate the real aspect
    const gapFrac = config.gradGap / config.figWidth;
    const rightMarginFrac = 50 / config.figWidth;
    const loopbackPaddingFrac = 60 / config.figWidth;
    const sankeyEnd = 1 - gapFrac - barW - rightMarginFrac - loopbackPaddingFrac;
    const barStart = 1 - barW - rightMarginFrac;
    const barEnd = barStart + barW;

    // Use full vertical domain bounds
    sankeyTrace.domain = { x: [0, Math.max(0.5, sankeyEnd - 0.005)], y: [0, 1] };

    const layout: any = {
      // Use autosize and omit width/height explicitly so Plotly uses container
      autosize: true,
      paper_bgcolor: config.bgColor,
      plot_bgcolor: config.bgColor,
      barmode: 'stack',
      bargap: 0,
      margin: { l: scaledHMargin, r: 40, t: Math.max(10, scaledVMargin), b: Math.max(10, scaledVMargin) },
      xaxis: { visible: false, domain: [barStart, Math.min(barEnd, 0.999)] },
      yaxis: {
        tickvals: [0, midTick, N],
        ticktext: [String(Math.round(lowVal)), String(Math.round(midVal)), String(Math.round(highVal))],
        tickfont: { color: config.labelColor, size: Math.max(8, scaledLabelSize - 2) },
        side: 'right',
        showgrid: false,
        zeroline: false,
        range: [0, N],
        tickmode: 'array',
        showline: false,
        title: { text: config.gradUnit, font: { color: config.labelColor, size: Math.max(8, scaledLabelSize - 2) }, standoff: 4 },
      },
    };

    Plotly.react(containerRef.current, [sankeyTrace, ...barTraces], layout, {
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['toImage'],
      responsive: true,
    }).then((gd: any) => {
      plotRef.current = gd;
      
      // Call resize organically just in case flex layout shifted
      if (gd && gd.layout) {
        Plotly.Plots.resize(gd);
      }
      
      const fullData = gd._fullData?.[0];
      const nodeData = fullData?.node;
      let maxFlowActualPPU = 0;

      if (onRenderedPPU) {
        // Method A: Check dy on node object
        if (nodeData && nodeData.dy && nodeData.dy.length > 0) {
          let maxFlow = 0;
          for (let i = 0; i < nodeData.dy.length; i++) {
            const flow = Math.max(nodeIn[i], nodeOut[i]);
            const dy = nodeData.dy[i];
            if (flow > 0 && dy > 0) {
               const ppu = dy / flow;
               if (flow > maxFlow) {
                 maxFlow = flow;
                 maxFlowActualPPU = ppu;
               }
            }
          }
        } 
        // Method B: Check internal _sankey graph nodes
        else if (fullData?._sankey?.graph?.nodes?.length) {
          let maxFlow = 0;
          const nodes = fullData._sankey.graph.nodes;
          for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (!n || n.value === undefined) continue;
            const flow = n.value;
            const dy = n.dy || (n.y1 - n.y0);
            if (flow > 0 && dy > 0) {
               const ppu = dy / flow;
               if (flow > maxFlow) {
                 maxFlow = flow;
                 maxFlowActualPPU = ppu;
               }
            }
          }
        }

        if (maxFlowActualPPU > 0) {
           onRenderedPPU(maxFlowActualPPU);
        }
      }

      if (onRenderedPositions && nodeData) {
        const xs = gd._fullData[0].node.x;
        const ys = gd._fullData[0].node.y;
        if (xs && ys) {
           const positions: Record<string, { x: number; y: number }> = {};
           labels.forEach((l, i) => {
             if (l && xs[i] != null && ys[i] != null) {
               positions[l] = { x: xs[i], y: ys[i] };
             }
           });
           onRenderedPositions(positions);
        }
      }

      gd.on('plotly_restyle', (data: any) => {
        if (!data?.[0]) return;
        const changes = data[0];
        const xs = changes['node.x']?.[0];
        const ys = changes['node.y']?.[0];
        if (!xs || !ys || !onNodeDrag) return;
        const positions: Record<string, { x: number; y: number }> = {};
        labels.forEach((l, i) => {
          if (xs[i] != null && ys[i] != null) {
            positions[l] = { x: xs[i], y: ys[i] };
          }
        });
        onNodeDrag(positions);
      });

      if (animating) applyFlowAnimation(gd, animSpeed);
    });

  }, [scenario, config, animating, animSpeed, currentHeight, onRenderedPPU]);

  const applyFlowAnimation = (gd: any, speed: number) => {
    // Clear old animations
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll('#sl-anim-style, .sl-anim-overlay, #sl-anim-defs').forEach(e => e.remove());

    const paths = Array.from(container.querySelectorAll('.sankey .links path')) as SVGPathElement[];
    if (!paths.length) return;

    const svgNS = 'http://www.w3.org/2000/svg';
    const style = document.createElement('style');
    style.id = 'sl-anim-style';
    style.textContent = `
      @keyframes sl-shimmer {
        0%   { opacity: 0; }
        40%  { opacity: 0; }
        50%  { opacity: 1; }
        60%  { opacity: 0; }
        100% { opacity: 0; }
      }
      .sl-anim-overlay {
        animation: sl-shimmer ${speed}s linear infinite;
        pointer-events: none;
      }
    `;
    container.appendChild(style);

    const targetSvg = paths[0].ownerSVGElement;
    if (!targetSvg) return;

    const defs = document.createElementNS(svgNS, 'defs');
    defs.id = 'sl-anim-defs';
    
    paths.forEach((path, idx) => {
      let bbox;
      try { bbox = path.getBBox(); } catch (e) { return; }
      if (!bbox || bbox.width < 4) return;

      const gid = `sl-g-${idx}`;
      const grad = document.createElementNS(svgNS, 'linearGradient');
      grad.id = gid;
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('x1', String(bbox.x - bbox.width));
      grad.setAttribute('x2', String(bbox.x));
      grad.setAttribute('y1', String(bbox.y + bbox.height / 2));
      grad.setAttribute('y2', String(bbox.y + bbox.height / 2));

      [['0%', '0'], ['40%', '0'], ['50%', '0.5'], ['60%', '0'], ['100%', '0']].forEach(([off, op]) => {
        const s = document.createElementNS(svgNS, 'stop');
        s.setAttribute('offset', off);
        s.setAttribute('stop-color', '#ffffff');
        s.setAttribute('stop-opacity', op);
        grad.appendChild(s);
      });

      const ax1 = document.createElementNS(svgNS, 'animate');
      ax1.setAttribute('attributeName', 'x1');
      ax1.setAttribute('values', `${bbox.x - bbox.width};${bbox.x + bbox.width}`);
      ax1.setAttribute('dur', `${speed}s`);
      ax1.setAttribute('repeatCount', 'indefinite');
      ax1.setAttribute('begin', `${((idx / paths.length) * speed).toFixed(2)}s`);
      grad.appendChild(ax1);

      const ax2 = document.createElementNS(svgNS, 'animate');
      ax2.setAttribute('attributeName', 'x2');
      ax2.setAttribute('values', `${bbox.x};${bbox.x + bbox.width * 2}`);
      ax2.setAttribute('dur', `${speed}s`);
      ax2.setAttribute('repeatCount', 'indefinite');
      ax2.setAttribute('begin', `${((idx / paths.length) * speed).toFixed(2)}s`);
      grad.appendChild(ax2);

      defs.appendChild(grad);

      const overlay = path.cloneNode(false) as SVGPathElement;
      overlay.setAttribute('fill', `url(#${gid})`);
      overlay.removeAttribute('stroke');
      overlay.classList.add('sl-anim-overlay');
      path.parentNode?.insertBefore(overlay, path.nextSibling);
    });

    targetSvg.insertBefore(defs, targetSvg.firstChild);
  };

  return (
    <div className="w-full h-full flex justify-center items-center" ref={outerRef}>
      <div className="relative" ref={wrapperRef} style={wrapperStyle}>
        <div className="absolute inset-0" ref={containerRef} />
      </div>
    </div>
  );
};

