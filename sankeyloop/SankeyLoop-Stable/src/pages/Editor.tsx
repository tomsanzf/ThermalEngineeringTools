import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Menu, Save, Upload, Download, RotateCcw, Video, Table as TableIcon, FileText, ChevronRight, Sun, Moon, GripVertical, HelpCircle } from 'lucide-react';
import { Config, Scenario, Flow } from '../types';
import { DEFAULT_FLOWS } from '../constants';
import { SankeyDiagram } from '../components/SankeyDiagram';
import { cn } from '../lib/utils';
import { GuidedSetup } from '../components/GuidedSetup';
import { buildSankeyData, computeAlignedX, resolveNodeColor, interpolateRgb, getExportDimensions, computeSankeyMetrics, computePreservedPositions } from '../lib/sankeyUtils';
import Plotly from 'plotly.js-dist-min';
import * as gifenc from 'gifenc';

const INITIAL_CONFIG: Config = {
  orientation: 'h',
  highVal: 180,
  hotHighCol: '#FF0000',
  hotLowCol: '#FFFF00',
  midVal: 45,
  coldHighCol: '#0000FF',
  coldLowCol: '#800080',
  lowVal: 0,
  nodeAlignment: 'center',
  nodeArrangement: 'snap',
  vMargin: 100,
  hMargin: 50,
  nodeSpacing: 50,
  nodeThickness: 10,
  linkOpacity: 0.7,
  ghostOpacity: 0.12,
  arrowSize: 15,
  labelSize: 13,
  labelColor: '#1e293b',
  defaultNodeColor: '#808080',
  figWidth: 1200,
  figHeight: 800,
  valueUnit: 'kW',
  gradUnit: '°C',
  gradGap: 20,
  aspectRatio: 'fit',
  theme: 'dark',
  bgColor: '#ffffff',
};

const INITIAL_SCENARIOS = {
  before: {
    flows: [
      { Source: "Gas", Target: "Boiler", Value: "217", Color: "Black" },
      { Source: "Boiler", Target: "Steam", Value: "186", Color: "200" },
      { Source: "Boiler", Target: "Purge", Value: "1", Color: "170" },
      { Source: "Boiler", Target: "Stack", Value: "30", Color: "Black" },
      { Source: "Steam", Target: "Deaerator", Value: "17", Color: "200" },
      { Source: "Deaerator", Target: "Boiler", Value: "6", Color: "105" },
      { Source: "Feedwater", Target: "Deaerator", Value: "-11", Color: "20" },
      { Source: "Steam", Target: "Process", Value: "167", Color: "200" },
      { Source: "Process", Target: "Condensate Return", Value: "0", Color: "90" },
      { Source: "Process", Target: "Cndnste Not Returned", Value: "0", Color: "Black" },
      { Source: "Condensate Return", Target: "Deaerator", Value: "0", Color: "90" },
      { Source: "Process", Target: "Chilled Water", Value: "60", Color: "20" },
      { Source: "Chilled Water", Target: "Chiller", Value: "60", Color: "10" },
      { Source: "Elec", Target: "Chiller", Value: "20", Color: "Elec" },
      { Source: "Chiller", Target: "Cooling Tower", Value: "80", Color: "30" },
      { Source: "", Target: "", Value: "", Color: "" }
    ],
    nodeColorOverrides: {},
    nodePositions: {
      "Gas": { x: 0.004887346659498558, y: 0.38095962284236945 },
      "Boiler": { x: 0.14759466609279387, y: 0.4038372240387298 },
      "Steam": { x: 0.2883470468622898, y: 0.4660113299368874 },
      "Purge": { x: 0.29225692418988863, y: 0.7612348870808306 },
      "Stack": { x: 0.29225692418988863, y: 0.6703736091045045 },
      "Deaerator": { x: 0.7115816585026772, y: 0.6994790763693511 },
      "Feedwater": { x: 0.8669960792506688, y: 0.7578124097026844 },
      "Process": { x: 0.43594171295508366, y: 0.36483678904831957 },
      "Condensate Return": { x: 0.5933110723668746, y: 0.5853511991513078 },
      "Cndnste Not Returned": { x: 0.5962434803625738, y: 0.510765812742163 },
      "Chilled Water": { x: 0.5913561337030752, y: 0.3022049808662601 },
      "Chiller": { x: 0.7213563518216742, y: 0.30463663963966736 },
      "Elec": { x: 0.5903786643711755, y: 0.4189786102480563 },
      "Cooling Tower": { x: 0.8757933032377662, y: 0.39877527281381264 }
    },
    hasDraggedNodes: true,
    nodeSpacing: 50
  },
  after: {
    flows: [
      { Source: "Gas", Target: "Boiler", Value: "78", Color: "Black" },
      { Source: "Boiler", Target: "Steam", Value: "67", Color: "200" },
      { Source: "Boiler", Target: "Purge", Value: "1", Color: "170" },
      { Source: "Boiler", Target: "Stack", Value: "10", Color: "Black" },
      { Source: "Steam", Target: "Deaerator", Value: "6", Color: "200" },
      { Source: "Deaerator", Target: "Boiler", Value: "2", Color: "105" },
      { Source: "Feedwater", Target: "Deaerator", Value: "-4", Color: "20" },
      { Source: "Steam", Target: "Process", Value: "60", Color: "200" },
      { Source: "Process", Target: "Condensate Return", Value: "0", Color: "90" },
      { Source: "Process", Target: "Cndnste Not Returned", Value: "0", Color: "Black" },
      { Source: "Condensate Return", Target: "Deaerator", Value: "0", Color: "90" },
      { Source: "Process", Target: "Chilled Water", Value: "60", Color: "20" },
      { Source: "Chilled Water", Target: "Chiller", Value: "60", Color: "10" },
      { Source: "Elec", Target: "Chiller", Value: "20", Color: "Elec" },
      { Source: "Chiller", Target: "HP", Value: "80", Color: "30" },
      { Source: "Elec", Target: "HP", Value: "27", Color: "Elec" },
      { Source: "HP", Target: "Process", Value: "107", Color: "90" },
      { Source: "", Target: "", Value: "", Color: "" }
    ],
    nodeColorOverrides: {},
    nodePositions: {
      "Gas": { x: 0.004887346659498558, y: 0.38095962284236945 },
      "Boiler": { x: 0.14759466609279387, y: 0.4038372240387298 },
      "Steam": { x: 0.2883470468622898, y: 0.4660113299368874 },
      "Purge": { x: 0.29225692418988863, y: 0.7612348870808306 },
      "Stack": { x: 0.29225692418988863, y: 0.6703736091045045 },
      "Deaerator": { x: 0.7115816585026772, y: 0.6994790763693511 },
      "Feedwater": { x: 0.8669960792506688, y: 0.7578124097026844 },
      "Process": { x: 0.43594171295508366, y: 0.36483678904831957 },
      "Condensate Return": { x: 0.5933110723668746, y: 0.5853511991513078 },
      "Cndnste Not Returned": { x: 0.5962434803625738, y: 0.510765812742163 },
      "Chilled Water": { x: 0.5913561337030752, y: 0.3022049808662601 },
      "Chiller": { x: 0.7213563518216742, y: 0.30463663963966736 },
      "Elec": { x: 0.5903786643711755, y: 0.4189786102480563 },
      "HP": { x: 0.8669960792506688, y: 0.32544193948047934 }
    },
    hasDraggedNodes: true,
    nodeSpacing: 50
  }
};

export default function Editor() {
  const [config, setConfig] = useState<Config>(INITIAL_CONFIG);
  const [scenarios, setScenarios] = useState<Record<string, Scenario>>(INITIAL_SCENARIOS);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragAllowedIndex, setDragAllowedIndex] = useState<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('sankeyloop_load_example');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.config) setConfig(prev => ({ ...prev, ...data.config }));
        if (data.flows) {
          setScenarios({
            before: { ...INITIAL_SCENARIOS.before, flows: data.flows },
            after: { ...INITIAL_SCENARIOS.after, flows: data.flows },
          });
        }
        if (data.preserveInputOrder !== undefined) {
          setPreserveInputOrder(data.preserveInputOrder);
        }
        localStorage.removeItem('sankeyloop_load_example');
      } catch (e) {
        console.error('Failed to load example', e);
      }
    }
  }, []);
  const [videoEditorEnabled, setVideoEditorEnabled] = useState(false);
  const [preserveInputOrder, setPreserveInputOrder] = useState(false);
  const [activeHelpFeature, setActiveHelpFeature] = useState<'sync' | 'video' | 'pio' | null>(null);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [editScenario, setEditScenario] = useState<string>('before');
  const [viewScenario, setViewScenario] = useState<string>('before');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dataSectionHeight, setDataSectionHeight] = useState(300);
  const [dataSectionOpen, setDataSectionOpen] = useState(true);
  const [inputMode, setInputMode] = useState<'table' | 'text' | 'guided'>('table');
  const [localFlowText, setLocalFlowText] = useState<string | null>(null);

  useEffect(() => {
    setLocalFlowText(null);
  }, [editScenario, inputMode]);

  const [isViewsSynced, setIsViewsSynced] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [animSpeed, setAnimSpeed] = useState(3);
  const [renderedPPUs, setRenderedPPUs] = useState<Record<string, number | null>>({ 
    before: null, 
    '25%': null, 
    '50%': null, 
    '75%': null, 
    after: null 
  });
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    save: true,
    theme: false,
    thermal: false,
    flows: false,
    nodes: false,
    labels: false,
    layout: false,
  });

  const activeScenario = scenarios[viewScenario];
  const editScenarioData = scenarios[editScenario];

  const updateConfig = (updates: Partial<Config>) => setConfig(prev => ({ ...prev, ...updates }));

  const updateScenario = (key: string, updates: Partial<Scenario>) => {
    setScenarios(prev => ({
      ...prev,
      [key]: { ...prev[key], ...updates },
    }));
  };

  const toggleVideoEditor = () => {
    setVideoEditorEnabled(prev => {
      const next = !prev;
      if (!next && ['25%', '50%', '75%'].includes(viewScenario)) {
        setViewScenario('before');
      }
      if (next) {
        setScenarios(curr => {
          const intermediateKeys = ['25%', '50%', '75%'];
          const nextScenarios = { ...curr };
          
          intermediateKeys.forEach(key => {
            const t = parseInt(key) / 100;
            const bFlows = curr.before.flows;
            const aFlows = curr.after.flows;
            
            const getFlowKey = (f: Flow) => `${String(f.Source).trim()}||${String(f.Target).trim()}`;
            const aMap = new Map(aFlows.map(f => [getFlowKey(f), f]));
            
            const newFlows = bFlows.map(fB => {
              const fA = aMap.get(getFlowKey(fB)) as Flow | undefined;
              const vB = parseFloat(String(fB.Value).replace(',', '.')) || 0;
              const vA = fA ? (parseFloat(String(fA.Value).replace(',', '.')) || 0) : 0;
              const v = vB + (vA - vB) * t;
              return { ...fB, Value: v.toFixed(2), Color: t < 0.5 ? fB.Color : (fA?.Color || fB.Color) };
            });

            // Interpolate node spacing
            const nB = curr.before.nodeSpacing ?? config.nodeSpacing;
            const nA = curr.after.nodeSpacing ?? config.nodeSpacing;
            const n = nB + (nA - nB) * t;

            // Interpolate positions if available
            let newPositions = { ...curr.before.nodePositions };
            if (curr.after.hasDraggedNodes && curr.before.hasDraggedNodes) {
              Object.keys(curr.before.nodePositions).forEach(nodeName => {
                const pB = curr.before.nodePositions[nodeName];
                const pA = curr.after.nodePositions[nodeName];
                if (pB && pA) {
                  newPositions[nodeName] = {
                    x: pB.x + (pA.x - pB.x) * t,
                    y: pB.y + (pA.y - pB.y) * t
                  };
                }
              });
            }

            nextScenarios[key] = {
              flows: newFlows,
              nodeColorOverrides: { ...curr.before.nodeColorOverrides },
              nodePositions: newPositions,
              hasDraggedNodes: curr.before.hasDraggedNodes || curr.after.hasDraggedNodes,
              nodeSpacing: n
            };
          });
          return nextScenarios;
        });
      }
      return next;
    });
  };

  const handleNodeDrag = (positions: Record<string, { x: number; y: number }>) => {
    if (isViewsSynced) {
      setScenarios(prev => ({
        ...prev,
        before: { ...prev.before, nodePositions: positions, hasDraggedNodes: true },
        after: { ...prev.after, nodePositions: positions, hasDraggedNodes: true },
      }));
    } else {
      updateScenario(viewScenario, {
        nodePositions: positions,
        hasDraggedNodes: true,
      });
    }
  };

  const toggleSyncViews = () => {
    setIsViewsSynced(prev => {
      const next = !prev;
      if (!next) {
        setTimeout(() => {
          setVideoEditorEnabled(false);
          setViewScenario(curr => ['25%', '50%', '75%'].includes(curr) ? 'before' : curr);
        }, 0);
      }
      if (next) {
        setScenarios(curr => {
          const bFlows = [...curr.before.flows];
          const aFlows = [...curr.after.flows];

          const getFlowKey = (f: Flow) => `${String(f.Source).trim()}||${String(f.Target).trim()}`;
          
          const bMap = new Map(bFlows.map(f => [getFlowKey(f), f]));
          const aMap = new Map(aFlows.map(f => [getFlowKey(f), f]));

          bFlows.forEach(bf => {
            if (!aMap.has(getFlowKey(bf))) {
              aFlows.push({ ...bf, Value: '1e-9' });
            }
          });

          aFlows.forEach(af => {
            if (!bMap.has(getFlowKey(af))) {
              bFlows.push({ ...af, Value: '1e-9' });
            }
          });

          const currentScenario = viewScenario === 'before' ? curr.before : curr.after;

          return {
            before: { 
              ...curr.before, 
              flows: bFlows,
              nodePositions: { ...currentScenario.nodePositions },
              hasDraggedNodes: currentScenario.hasDraggedNodes
            },
            after: { 
              ...curr.after, 
              flows: aFlows,
              nodePositions: { ...currentScenario.nodePositions },
              hasDraggedNodes: currentScenario.hasDraggedNodes
            }
          };
        });
      }
      return next;
    });
  };

  const handleDataSectionResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = dataSectionHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      // When dragging the bottom handle down, delta is positive, so we INCREASE the height.
      const newHeight = Math.max(80, Math.min(window.innerHeight * 0.75, startHeight + delta));
      setDataSectionHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [dataSectionHeight]);

  const resetLayout = () => {
    if (isViewsSynced) {
      setScenarios(prev => ({
        ...prev,
        before: { ...prev.before, nodePositions: {}, hasDraggedNodes: false },
        after: { ...prev.after, nodePositions: {}, hasDraggedNodes: false },
      }));
    } else {
      updateScenario(viewScenario, {
        nodePositions: {},
        hasDraggedNodes: false,
      });
    }
  };

  const toggleSection = (id: string) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.config) setConfig({ ...INITIAL_CONFIG, ...data.config });
        if (data.scenarios) setScenarios(data.scenarios);
        else if (data.flows) {
           setScenarios({
            before: { ...INITIAL_SCENARIOS.before, flows: data.flows },
            after: { ...INITIAL_SCENARIOS.after, flows: data.flows },
          });
        }
        if (data.preserveInputOrder !== undefined) {
          setPreserveInputOrder(data.preserveInputOrder);
        }
      } catch (err) {
        alert('Failed to import config');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExport = () => {
    const data = { config, scenarios, preserveInputOrder };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sankeyloop_config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportImage = async (format: 'png' | 'svg') => {
    const plotEl = document.querySelector('.js-plotly-plot') as any;
    if (!plotEl) return;
    try {
      const dims = getExportDimensions(config);
      await Plotly.downloadImage(plotEl, {
        format,
        filename: 'sankeyloop',
        width: dims.width,
        height: dims.height,
      });
    } catch (err) {
      console.error('Export failed:', err);
    }
  };
  const openDonationPopup = () => {
    const width = 500;
    const height = 650;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    window.open(
      'https://revolut.me/tsanzdesantamaria',
      'RevolutDonation',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );
  };

  const [exportingVideo, setExportingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [gifPreviewUrl, setGifPreviewUrl] = useState<string | null>(null);
  
  type VideoDebugInfo = {
    frame: number;
    ppu_n: number;
    np_n: number;
    x: number;
    target: number;
    np_corrected: number;
    ppu_after: number;
  };
  const [videoDebugInfo, setVideoDebugInfo] = useState<VideoDebugInfo[]>([]);

  const exportTransitionVideo = async () => {
    try {
      setExportingVideo(true);
      setVideoProgress(0);

      const plotEl = document.querySelector('.js-plotly-plot') as any;
      if (!plotEl) {
        alert('No diagram found. Make sure a scenario is visible before exporting.');
        setExportingVideo(false);
        return;
      }

      const fps = 15;
      const duration = animSpeed || 3;
      const pauseDuration = 0.5;
      const nFramesBody = duration * fps;
      const nFramesPause = Math.round(pauseDuration * fps);
      const nFrames = nFramesBody + 2 * nFramesPause;
      const delayMs = Math.round(1000 / fps);

      const dims = getExportDimensions(config);
      const canvas = document.createElement('canvas');
      canvas.width = dims.width;
      canvas.height = dims.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Could not get canvas context');

      // GIF setup
      const GIFEncoderFn = gifenc.GIFEncoder || gifenc.default || ((gifenc as any).default?.GIFEncoder);
      if (!GIFEncoderFn) throw new Error('GIFEncoder not found');
      const gif = GIFEncoderFn();

      // Anchors: 0%, 25%, 50%, 75%, 100%
      const anchorKeys = ['before', '25%', '50%', '75%', 'after'];
      const anchors = anchorKeys.map(k => scenarios[k]);

      for (let i = 0; i < nFrames; i++) {
        let t_total = 0;
        if (i < nFramesPause) t_total = 0;
        else if (i >= nFramesPause + nFramesBody) t_total = 1;
        else t_total = (i - nFramesPause) / (nFramesBody > 1 ? nFramesBody - 1 : 1);

        const segmentIdx = Math.min(3, Math.floor(t_total * 3.99));
        const localT = (t_total * 4) - segmentIdx;
        
        const sStart = anchors[segmentIdx];
        const sEnd = anchors[segmentIdx + 1];
        
        const getFlowKey = (f: Flow) => `${String(f.Source).trim()}||${String(f.Target).trim()}`;
        const endMap = new Map(sEnd.flows.map(f => [getFlowKey(f), f]));
        
        const interpolatedFlows = sStart.flows.map(fB => {
          const fA = endMap.get(getFlowKey(fB)) as Flow | undefined;
          const vB = parseFloat(String(fB.Value).replace(',', '.')) || 0;
          const vA = fA ? (parseFloat(String(fA.Value).replace(',', '.')) || 0) : 0;
          const v = vB + (vA - vB) * localT;
          return {
            ...fB,
            Value: v.toFixed(4),
            Color: localT < 0.5 ? fB.Color : (fA?.Color || fB.Color)
          };
        });

        const startMap = new Map(sStart.flows.map(f => [getFlowKey(f), f]));
        sEnd.flows.forEach(fA => {
          if (!startMap.has(getFlowKey(fA))) {
             const vA = parseFloat(String(fA.Value).replace(',', '.')) || 0;
             interpolatedFlows.push({ ...fA, Value: (vA * localT).toFixed(4) });
          }
        });

        const currentSpacing_start = sStart.nodeSpacing ?? config.nodeSpacing;
        const currentSpacing_end = sEnd.nodeSpacing ?? config.nodeSpacing;
        const currentSpacing = currentSpacing_start + (currentSpacing_end - currentSpacing_start) * localT;

        const { labels, src, tgt, val, linkColors } = buildSankeyData(interpolatedFlows, config);
        
        const nodeIn = new Array(labels.length).fill(0);
        const nodeOut = new Array(labels.length).fill(0);
        for (let j = 0; j < src.length; j++) {
          nodeOut[src[j]] += val[j];
          nodeIn[tgt[j]] += val[j];
        }

        const displayLabels = labels.map((l, idx) => {
          const total = Math.round(Math.max(nodeIn[idx], nodeOut[idx]));
          return l ? `${l}<br>${total.toLocaleString('en').replace(/,/g, '\u2009')} ${config.valueUnit}` : '';
        });

        const resolvedDefault = resolveNodeColor(config.defaultNodeColor, '#808080');
        const nodeColors = labels.map(l => {
          if (!l) return 'rgba(0,0,0,0)';
          const overrideS = sStart.nodeColorOverrides[l];
          const overrideE = sEnd.nodeColorOverrides[l];
          const override = localT < 0.5 ? (overrideS || overrideE) : (overrideE || overrideS);
          return override ? resolveNodeColor(override, resolvedDefault) : resolvedDefault;
        });

        const posS = preserveInputOrder 
          ? computePreservedPositions(sStart, config)
          : (sStart.hasDraggedNodes ? sStart.nodePositions : (sStart.nativePositions || sStart.nodePositions));
        const posE = preserveInputOrder 
          ? computePreservedPositions(sEnd, config)
          : (sEnd.hasDraggedNodes ? sEnd.nodePositions : (sEnd.nativePositions || sEnd.nodePositions));

        const xPos = labels.map(l => {
          const pS = posS[l];
          const pE = posE[l];
          if (pS && pE) return pS.x + (pE.x - pS.x) * localT;
          if (pS) return pS.x;
          if (pE) return pE.x;
          return null; // fallback to auto layout if not found
        });
        const yPos = labels.map(l => {
          const pS = posS[l];
          const pE = posE[l];
          if (pS && pE) return pS.y + (pE.y - pS.y) * localT;
          if (pS) return pS.y;
          if (pE) return pE.y;
          return null;
        });

        // Direct mathematical mapping for the export size
        const scaleFactor = dims.height / 800;

        const scaledNodeSpacing = currentSpacing * scaleFactor;
        const scaledNodeThickness = config.nodeThickness * scaleFactor;
        const scaledLabelSize = config.labelSize * scaleFactor;
        const scaledVMargin = config.vMargin * scaleFactor;
        const scaledHMargin = config.hMargin * scaleFactor;

        const nodeMeta = labels.map((l, idx) => [l || 'Phantom', nodeIn[idx], nodeOut[idx]]);
        
        const nodeSpec: any = {
          pad: scaledNodeSpacing,
          thickness: scaledNodeThickness,
          label: displayLabels,
          align: config.nodeAlignment,
          color: nodeColors,
          line: { color: config.bgColor, width: 1 },
          customdata: nodeMeta,
        };
        
        if (xPos.every(x => x !== null)) {
          nodeSpec.x = xPos;
          nodeSpec.y = yPos;
        } else if (config.nodeAlignment !== 'justify') {
           const computedX = computeAlignedX(src, tgt, val, labels, config.nodeAlignment);
           nodeSpec.x = computedX;
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
            color: linkColors.map(c => c.replace(/[\d.]+\)$/, `${config.linkOpacity})`)),
            arrowlen: config.arrowSize
          },
        };

        const N = 20;
        const { highVal, lowVal, midVal, hotHighCol, hotLowCol, coldHighCol, coldLowCol } = config;
        const rangeStr = highVal - lowVal;
        const barColors = [];
        for (let j = 0; j < N; j++) {
          const v2 = highVal - (j + 0.5) * (rangeStr / N);
          let c = v2 >= midVal
            ? interpolateRgb(v2, midVal, highVal, hotLowCol, hotHighCol, 1.0)
            : interpolateRgb(v2, lowVal, midVal, coldLowCol, coldHighCol, 1.0);
          barColors.push(c.replace(/,\s*[\d.]+\)$/, ')').replace('rgba', 'rgb'));
        }
        const midTick = N * (midVal - lowVal) / (rangeStr || 1);
        const barTraces = barColors.map((color, j) => ({
          type: 'bar', x: [''], y: [1], base: N - j - 1,
          marker: { color, line: { width: 0 } },
          showlegend: false, hoverinfo: 'skip',
        }));

        const barW = 0.015;
        const gapFrac = config.gradGap / config.figWidth;
        const rightMarginFrac = 50 / config.figWidth;
        const loopbackPaddingFrac = 60 / config.figWidth;
        const sankeyEnd = 1 - gapFrac - barW - rightMarginFrac - loopbackPaddingFrac;
        const barStart = 1 - barW - rightMarginFrac;
        const barEnd = barStart + barW;

        sankeyTrace.domain = { x: [0, Math.max(0.5, sankeyEnd - 0.005)], y: [0, 1] };

        const layout: any = {
          width: dims.width,
          height: dims.height,
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
            side: 'right', showgrid: false, zeroline: false, range: [0, N],
            tickmode: 'array', showline: false,
            title: { text: config.gradUnit, font: { color: config.labelColor, size: Math.max(8, scaledLabelSize - 2) }, standoff: 4 },
          },
        };

        const imgData = await Plotly.toImage({
          data: [sankeyTrace, ...barTraces],
          layout: layout
        }, { format: 'png', width: dims.width, height: dims.height });
        
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
             ctx.fillStyle = config.bgColor || '#ffffff';
             ctx.fillRect(0, 0, dims.width, dims.height);
             ctx.drawImage(img, 0, 0);
             const pixels = ctx.getImageData(0, 0, dims.width, dims.height).data;
             const quantizeFn = gifenc.quantize || (gifenc as any).default?.quantize;
             const applyPaletteFn = gifenc.applyPalette || (gifenc as any).default?.applyPalette;
             const palette = quantizeFn(pixels, 256, { format: 'rgb565' });
             const index = applyPaletteFn(pixels, palette);
             gif.writeFrame(index, dims.width, dims.height, { palette, delay: delayMs });
             resolve();
          };
          img.src = imgData;
        });

        setVideoProgress(Math.round(((i + 1) / nFrames) * 90));

        // Yield to the browser to prevent UI freezing and ensure progress text updates
        await new Promise(r => setTimeout(r, 0));
      }
      gif.finish();
      const buffer = gif.bytes();
      const blob = new Blob([buffer], { type: 'image/gif' });
      setGifPreviewUrl(URL.createObjectURL(blob));
      setVideoProgress(100);
      setExportingVideo(false);
    } catch (err) {
      console.error('Video generation failed:', err);
      alert('Video generation failed: ' + err);
      setExportingVideo(false);
    } finally {
      setConfig(prev => ({ ...prev }));
      setExportingVideo(false);
    }
  };

  const handleFlowChange = (index: number, field: keyof Flow, value: string) => {
    const newFlows = [...editScenarioData.flows];
    newFlows[index] = { ...newFlows[index], [field]: value };
    
    // Ensure trailing empty row
    if (index === newFlows.length - 1 && value.trim() !== '') {
      newFlows.push({ Source: '', Target: '', Value: '', Color: '' });
    }

    updateScenario(editScenario, { flows: newFlows });
  };

  const deleteFlow = (index: number) => {
    const newFlows = [...editScenarioData.flows];
    newFlows.splice(index, 1);
    if (newFlows.length === 0) newFlows.push({ Source: '', Target: '', Value: '', Color: '' });
    updateScenario(editScenario, { flows: newFlows });
  };

  const handleDragStart = (index: number, e: React.DragEvent) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const lastIndex = editScenarioData.flows.length - 1;
    if (index === lastIndex || draggedIndex === lastIndex) return;

    const newFlows = [...editScenarioData.flows];
    const draggedRow = newFlows[draggedIndex];
    newFlows.splice(draggedIndex, 1);
    newFlows.splice(index, 0, draggedRow);

    updateScenario(editScenario, { flows: newFlows });
    setDraggedIndex(index);
    setDragAllowedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragAllowedIndex(null);
  };

  const clearAllFlows = () => {
    updateScenario(editScenario, {
      flows: [{ Source: '', Target: '', Value: '', Color: '' }],
      nodeColorOverrides: {},
    });
  };

  const handleTablePaste = (e: React.ClipboardEvent<HTMLInputElement>, startRow: number, startField: keyof Flow) => {
    const pasteData = e.clipboardData.getData('text');
    if (!pasteData || (!pasteData.includes('\t') && !pasteData.includes('\n'))) {
      return;
    }
    e.preventDefault();
    const rows = pasteData.split(/\r?\n/).filter(line => line.trim() !== '');
    const newFlows = [...editScenarioData.flows];
    
    const colKeys: (keyof Flow)[] = ['Source', 'Target', 'Value', 'Color'];
    const startColIdx = colKeys.indexOf(startField);

    let currentRow = startRow;
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].split('\t');
      if (!newFlows[currentRow]) {
        newFlows[currentRow] = { Source: '', Target: '', Value: '', Color: '' };
      }
      let cellIdx = 0;
      for (let c = startColIdx; c < colKeys.length && cellIdx < cells.length; c++) {
        newFlows[currentRow][colKeys[c]] = cells[cellIdx].trim();
        cellIdx++;
      }
      currentRow++;
    }

    if (newFlows.length > 0 && (newFlows[newFlows.length - 1].Source.trim() !== '' || newFlows[newFlows.length - 1].Target.trim() !== '')) {
      newFlows.push({ Source: '', Target: '', Value: '', Color: '' });
    }

    updateScenario(editScenario, { flows: newFlows });
  };

  const { labels } = useMemo(() => buildSankeyData(activeScenario.flows, config), [activeScenario.flows, config]);

  return (
    <div className="flex h-screen overflow-hidden text-[13px] leading-relaxed transition-colors duration-200 bg-[var(--bg)] text-[var(--text)]" data-theme={config.theme}>
      {/* Sidebar */}
      <aside className={cn(
        "flex flex-col bg-[var(--surface)] border-r border-[var(--border)] transition-all duration-300 z-10 overflow-hidden",
        sidebarOpen ? "w-[300px] min-w-[300px]" : "w-0 min-w-0"
      )}>
        <div className="flex items-center gap-2 p-3 pl-4 border-b border-[var(--border)] shrink-0">
          <a href="/" className="flex-1 text-base font-semibold tracking-tight no-underline text-white hover:text-[var(--accent)]">
            Sankey<span className="text-[var(--accent)]">Loop</span>
          </a>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="flex items-center justify-center w-7 h-7 border border-[var(--border)] rounded-[var(--radius)] text-[var(--text3)] transition-colors hover:border-[var(--text2)] hover:text-[var(--text)]"
          >
            <Menu size={15} />
          </button>
        </div>

        <div className="flex-1 px-0 py-2 overflow-x-hidden overflow-y-auto scrollbar-thin">
          {/* Section: Save / Load */}
          <div className="border-b border-[var(--border)]">
            <div 
              className="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer select-none text-[var(--text2)] text-[12px] font-medium tracking-wider uppercase hover:bg-[var(--surface2)] hover:text-[var(--text)]"
              onClick={() => toggleSection('save')}
            >
              <span>💾</span> Save / Load
              <ChevronRight size={10} className={cn("ml-auto transition-transform opacity-50", openSections.save && "rotate-90")} />
            </div>
            {openSections.save && (
              <div className="section-body">
                <div className="flex flex-wrap gap-2">
                  <input type="file" id="import-json" className="hidden" accept=".json" onChange={handleImport} />
                  <button className="btn" onClick={() => document.getElementById('import-json')?.click()}>
                    <Download size={14} /> Import JSON
                  </button>
                  <button className="btn btn-primary" onClick={handleExport}>
                    <Upload size={14} /> Export JSON
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section: Theme */}
          <div className="border-b border-[var(--border)]">
            <div 
              className="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer select-none text-[var(--text2)] text-[12px] font-medium tracking-wider uppercase hover:bg-[var(--surface2)] hover:text-[var(--text)]"
              onClick={() => toggleSection('theme')}
            >
              <span>🎨</span> Theme
              <ChevronRight size={10} className={cn("ml-auto transition-transform opacity-50", openSections.theme && "rotate-90")} />
            </div>
            {openSections.theme && (
              <div className="section-body">
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">UI Theme</label>
                  <div className="flex gap-1.5 radio-group">
                    <button 
                      className={cn("radio-btn", config.theme === 'light' && "active")}
                      onClick={() => updateConfig({ theme: 'light' })}
                    >
                      <Sun size={12} className="inline mr-1" /> Light
                    </button>
                    <button 
                      className={cn("radio-btn", config.theme === 'dark' && "active")}
                      onClick={() => updateConfig({ theme: 'dark' })}
                    >
                      <Moon size={12} className="inline mr-1" /> Dark
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">Diagram Background</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="color" 
                      value={config.bgColor} 
                      onChange={(e) => updateConfig({ bgColor: e.target.value })}
                      className="w-9 h-7 p-0.5 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--surface2)] cursor-pointer"
                    />
                    <input 
                      type="text" 
                      value={config.bgColor} 
                      onChange={(e) => updateConfig({ bgColor: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">Flow Orientation</label>
                  <div className="flex gap-1.5 radio-group">
                    <button 
                      className={cn("radio-btn", config.orientation === 'h' && "active")}
                      onClick={() => updateConfig({ orientation: 'h' })}
                    >
                      Horizontal
                    </button>
                    <button 
                      className={cn("radio-btn", config.orientation === 'v' && "active")}
                      onClick={() => updateConfig({ orientation: 'v' })}
                    >
                      Vertical
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-0.5">
                  <label className="text-[11px] font-medium text-[var(--text2)] cursor-pointer" htmlFor="flow-anim">Animate flows</label>
                  <label className="relative inline-flex cursor-pointer toggle-switch">
                    <input 
                      type="checkbox" 
                      id="flow-anim"
                      checked={animating}
                      onChange={(e) => setAnimating(e.target.checked)}
                      className="absolute w-0 h-0 opacity-0"
                    />
                    <span className={cn("w-[34px] h-[20px] rounded-[10px] transition-colors relative block", animating ? "bg-[var(--accent)]" : "bg-[var(--border)]")}>
                      <span className={cn("absolute top-[3px] left-[3px] w-[14px] h-[14px] bg-white rounded-full transition-transform shadow-sm", animating && "translate-x-[14px]")} />
                    </span>
                  </label>
                </div>
                {animating && (
                  <div>
                    <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">
                      Speed <span className="float-right font-mono text-[11px] text-[var(--text2)]">{animSpeed}s</span>
                    </label>
                    <input 
                      type="range" 
                      min="1" max="8" step="0.5" 
                      value={animSpeed} 
                      onChange={(e) => setAnimSpeed(parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section: Thermal Gradient */}
          <div className="border-b border-[var(--border)]">
            <div 
              className="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer select-none text-[var(--text2)] text-[12px] font-medium tracking-wider uppercase hover:bg-[var(--surface2)] hover:text-[var(--text)]"
              onClick={() => toggleSection('thermal')}
            >
              <span>🔥</span> Thermal Gradient
              <ChevronRight size={10} className={cn("ml-auto transition-transform opacity-50", openSections.thermal && "rotate-90")} />
            </div>
            {openSections.thermal && (
              <div className="section-body">
                <div 
                  className="h-3 mb-2 border border-[var(--border)] rounded-sm"
                  style={{
                    background: `linear-gradient(to right, ${config.coldLowCol}, ${config.coldHighCol}, ${config.hotLowCol}, ${config.hotHighCol})`
                  }}
                />
                
                <div className="grid grid-cols-2 gap-x-2.5 gap-y-3 items-center">
                  {/* Row 1: High | Hot High */}
                  <div>
                    <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">High</label>
                    <input type="number" value={config.highVal} onChange={e => updateConfig({ highVal: parseInt(e.target.value) || 0 })} className="w-full" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">Hot High</label>
                    <div className="flex gap-1">
                      <input type="color" value={config.hotHighCol} onChange={e => updateConfig({ hotHighCol: e.target.value })} className="w-8 h-7 p-0.5" />
                      <input type="text" value={config.hotHighCol} onChange={e => updateConfig({ hotHighCol: e.target.value })} className="flex-1 min-w-0 px-1 text-[10px]" />
                    </div>
                  </div>

                  {/* Row 2: Switch | Hot Low */}
                  <div>
                    <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">Switch</label>
                    <input type="number" value={config.midVal} onChange={e => updateConfig({ midVal: parseInt(e.target.value) || 0 })} className="w-full" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">Hot Low</label>
                    <div className="flex gap-1">
                      <input type="color" value={config.hotLowCol} onChange={e => updateConfig({ hotLowCol: e.target.value })} className="w-8 h-7 p-0.5" />
                      <input type="text" value={config.hotLowCol} onChange={e => updateConfig({ hotLowCol: e.target.value })} className="flex-1 min-w-0 px-1 text-[10px]" />
                    </div>
                  </div>

                  {/* Row 3: Spacer | Cold High */}
                  <div />
                  <div>
                    <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">Cold High</label>
                    <div className="flex gap-1">
                      <input type="color" value={config.coldHighCol} onChange={e => updateConfig({ coldHighCol: e.target.value })} className="w-8 h-7 p-0.5" />
                      <input type="text" value={config.coldHighCol} onChange={e => updateConfig({ coldHighCol: e.target.value })} className="flex-1 min-w-0 px-1 text-[10px]" />
                    </div>
                  </div>

                  {/* Row 4: Low | Cold Low */}
                  <div>
                    <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">Low</label>
                    <input type="number" value={config.lowVal} onChange={e => updateConfig({ lowVal: parseInt(e.target.value) || 0 })} className="w-full" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">Cold Low</label>
                    <div className="flex gap-1">
                      <input type="color" value={config.coldLowCol} onChange={e => updateConfig({ coldLowCol: e.target.value })} className="w-8 h-7 p-0.5" />
                      <input type="text" value={config.coldLowCol} onChange={e => updateConfig({ coldLowCol: e.target.value })} className="flex-1 min-w-0 px-1 text-[10px]" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">Gradient Unit</label>
                  <input type="text" value={config.gradUnit} onChange={e => updateConfig({ gradUnit: e.target.value })} className="w-20" />
                </div>
              </div>
            )}
          </div>

          {/* Section: Flows */}
          <div className="border-b border-[var(--border)]">
            <div 
              className="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer select-none text-[var(--text2)] text-[12px] font-medium tracking-wider uppercase hover:bg-[var(--surface2)] hover:text-[var(--text)]"
              onClick={() => toggleSection('flows')}
            >
              <span>🌊</span> Flows
              <ChevronRight size={10} className={cn("ml-auto transition-transform opacity-50", openSections.flows && "rotate-90")} />
            </div>
            {openSections.flows && (
              <div className="section-body">
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">
                    Opacity <span className="float-right font-mono">{config.linkOpacity.toFixed(2)}</span>
                  </label>
                  <input type="range" min="0.05" max="1" step="0.05" value={config.linkOpacity} onChange={e => updateConfig({ linkOpacity: parseFloat(e.target.value) })} className="w-full" />
                </div>
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">
                    Arrowhead <span className="float-right font-mono">{config.arrowSize}</span>
                  </label>
                  <input type="range" min="0" max="50" value={config.arrowSize} onChange={e => updateConfig({ arrowSize: parseInt(e.target.value) })} className="w-full" />
                </div>
              </div>
            )}
          </div>

          {/* Section: Nodes */}
          <div className="border-b border-[var(--border)]">
            <div 
              className="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer select-none text-[var(--text2)] text-[12px] font-medium tracking-wider uppercase hover:bg-[var(--surface2)] hover:text-[var(--text)]"
              onClick={() => toggleSection('nodes')}
            >
              <span>🟣</span> Nodes
              <ChevronRight size={10} className={cn("ml-auto transition-transform opacity-50", openSections.nodes && "rotate-90")} />
            </div>
            {openSections.nodes && (
              <div className="section-body">
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">
                    Node Width <span className="float-right font-mono">{config.nodeThickness}</span>
                  </label>
                  <input type="range" min="5" max="50" value={config.nodeThickness} onChange={e => updateConfig({ nodeThickness: parseInt(e.target.value) })} className="w-full" />
                </div>
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">Default Color</label>
                  <input type="color" value={config.defaultNodeColor} onChange={e => updateConfig({ defaultNodeColor: e.target.value })} className="w-full h-7" />
                </div>
                <div className="mt-2 data-table-wrap max-h-[300px] border border-[var(--border)] rounded-[var(--radius)] overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[var(--surface2)] sticky top-0">
                        <th className="p-1.5 text-left font-medium text-[var(--text2)]">Node</th>
                        <th className="p-1.5 text-left font-medium text-[var(--text2)]">Color</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labels.map(l => (
                        <tr key={l} className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg)]">
                          <td className="p-1.5 truncate max-w-[100px]" title={l}>{l}</td>
                          <td className="p-1.5">
                            <div className="flex gap-1.5 items-center">
                              <input 
                                type="color"
                                value={
                                  (() => {
                                    /* Handle hex value for color picker */
                                    const val = editScenarioData.nodeColorOverrides[l];
                                    if (val) {
                                      // Only pass 6-char hex to color picker for compatibility
                                      if (/^#[0-9A-Fa-f]{6}$/.test(val)) return val;
                                      
                                      // Some basic conversion for named colors could go here, 
                                      // but color pickers just need a valid hex. Defaulting to black if not hex.
                                    }
                                    return '#000000';
                                  })()
                                }
                                onChange={e => {
                                  const overrides = { ...editScenarioData.nodeColorOverrides, [l]: e.target.value };
                                  updateScenario(editScenario, { nodeColorOverrides: overrides });
                                }}
                                className="w-5 h-5 p-0 border-0 cursor-pointer overflow-hidden rounded bg-transparent flex-shrink-0"
                                style={{ WebkitAppearance: 'none' }}
                              />
                              <input 
                                type="text" 
                                value={editScenarioData.nodeColorOverrides[l] || ''} 
                                placeholder={config.defaultNodeColor}
                                onChange={e => {
                                  const overrides = { ...editScenarioData.nodeColorOverrides, [l]: e.target.value };
                                  updateScenario(editScenario, { nodeColorOverrides: overrides });
                                }}
                                className="w-full p-1 bg-transparent border border-transparent focus:border-[var(--border)] focus:bg-[var(--surface)] transition-all rounded outline-none"
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Section: Labels */}
          <div className="border-b border-[var(--border)]">
            <div 
              className="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer select-none text-[var(--text2)] text-[12px] font-medium tracking-wider uppercase hover:bg-[var(--surface2)] hover:text-[var(--text)]"
              onClick={() => toggleSection('labels')}
            >
              <span>🖋️</span> Labels
              <ChevronRight size={10} className={cn("ml-auto transition-transform opacity-50", openSections.labels && "rotate-90")} />
            </div>
            {openSections.labels && (
              <div className="section-body">
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">Value Unit</label>
                  <input type="text" value={config.valueUnit} onChange={e => updateConfig({ valueUnit: e.target.value })} className="w-full" />
                </div>
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">
                    Font Size <span className="float-right font-mono">{config.labelSize}</span>
                  </label>
                  <input type="range" min="8" max="30" value={config.labelSize} onChange={e => updateConfig({ labelSize: parseInt(e.target.value) })} className="w-full" />
                </div>
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">
                    Font Color
                  </label>
                  <div className="flex gap-2">
                    <input type="color" value={config.labelColor} onChange={e => updateConfig({ labelColor: e.target.value })} className="w-9 h-7 p-0.5 border border-[var(--border)] rounded-[var(--radius)]" />
                    <input type="text" value={config.labelColor} onChange={e => updateConfig({ labelColor: e.target.value })} className="flex-1" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section: Layout */}
          <div className="border-b border-[var(--border)]">
            <div 
              className="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer select-none text-[var(--text2)] text-[12px] font-medium tracking-wider uppercase hover:bg-[var(--surface2)] hover:text-[var(--text)]"
              onClick={() => toggleSection('layout')}
            >
              <span>📐</span> Layout
              <ChevronRight size={10} className={cn("ml-auto transition-transform opacity-50", openSections.layout && "rotate-90")} />
            </div>
            {openSections.layout && (
              <div className="section-body">
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">
                    Spacing <span className="float-right font-mono">{activeScenario.nodeSpacing ?? config.nodeSpacing}</span>
                  </label>
                  <input type="range" min="0" max="200" value={activeScenario.nodeSpacing ?? config.nodeSpacing} onChange={e => {
                    const val = parseInt(e.target.value);
                    setScenarios(prev => ({
                      ...prev,
                      [viewScenario]: { ...prev[viewScenario], nodeSpacing: val }
                    }));
                  }} className="w-full" />
                </div>
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">Aspect Ratio</label>
                  <select 
                    value={config.aspectRatio || 'fit'} 
                    onChange={(e) => updateConfig({ aspectRatio: e.target.value as any })}
                    className="w-full text-[11px] px-2 py-1 rounded bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    <option value="fit">Fit to Space</option>
                    <option value="16:9">16:9</option>
                    <option value="4:3">4:3</option>
                    <option value="1:1">1:1</option>
                    <option value="custom">Custom (uses width/height)</option>
                  </select>
                </div>
                
                {config.aspectRatio === 'custom' && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9.5px] mb-1 font-medium text-[var(--text3)] uppercase">Width (px)</label>
                      <input 
                        type="number" 
                        value={config.figWidth} 
                        onChange={(e) => updateConfig({ figWidth: Number(e.target.value) })}
                        className="w-full bg-[var(--surface)] p-1 text-[11px] rounded border border-[var(--border)] text-[var(--text)]"
                      />
                    </div>
                    <div>
                      <button 
                              onClick={clearAllFlows}
                              className="px-1.5 py-0.5 border border-red-500 rounded text-[10px] font-semibold text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                            >
                              Clear
                            </button>

                      <label className="block text-[9.5px] mb-1 font-medium text-[var(--text3)] uppercase">Height (px)</label>
                      <input 
                        type="number" 
                        value={config.figHeight} 
                        onChange={(e) => updateConfig({ figHeight: Number(e.target.value) })}
                        className="w-full bg-[var(--surface)] p-1 text-[11px] rounded border border-[var(--border)] text-[var(--text)]"
                      />
                    </div>
                  </div>
                )}

                <div className={config.aspectRatio === 'custom' ? "mt-4" : ""}>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">Node Alignment</label>
                  <div className="flex gap-1 radio-group">
                    {['justify', 'left', 'center', 'right'].map((align) => (
                      <button 
                        key={align}
                        className={cn("radio-btn", config.nodeAlignment === align && "active")}
                        onClick={() => updateConfig({ nodeAlignment: align as any })}
                      >
                        {align.charAt(0).toUpperCase() + align.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block mb-1 text-[11px] font-medium text-[var(--text2)]">Arrangement</label>
                  <select 
                    value={config.nodeArrangement} 
                    onChange={e => updateConfig({ nodeArrangement: e.target.value as any })}
                    className="w-full"
                  >
                    <option value="snap">Snap</option>
                    <option value="perpendicular">Perpendicular</option>
                    <option value="freeform">Freeform</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative flex flex-col flex-1 min-w-0 overflow-hidden">
        {!sidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(true)}
            className="fixed top-0 left-0 flex flex-col items-center justify-center w-11 h-11 border border-l-0 border-[var(--border)] bg-[var(--surface)] z-20 rounded-br-[var(--radius)] text-[var(--text3)] shadow-md transition-colors hover:text-[var(--text)] hover:bg-[var(--surface2)]"
          >
            <Menu size={16} />
          </button>
        )}

        {/* Data Section */}
        <div 
          className="flex flex-col flex-shrink-0 overflow-hidden bg-[var(--surface)] text-[var(--text)] border-b border-[var(--border)]"
          style={{ height: dataSectionOpen ? dataSectionHeight : 40 }}
        >
          <div 
            className="flex items-center gap-2 p-2 px-4 border-b border-[var(--border)] bg-[var(--surface2)] cursor-pointer shrink-0 transition-colors hover:bg-[var(--border)]"
            onClick={() => setDataSectionOpen(!dataSectionOpen)}
          >
            <ChevronRight size={10} className={cn("text-[var(--text3)] transition-transform", dataSectionOpen && "rotate-90")} />
            <span className="text-base">📊</span>
            <span className="text-[12px] font-semibold tracking-wider text-[var(--text2)] uppercase">Flow Data</span>
            
            <div className="flex ml-auto gap-0 border border-[var(--border)] rounded-[var(--radius)] overflow-hidden" onClick={e => e.stopPropagation()}>
              <button 
                className={cn("px-3.5 py-1 text-[11.5px] font-medium transition-all", inputMode === 'table' ? "bg-[var(--accent)] text-white" : "bg-[var(--surface2)] text-[var(--text2)] hover:text-[var(--text)]")}
                onClick={() => setInputMode('table')}
              >
                Table
              </button>
              <button 
                className={cn("px-3.5 py-1 text-[11.5px] font-medium border-l border-[var(--border)] transition-all", inputMode === 'text' ? "bg-[var(--accent)] text-white" : "bg-[var(--surface2)] text-[var(--text2)] hover:text-[var(--text)]")}
                onClick={() => setInputMode('text')}
              >
                Text
              </button>
              <button 
                className={cn("px-3.5 py-1 text-[11.5px] font-medium border-l border-[var(--border)] transition-all", inputMode === 'guided' ? "bg-[var(--accent)] text-white" : "bg-[var(--surface2)] text-[var(--text2)] hover:text-[var(--text)]")}
                onClick={() => setInputMode('guided')}
              >
                Guided
              </button>
            </div>
          </div>

          {dataSectionOpen && (
            <div className="flex flex-col flex-1 min-h-0">
               {/* Scenario Tabs */}
              {inputMode !== 'guided' && (
                <div className="flex bg-[var(--surface)] border-b border-[var(--border)] shrink-0">
                  {(videoEditorEnabled ? ['before', '25%', '50%', '75%', 'after'] : ['before', 'after']).map((scenarioKey) => (
                    <button 
                      key={scenarioKey}
                      className={cn(
                        "flex-1 px-3 py-2 text-[11px] font-semibold text-center border-r border-b-2 transition-all border-[var(--border)] uppercase tracking-wider",
                        editScenario === scenarioKey 
                          ? "text-[var(--text)] bg-[var(--surface)] border-b-[var(--accent)]" 
                          : "text-[var(--text2)] bg-[var(--surface2)] border-b-transparent hover:text-[var(--text)]"
                      )}
                      onClick={() => setEditScenario(scenarioKey)}
                    >
                      {scenarioKey === 'before' ? 'Before' : scenarioKey === 'after' ? 'After' : scenarioKey}
                    </button>
                  ))}
                </div>
              )}

              <div className={cn("flex-1 overflow-y-auto", inputMode !== 'guided' && "p-4")}>
                {inputMode === 'guided' ? (
                  <GuidedSetup onGenerate={(before, after) => {
                    setScenarios(s => ({
                      before: { ...s.before, flows: before.length > 0 ? before : [{ Source: '', Target: '', Value: '', Color: '' }] },
                      after: { ...s.after, flows: after.length > 0 ? after : [{ Source: '', Target: '', Value: '', Color: '' }] }
                    }));
                    setInputMode('table');
                    if (videoEditorEnabled) setVideoEditorEnabled(false);
                  }} />
                ) : inputMode === 'table' ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10.5px] italic text-[var(--text3)]">Paste Excel cells · Drag to select</span>
                    <div className="border border-[var(--border)] rounded-[var(--radius)] overflow-auto data-table-wrap">
                      <table className="w-full text-[11.5px] border-collapse">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-[var(--surface2)]">
                            <th className="p-1 px-2 text-left font-medium text-[var(--text2)] text-[10.5px] uppercase tracking-wider border-b border-[var(--border)]">Source</th>
                            <th className="p-1 px-2 text-left font-medium text-[var(--text2)] text-[10.5px] uppercase tracking-wider border-b border-[var(--border)]">Target</th>
                            <th className="p-1 px-2 text-left font-medium text-[var(--text2)] text-[10.5px] uppercase tracking-wider border-b border-[var(--border)]">Value</th>
                            <th className="p-1 px-2 text-left font-medium text-[var(--text2)] text-[10.5px] uppercase tracking-wider border-b border-[var(--border)]">Color</th>
                            <th className="p-1 px-2 text-center border-b border-[var(--border)]">
                              <button 
                                onClick={clearAllFlows}
                                className="px-1.5 py-0.5 border border-red-500 rounded text-[10px] font-semibold text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                              >
                                Clear
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {editScenarioData.flows.map((flow, i) => (
                            <tr 
                              key={i} 
                              draggable={dragAllowedIndex === i}
                              onDragStart={(e) => handleDragStart(i, e)}
                              onDragOver={(e) => handleDragOver(i, e)}
                              onDragEnd={handleDragEnd}
                              className={cn(
                                "hover:bg-[var(--surface2)] border-b border-[var(--border)] last:border-b-0 transition-colors duration-150",
                                draggedIndex === i && "opacity-40 bg-[var(--surface2)] border-dashed border-[var(--accent)]"
                              )}
                            >
                              <td className="p-0"><input type="text" value={flow.Source} onPaste={e => handleTablePaste(e, i, 'Source')} onChange={e => handleFlowChange(i, 'Source', e.target.value)} className="w-full border-transparent bg-transparent focus:bg-[var(--surface)] p-1" /></td>
                              <td className="p-0"><input type="text" value={flow.Target} onPaste={e => handleTablePaste(e, i, 'Target')} onChange={e => handleFlowChange(i, 'Target', e.target.value)} className="w-full border-transparent bg-transparent focus:bg-[var(--surface)] p-1" /></td>
                              <td className="p-0"><input type="text" value={flow.Value} onPaste={e => handleTablePaste(e, i, 'Value')} onChange={e => handleFlowChange(i, 'Value', e.target.value)} className="w-full border-transparent bg-transparent focus:bg-[var(--surface)] p-1" /></td>
                              <td className="p-0"><input type="text" value={flow.Color} onPaste={e => handleTablePaste(e, i, 'Color')} onChange={e => handleFlowChange(i, 'Color', e.target.value)} className="w-full border-transparent bg-transparent focus:bg-[var(--surface)] p-1" /></td>
                              <td className="p-1 flex items-center justify-center gap-1">
                                {(i !== editScenarioData.flows.length - 1 || flow.Source) && (
                                  <>
                                    <button 
                                      type="button"
                                      onMouseEnter={() => setDragAllowedIndex(i)}
                                      onMouseLeave={() => {
                                        if (draggedIndex === null) {
                                          setDragAllowedIndex(null);
                                        }
                                      }}
                                      className="p-1 rounded cursor-grab active:cursor-grabbing text-[var(--text3)] hover:text-[var(--text2)] hover:bg-[var(--surface3)] transition-colors flex items-center justify-center"
                                      title="Drag to reorder"
                                    >
                                      <GripVertical size={14} />
                                    </button>
                                    <button 
                                      onClick={() => deleteFlow(i)} 
                                      className="text-[var(--text3)] hover:text-[var(--danger)] text-lg px-1 text-center leading-none"
                                      title="Delete flow"
                                    >
                                      ×
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 h-full">
                    <span className="text-[10.5px] italic text-[var(--text3)]">Format: <code className="font-mono">Source [Value] Target Color</code> — one per line</span>
                    <textarea 
                      className="flex-1 w-full p-2 font-mono text-xs resize-none min-h-[150px]"
                      value={localFlowText !== null ? localFlowText : editScenarioData.flows.map(f => `${f.Source} [${f.Value}] ${f.Target} ${f.Color}`.trim()).join('\n')}
                      onChange={e => {
                        setLocalFlowText(e.target.value);
                        const lines = e.target.value.split('\n');
                        const newFlows = lines.map(line => {
                          const m = line.match(/^(.+?)\s*\[(.+?)\]\s*(.+?)(?:\s+(\S+))?$/);
                          if (m) return { Source: m[1].trim(), Value: m[2].trim(), Target: m[3].trim(), Color: (m[4] || '').trim() };
                          return { Source: '', Target: '', Value: '', Color: '' };
                        }).filter(f => f.Source || f.Target || f.Value);
                        if (newFlows.length === 0) newFlows.push({ Source: '', Target: '', Value: '', Color: '' });
                        updateScenario(editScenario, { flows: newFlows });
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
 
        {/* Resize Handle */}
        {dataSectionOpen && (
          <div 
            onMouseDown={handleDataSectionResizeStart}
            className="h-[6px] -mt-[3px] bg-transparent hover:bg-[var(--accent)]/50 cursor-ns-resize shrink-0 transition-colors relative z-10 hidden md:block group"
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-1 rounded-full bg-[var(--border)] group-hover:bg-[var(--accent)] transition-colors shadow-sm" />
          </div>
        )}
         <div className="flex border-b border-[var(--border)] shrink-0 bg-[var(--surface)] p-2">
           <div className="flex flex-col gap-1 w-full relative">
             <div className="flex items-center gap-2.5 px-2">
               <span className="text-[11px] font-medium text-[var(--text3)]">Viewing:</span>
               
               <div className="flex flex-col items-center">
                 <button 
                   className={cn(
                     "px-3.5 py-1 text-xs font-semibold rounded-[var(--radius)] border border-[var(--border)] transition-all",
                     viewScenario === 'before' ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--text2)] hover:text-[var(--text)]"
                   )}
                   onClick={() => setViewScenario('before')}
                 >
                   Before
                 </button>
                 {renderedPPUs.before && (
                   <span className="text-[9px] text-[var(--text3)] font-mono mt-1">{renderedPPUs.before.toFixed(2)} px/{config.valueUnit}</span>
                 )}
               </div>

               {videoEditorEnabled && (
                 <>
                   {['25%', '50%', '75%'].map((step) => (
                     <div key={step} className="flex flex-col items-center">
                       <button 
                         className={cn(
                           "px-3.5 py-1 text-xs font-semibold rounded-[var(--radius)] border border-[var(--border)] transition-all",
                           viewScenario === step ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--text2)] hover:text-[var(--text)]"
                         )}
                         onClick={() => setViewScenario(step)}
                       >
                         {step}
                       </button>
                       {renderedPPUs[step] && (
                         <span className="text-[9px] text-[var(--text3)] font-mono mt-1">{renderedPPUs[step]?.toFixed(2)} px/{config.valueUnit}</span>
                       )}
                     </div>
                   ))}
                 </>
               )}

               <div className="flex flex-col items-center">
                 <button 
                   className={cn(
                     "px-3.5 py-1 text-xs font-semibold rounded-[var(--radius)] border border-[var(--border)] transition-all",
                     viewScenario === 'after' ? "bg-[#22c55e] border-[#22c55e] text-white" : "bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--text2)] hover:text-[var(--text)]"
                   )}
                   onClick={() => setViewScenario('after')}
                 >
                   After
                 </button>
                 {renderedPPUs.after && (
                   <span className="text-[9px] text-[var(--text3)] font-mono mt-1">{renderedPPUs.after.toFixed(2)} px/{config.valueUnit}</span>
                 )}
               </div>

                <div className="flex items-center ml-2 pl-3 border-l border-[var(--border)] gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-[var(--text2)]">Preserve Input Order</span>
                    <button 
                      onClick={() => setActiveHelpFeature('pio')}
                      className="text-[var(--text3)] hover:text-[var(--text)] transition-colors flex items-center"
                      title="What is this?"
                    >
                      <HelpCircle size={13} />
                    </button>
                  </div>
                  <button 
                    onClick={() => setPreserveInputOrder(prev => !prev)}
                    className={cn(
                      "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      preserveInputOrder ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                    )}
                  >
                    <span 
                      className={cn(
                        "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        preserveInputOrder ? "translate-x-3" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                <div className="flex items-center ml-2 pl-3 border-l border-[var(--border)] gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-[var(--text2)]">Sync Views</span>
                    <button 
                      onClick={() => setActiveHelpFeature('sync')}
                      className="text-[var(--text3)] hover:text-[var(--text)] transition-colors flex items-center"
                      title="What is this?"
                    >
                      <HelpCircle size={13} />
                    </button>
                  </div>
                  <button 
                    onClick={toggleSyncViews}
                    className={cn(
                      "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      isViewsSynced ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                    )}
                  >
                    <span 
                      className={cn(
                        "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        isViewsSynced ? "translate-x-3" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                <div className="flex items-center ml-2 pl-3 border-l border-[var(--border)] gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-[11px] font-medium transition-opacity", isViewsSynced ? "text-[var(--text2)]" : "text-[var(--text3)] opacity-50")}>Video Editor</span>
                    <button 
                      onClick={() => setActiveHelpFeature('video')}
                      className="text-[var(--text3)] hover:text-[var(--text)] transition-colors flex items-center"
                      title="What is this?"
                    >
                      <HelpCircle size={13} />
                    </button>
                  </div>
                  <button 
                    onClick={isViewsSynced ? toggleVideoEditor : undefined}
                    disabled={!isViewsSynced}
                    className={cn(
                      "relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-all duration-200 ease-in-out focus:outline-none",
                      !isViewsSynced ? "bg-[var(--border)] opacity-40 cursor-not-allowed" :
                      videoEditorEnabled ? "bg-[var(--accent)] cursor-pointer" : "bg-[var(--border)] cursor-pointer"
                    )}
                  >
                    <span 
                      className={cn(
                        "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        videoEditorEnabled && isViewsSynced ? "translate-x-3" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

               <div className="ml-auto flex items-center pr-2">
                 <button 
                   onClick={resetLayout}
                   className="flex items-center gap-1 py-1 px-2.5 border border-[var(--border)] bg-[var(--surface2)] rounded-[var(--radius)] text-[11px] font-medium text-[var(--text2)] transition-colors hover:border-[var(--text2)] hover:text-[var(--text)]"
                 >
                   <RotateCcw size={13} /> Reset Layout
                 </button>
               </div>
             </div>
           </div>
         </div>
  
         {/* Diagram Area */}
         <div className="relative flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-[var(--bg)] scrollbar-hide">
           <div className="relative flex-1 min-h-0 min-w-0 p-4">
             {(videoEditorEnabled ? ['before', '25%', '50%', '75%', 'after'] : ['before', 'after']).map(scenarioKey => {
                const baseScenario = scenarios[scenarioKey];
                const displayScenario = preserveInputOrder ? {
                  ...baseScenario,
                  nodePositions: computePreservedPositions(baseScenario, config),
                  hasDraggedNodes: true
                } : baseScenario;

                return (
                  <div 
                    key={scenarioKey}
                    className={cn(
                      "absolute inset-0 p-4 transition-opacity duration-300",
                      viewScenario === scenarioKey ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                    )}
                  >
                    <SankeyDiagram 
                      scenario={displayScenario}
                      config={config}
                      preserveInputOrder={preserveInputOrder}
                      onNodeDrag={(positions) => {
                        setPreserveInputOrder(false);
                        handleNodeDrag(positions);
                      }}
                      animating={animating && viewScenario === scenarioKey}
                      animSpeed={animSpeed}
                      onRenderedPPU={(val) => {
                        setRenderedPPUs(prev => {
                          if (prev[scenarioKey] === null) return { ...prev, [scenarioKey]: val };
                          if (Math.abs(prev[scenarioKey]! - val) > 0.01) return { ...prev, [scenarioKey]: val };
                          return prev;
                        });
                      }}
                      onRenderedPositions={(pos) => {
                        setScenarios(prev => {
                          const currentPosStr = JSON.stringify(prev[scenarioKey].nativePositions || {});
                          const newPosStr = JSON.stringify(pos || {});
                          if (currentPosStr === newPosStr) return prev;
                          return {
                            ...prev,
                            [scenarioKey]: { ...prev[scenarioKey], nativePositions: pos }
                          };
                        });
                      }}
                    />
                  </div>
                );
              })}
           </div>
         </div>
 
         {/* Download Bar */}
         <div className="flex items-center gap-2 p-1.5 px-3 border-t border-[var(--border)] bg-[var(--surface)] shrink-0">
           <span className="text-[11px] text-[var(--text3)]">Export:</span>
           <button className="px-3 py-1 btn" style={{ fontSize: '11px' }} onClick={() => exportImage('png')}><Download size={13} /> PNG</button>
           <button className="px-3 py-1 btn" style={{ fontSize: '11px' }} onClick={() => exportImage('svg')}><Download size={13} /> SVG</button>
           <div className="w-px h-4 mx-1 bg-[var(--border)]" />
           <button 
             className={cn("px-3 py-1 btn", !videoEditorEnabled && "opacity-40 cursor-not-allowed")} 
             style={{ fontSize: '11px' }}
             onClick={exportTransitionVideo}
             disabled={exportingVideo || !videoEditorEnabled}
           >
             <Video size={13} /> {exportingVideo ? `Exporting (${videoProgress}%)` : 'Transition Video'}
           </button>
           
           <button 
             onClick={() => setShowDonationModal(true)}
             className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-[var(--radius)] text-[11px] font-semibold bg-[#ff813f] hover:bg-[#ff6c24] text-white transition-colors border-0 cursor-pointer shadow-sm"
             style={{ height: '24px' }}
           >
             ☕ Buy me a coffee
           </button>
         </div>
 
         {exportingVideo && (
           <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
             <div className="text-white font-medium mb-4">Generating Video...</div>
             <div className="w-64 h-2 bg-white/20 rounded-full overflow-hidden">
               <div 
                 className="h-full bg-[var(--accent)] transition-all duration-300"
                 style={{ width: `${videoProgress}%` }}
               />
             </div>
             <div className="text-white/60 text-xs mt-2">{videoProgress}% Complete</div>
             <div className="text-white/70 text-sm mt-3">This may take a minute</div>
           </div>
         )}

        {gifPreviewUrl && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-8">
            <div className="bg-[var(--surface)] p-6 rounded-xl shadow-2xl max-w-4xl w-full flex flex-col items-center">
              <h3 className="text-[var(--text)] text-xl font-medium mb-4">Transition Preview</h3>
              <div className="bg-[var(--surface2)] rounded mb-6 border border-[var(--border)] overflow-hidden w-full flex justify-center">
                <img 
                  src={gifPreviewUrl} 
                  alt="Transition Preview" 
                  className="max-h-[60vh] object-contain"
                  style={{ backgroundColor: config.bgColor || '#ffffff' }}
                />
              </div>
              <div className="flex gap-4">
                <button 
                  className="px-6 py-2 rounded font-medium border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors"
                  onClick={() => {
                    URL.revokeObjectURL(gifPreviewUrl);
                    setGifPreviewUrl(null);
                  }}
                >
                  Cancel
                </button>
                <a 
                  href={gifPreviewUrl}
                  download="sankey_transition.gif"
                  className="px-6 py-2 rounded font-medium bg-[#3b7fd4] text-white hover:opacity-90 flex items-center gap-2 transition-colors"
                  onClick={() => {
                    setTimeout(() => {
                      URL.revokeObjectURL(gifPreviewUrl);
                      setGifPreviewUrl(null);
                    }, 500);
                  }}
                >
                  <Download size={16} /> Download GIF
                </a>
              </div>
              
              {videoDebugInfo.length > 0 && (
                <details className="w-full mt-6 text-xs text-[var(--text2)]">
                  <summary className="cursor-pointer font-medium mb-2 p-1 hover:bg-[var(--surface2)] rounded flex items-center justify-between">
                    <span>Frame information</span>
                    <button
                      className="px-2 py-1 bg-[var(--surface3)] hover:bg-[var(--border)] rounded text-[var(--text)] transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        const header = ['Frame', 'PPU_n', 'NP_n', 'x', 'target', 'NP_corrected', 'PPU_after'].join('\t');
                        const rows = videoDebugInfo.map(info => 
                          [info.frame, info.ppu_n.toFixed(2), info.np_n.toFixed(1), info.x.toFixed(3), info.target.toFixed(1), info.np_corrected.toFixed(1), info.ppu_after.toFixed(2)].join('\t')
                        );
                        navigator.clipboard.writeText([header, ...rows].join('\n'));
                      }}
                    >
                      Copy as TSV
                    </button>
                  </summary>
                  <div className="max-h-48 overflow-y-auto border border-[var(--border)] rounded bg-[var(--surface2)]">
                    <table className="w-full text-right p-2">
                      <thead className="sticky top-0 bg-[var(--surface)] shadow-sm">
                        <tr>
                          <th className="p-1 font-semibold border-b border-[var(--border)]">Frame</th>
                          <th className="p-1 font-semibold border-b border-[var(--border)]">PPU_n</th>
                          <th className="p-1 font-semibold border-b border-[var(--border)]">NP_n</th>
                          <th className="p-1 font-semibold border-b border-[var(--border)]">x</th>
                          <th className="p-1 font-semibold border-b border-[var(--border)]">target</th>
                          <th className="p-1 font-semibold border-b border-[var(--border)]">NP_corrected</th>
                          <th className="p-1 font-semibold border-b border-[var(--border)]">PPU_after</th>
                        </tr>
                      </thead>
                      <tbody>
                        {videoDebugInfo.map(info => (
                          <tr key={info.frame} className="hover:bg-[var(--surface)]">
                            <td className="p-1 border-b border-[var(--border)]">{info.frame}</td>
                            <td className="p-1 border-b border-[var(--border)]">{info.ppu_n.toFixed(2)}</td>
                            <td className="p-1 border-b border-[var(--border)]">{info.np_n.toFixed(1)}</td>
                            <td className="p-1 border-b border-[var(--border)]">{info.x.toFixed(3)}</td>
                            <td className="p-1 border-b border-[var(--border)]">{info.target.toFixed(1)}</td>
                            <td className="p-1 border-b border-[var(--border)]">{info.np_corrected.toFixed(1)}</td>
                            <td className="p-1 border-b border-[var(--border)]">{info.ppu_after.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          </div>
        )}

        {activeHelpFeature && (
          <div 
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setActiveHelpFeature(null)}
          >
            <div 
              className="bg-[var(--surface)] border border-[var(--border)] p-6 rounded-xl shadow-2xl max-w-md w-full relative"
              onClick={e => e.stopPropagation()}
            >
              <button 
                className="absolute top-4 right-4 text-[var(--text3)] hover:text-[var(--text)] text-lg leading-none"
                onClick={() => setActiveHelpFeature(null)}
              >
                ×
              </button>
              
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-xl">
                  {activeHelpFeature === 'pio' ? '📐' : activeHelpFeature === 'sync' ? '🔄' : '🎬'}
                </span>
                <h3 className="text-[var(--text)] text-lg font-semibold tracking-tight text-white">
                  {activeHelpFeature === 'pio' && 'Preserve Input Order'}
                  {activeHelpFeature === 'sync' && 'Sync Views'}
                  {activeHelpFeature === 'video' && 'Video Editor'}
                </h3>
              </div>
              
              <div className="text-[var(--text2)] space-y-3 text-[12.5px] leading-relaxed">
                {activeHelpFeature === 'pio' && (
                  <>
                    <p>
                      Forces nodes and links to match the sequence defined in your flow table.
                    </p>
                    <p>
                      <strong>How it works:</strong> It stacks nodes vertically within each column in the order they first appear. It also applies sub-pixel tie-breakers to ensure that long bypass links flow along the outer edges of the canvas without crossing intermediate links.
                    </p>
                    <p className="italic text-[var(--text3)]">
                      Note: You can still drag nodes freely while this is active. Dragging a node will save its custom coordinates and turn off this layout mode automatically.
                    </p>
                  </>
                )}
                {activeHelpFeature === 'sync' && (
                  <>
                    <p>
                      Synchronizes the layouts and node structures of the <strong>Before</strong> and <strong>After</strong> scenarios.
                    </p>
                    <p>
                      <strong>How it works:</strong> Any node present in only one scenario is added as a "phantom" node (with zero value) in the other.
                    </p>
                    <p>
                      Activating this instantly copies the layout positions of your currently active view onto the other view. From that point on, dragging a node in one diagram automatically updates its position in both diagrams, keeping them perfectly aligned.
                    </p>
                  </>
                )}
                {activeHelpFeature === 'video' && (
                  <>
                    <p>
                      Enables state transitions and exports them as animations.
                    </p>
                    <p>
                      <strong>How it works:</strong> It automatically generates intermediate transition steps (25%, 50%, 75%) between your Before and After diagrams.
                    </p>
                    <p>
                      This allows you to preview how the energy/material flows shift dynamically and export a smooth, high-fidelity transition GIF.
                    </p>
                    <p className="italic text-[var(--text3)] font-medium">
                      Requires "Sync Views" to be enabled first, so that the two diagrams have a matching set of nodes to animate.
                    </p>
                  </>
                )}
              </div>
              
              <div className="mt-6 flex justify-end">
                <button 
                  className="px-4 py-1.5 rounded-[var(--radius)] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity text-xs"
                  onClick={() => setActiveHelpFeature(null)}
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}
        
        {showDonationModal && (
          <div 
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowDonationModal(false)}
          >
            <div 
              className="bg-[var(--surface)] border border-[var(--border)] p-6 rounded-xl shadow-2xl max-w-sm w-full relative text-center"
              onClick={e => e.stopPropagation()}
            >
              <button 
                className="absolute top-4 right-4 text-[var(--text3)] hover:text-[var(--text)] text-lg leading-none"
                onClick={() => setShowDonationModal(false)}
              >
                ×
              </button>
              
              <div className="text-3xl mb-3">☕</div>
              <h3 className="text-[var(--text)] text-lg font-semibold tracking-tight text-white mb-2">
                Thank you for supporting this website!
              </h3>
              <p className="text-[var(--text2)] text-[12px] leading-relaxed mb-6">
                Please enter the amount you want to donate in the secure Revolut payment window.
              </p>
              
              <div className="flex flex-col gap-2">
                <button 
                  className="w-full py-2 rounded-[var(--radius)] font-semibold bg-[#ff813f] hover:bg-[#ff6c24] text-white transition-colors border-0 cursor-pointer text-xs shadow-md"
                  onClick={() => {
                    openDonationPopup();
                    setShowDonationModal(false);
                  }}
                >
                  Open Secure Payment Window
                </button>
                <button 
                  className="w-full py-2 rounded-[var(--radius)] font-medium border border-[var(--border)] bg-transparent text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] cursor-pointer transition-colors text-xs"
                  onClick={() => setShowDonationModal(false)}
                >
                  Cancel
                </button>
              </div>
              
              <p className="text-[var(--text3)] text-[10px] mt-4 leading-normal">
                🔒 Payment processed securely by Revolut. Payment portals cannot be embedded directly inside other websites for anti-phishing protection.
              </p>
            </div>
          </div>
        )}
       </main>
     </div>
   );
 }
