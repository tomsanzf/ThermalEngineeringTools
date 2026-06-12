import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Sliders, 
  Settings, 
  Zap, 
  Thermometer, 
  ArrowLeft, 
  HelpCircle, 
  Activity,
  Flame,
  Sun,
  Droplet,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Trash2,
  Download,
  Upload
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ResponsiveContainer 
} from 'recharts';
import { 
  createInitialState, 
  simulateStep,
  getLoopActuals
} from './stratificationModel';
import type { 
  TankState, 
  SimulationParams, 
  ConnectionPort, 
  FluidLoop 
} from './stratificationModel';

// Bezier curve midpoint utility
const getMidpoint = (x1: number, y1: number, x2: number, y2: number, t: number = 0.5) => {
  const dx = 70; 
  const cx1 = x1 < x2 ? x1 + dx : x1 - dx;
  const cy1 = y1;
  const cx2 = x1 < x2 ? x2 - dx : x2 + dx;
  const cy2 = y2;
  
  const mx = Math.pow(1 - t, 3) * x1 + 3 * Math.pow(1 - t, 2) * t * cx1 + 3 * (1 - t) * Math.pow(t, 2) * cx2 + Math.pow(t, 3) * x2;
  const my = Math.pow(1 - t, 3) * y1 + 3 * Math.pow(1 - t, 2) * t * cy1 + 3 * (1 - t) * Math.pow(t, 2) * cy2 + Math.pow(t, 3) * y2;
  return { x: mx, y: my };
};

// Formats simulated elapsed minutes into a human-readable string
const formatElapsedTime = (minutes: number): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  if (minutes < 60) {
    const m = Math.floor(minutes);
    const s = Math.floor((minutes % 1) * 60);
    return `${pad(m)}m ${pad(s)}s`;
  } else if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    const s = Math.floor((minutes % 1) * 60);
    return `${h}h ${pad(m)}m ${pad(s)}s`;
  } else {
    const d = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    const m = Math.floor(minutes % 60);
    return `${d}d ${pad(h)}h ${pad(m)}m`;
  }
};

interface PipelineBadgeItem {
  id: string;
  loopId: string;
  type: 'supply' | 'return';
  side: 'left' | 'right';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  portY: number;
  isPort2: boolean;
  defaultY: number;
  t: number;
  flowRate: number;
  temp: number;
  color: string;
  isHotLine: boolean;
}


function App() {
  const NUM_NODES = 20;
  
  // State
  const [state, setState] = useState<TankState>(() => createInitialState(NUM_NODES));
  const [params, setParams] = useState<SimulationParams>({
    tankVolume: 10,
    tankHeight: 2.0,
    ambientTemp: 20,
    heatLossCoef: 0.8, // W/m²K (highly insulated)
    conductionCoef: 1.5, // W/K internal conduction
    numNodes: NUM_NODES,
    riMin: 100,
    riMax: 500,
    overrideBuoyancy: true,
    buoyancyOverrideValue: 0.1
  });
  
  const [simSpeed, setSimSpeed] = useState<number>(10); // 0 (paused), 1x, 10x, 100x, 500x
  const [flowDurationFactor, setFlowDurationFactor] = useState<number>(15.0);
  const [dragPortId, setDragPortId] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0); // in simulated minutes
  const [isPaused, setIsPaused] = useState<boolean>(true); // track paused state separately from speed
  const [tempHistory, setTempHistory] = useState<any[]>([]); // temperature history over time
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [showChargeExplanation, setShowChargeExplanation] = useState<boolean>(false);
  const [showNetExplanation, setShowNetExplanation] = useState<boolean>(false);
  const [hoveredSegIdx, setHoveredSegIdx] = useState<number | null>(null);
  const [showResetDropdown, setShowResetDropdown] = useState<boolean>(false);

  // Collapsible physical parameters side panel
  const [leftPanelOpen, setLeftPanelOpen] = useState<boolean>(true);

  // Responsive canvas width observer
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(1050);

  // Record temperature history over time at 5 height levels
  useEffect(() => {
    if (elapsedTime === 0) {
      setTempHistory([]);
      return;
    }

    setTempHistory((prev) => {
      const maxPoints = 500;
      const lastPoint = prev[prev.length - 1];
      const timeInterval = 0.1; // simulated minutes (every 6 seconds)

      if (lastPoint && (elapsedTime - lastPoint.time) < timeInterval) {
        return prev;
      }

      const botIdx = 0;
      const t25Idx = Math.round((NUM_NODES - 1) * 0.25);
      const t50Idx = Math.round((NUM_NODES - 1) * 0.50);
      const t75Idx = Math.round((NUM_NODES - 1) * 0.75);
      const topIdx = NUM_NODES - 1;

      const newPoint = {
        time: elapsedTime,
        timeLabel: formatElapsedTime(elapsedTime),
        'Bottom (0%)': Math.round(state.temperatures[botIdx] * 10) / 10,
        '25% Height': Math.round(state.temperatures[t25Idx] * 10) / 10,
        '50% Height': Math.round(state.temperatures[t50Idx] * 10) / 10,
        '75% Height': Math.round(state.temperatures[t75Idx] * 10) / 10,
        'Top (100%)': Math.round(state.temperatures[topIdx] * 10) / 10,
      };

      const nextHist = [...prev, newPoint];
      if (nextHist.length > maxPoints) {
        return nextHist.slice(nextHist.length - maxPoints);
      }
      return nextHist;
    });
  }, [elapsedTime, state.temperatures, NUM_NODES]);

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setCanvasWidth(Math.max(900, entry.contentRect.width));
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);


  // Stacked Loop Boxes order (left sources / right sinks)
  const [sourceOrder, setSourceOrder] = useState<string[]>(['hp', 'solar']);
  const [sinkOrder, setSinkOrder] = useState<string[]>(['heating', 'dhw']);

  // Box expansion state
  const [expandedBoxes, setExpandedBoxes] = useState<{ [key: string]: boolean }>({
    solar: false,
    hp: false,
    heating: false,
    dhw: false
  });

  const getBoxHeight = (loopId: string, isExpanded: boolean) => {
    if (!isExpanded) return 85;
    const loop = state.loops.find(l => l.id === loopId);
    if (loop && loop.type === 'source') {
      return 280; // All sources need 280px for hysteresis section when expanded
    }
    return 205; // Expanded height for others to avoid overflow
  };

  const getBoxPositions = () => {
    const positions: { [key: string]: { x: number; y: number } } = {};
    
    // Left sources
    let currentY = 40;
    sourceOrder.forEach(id => {
      const isExpanded = expandedBoxes[id];
      positions[id] = { x: 20, y: currentY };
      currentY += getBoxHeight(id, isExpanded) + 16;
    });
    
    // Right sinks
    currentY = 40;
    sinkOrder.forEach(id => {
      const isExpanded = expandedBoxes[id];
      positions[id] = { x: canvasWidth - 280 - 20, y: currentY }; // Dynamic right position
      currentY += getBoxHeight(id, isExpanded) + 16;
    });
    
    return positions;
  };

  const boxPositions = getBoxPositions();

  const getColumnsEndY = () => {
    let sourcesEndY = 40;
    sourceOrder.forEach(id => {
      const isExpanded = expandedBoxes[id];
      sourcesEndY += getBoxHeight(id, isExpanded) + 16;
    });

    let sinksEndY = 40;
    sinkOrder.forEach(id => {
      const isExpanded = expandedBoxes[id];
      sinksEndY += getBoxHeight(id, isExpanded) + 16;
    });

    return { sourcesEndY, sinksEndY };
  };

  const { sourcesEndY, sinksEndY } = getColumnsEndY();
  const canvasHeight = Math.max(680, sourcesEndY + 100, sinksEndY + 100);

  const tankTop = 80;
  const tankHeight = canvasHeight - tankTop - 160;
  const tankLeft = Math.round((canvasWidth - 150) / 2);
  const tankRight = tankLeft + 150;

  const tankRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const accumulatorRef = useRef<number>(0);
  
  // Color mapping function based on temperature
  const getTempColor = (temp: number) => {
    const minT = 10;
    const maxT = 90;
    const percentage = Math.min(100, Math.max(0, ((temp - minT) / (maxT - minT)) * 100));
    const hue = 240 - (percentage / 100) * 240;
    return `hsl(${hue}, 85%, 45%)`;
  };

  // Run simulation step
  const tick = useCallback((steps: number) => {
    setState((prev) => {
      let currentT = [...prev.temperatures];
      let currentLoops = [...prev.loops];
      const dt = 1.0;
      
      for (let i = 0; i < steps; i++) {
        const result = simulateStep({ ...prev, temperatures: currentT, loops: currentLoops }, params, dt);
        currentT = result.temperatures;
        currentLoops = result.loops;
      }
      
      setElapsedTime(t => t + (dt * steps) / 60);

      return {
        ...prev,
        temperatures: currentT,
        loops: currentLoops
      };
    });
  }, [params]);

  // RequestAnimationFrame Loop
  useEffect(() => {
    if (!isPaused) {
      lastTimeRef.current = performance.now();
      accumulatorRef.current = 0;

      const loop = () => {
        const now = performance.now();
        const elapsedMs = now - lastTimeRef.current;
        lastTimeRef.current = now;

        const dtReal = elapsedMs / 1000;
        accumulatorRef.current += dtReal * simSpeed;

        if (accumulatorRef.current > 100.0) {
          accumulatorRef.current = 100.0;
        }

        let stepsToRun = 0;
        const dtSim = 1.0;
        while (accumulatorRef.current >= dtSim) {
          stepsToRun++;
          accumulatorRef.current -= dtSim;
        }

        if (stepsToRun > 0) {
          tick(stepsToRun);
        }

        simRef.current = requestAnimationFrame(loop);
      };
      simRef.current = requestAnimationFrame(loop);
    }
    return () => {
      if (simRef.current) cancelAnimationFrame(simRef.current);
    };
  }, [isPaused, simSpeed, tick]);

  // Reset simulation with a specific temperature profile
  const resetProfile = (profileType: 'fullyCharged' | 'maxAchievable' | 'stratified' | 'fullyDrained') => {
    const activeSources = state.loops.filter(l => l.isActive && l.type === 'source');
    const activeLoops = state.loops.filter(l => l.isActive);

    const highestSourceTemp = activeSources.length > 0
      ? Math.max(...activeSources.map(l => l.designTempSupply))
      : 90;

    const returnTemps = activeLoops.map(l => l.designTempReturn);
    const coldestReturn = returnTemps.length > 0
      ? Math.min(...returnTemps)
      : 20;

    const newTemps: number[] = [];

    for (let i = 0; i < NUM_NODES; i++) {
      const fraction = i / (NUM_NODES - 1);

      if (profileType === 'fullyCharged') {
        newTemps.push(highestSourceTemp);
      } else if (profileType === 'fullyDrained') {
        newTemps.push(coldestReturn);
      } else if (profileType === 'stratified') {
        newTemps.push(coldestReturn + fraction * (highestSourceTemp - coldestReturn));
      } else if (profileType === 'maxAchievable') {
        // Max achievable charge
        // A node is heatable if it lies at or above the lowest port height of any active source loop
        const covering = activeSources.filter(loop => {
          const supplyPort = state.ports.find(p => p.id === loop.ports.supply);
          const returnPort = state.ports.find(p => p.id === loop.ports.return);
          if (!supplyPort || !returnPort) return false;
          const hMin = Math.min(supplyPort.height, returnPort.height);
          return fraction >= hMin - 1e-5;
        });

        if (covering.length > 0) {
          const tMax = Math.max(...covering.map(l => l.designTempSupply));
          newTemps.push(tMax);
        } else {
          newTemps.push(coldestReturn);
        }
      }
    }

    setState(prev => ({
      ...prev,
      temperatures: newTemps
    }));
    setElapsedTime(0);
    setTempHistory([]);
  };

  // Reset only the timer and temperature history graph
  const handleResetTimer = () => {
    setElapsedTime(0);
    setTempHistory([]);
  };

  // Save current configuration to JSON file
  const handleSaveConfig = () => {
    const configData = {
      state,
      params,
      sourceOrder,
      sinkOrder,
      expandedBoxes,
      elapsedTime,
      tempHistory
    };
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stratified-tank-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Load configuration from JSON file
  const handleLoadConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.state && data.params && data.sourceOrder && data.sinkOrder) {
          setState(data.state);
          setParams(data.params);
          setSourceOrder(data.sourceOrder);
          setSinkOrder(data.sinkOrder);
          if (data.expandedBoxes) setExpandedBoxes(data.expandedBoxes);
          if (typeof data.elapsedTime === 'number') setElapsedTime(data.elapsedTime);
          if (Array.isArray(data.tempHistory)) {
            setTempHistory(data.tempHistory);
          } else {
            setTempHistory([]);
          }
        } else {
          alert("Invalid configuration file format. Missing required fields.");
        }
      } catch (err) {
        alert("Error parsing configuration file. Please ensure it is a valid JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Drag-and-drop port connections
  const handlePortMouseDown = (portId: string) => {
    setDragPortId(portId);
  };

  const handlePortMouseMove = useCallback((e: MouseEvent) => {
    if (!dragPortId) return;
    
    const canvasElement = document.getElementById('diagram-canvas');
    if (!canvasElement) return;

    const rect = canvasElement.getBoundingClientRect();
    const y = e.clientY - (rect.top + tankTop);

    let height = 1 - (y / tankHeight);
    height = Math.min(1, Math.max(0, height));
    
    const nodeIdx = Math.min(NUM_NODES - 1, Math.max(0, Math.floor(height * NUM_NODES)));
    const snappedHeight = (nodeIdx + 0.5) / NUM_NODES;

    setState(prev => ({
      ...prev,
      ports: prev.ports.map(p => p.id === dragPortId ? { ...p, height: snappedHeight } : p)
    }));
  }, [dragPortId, tankHeight, tankTop]);

  const handlePortMouseUp = useCallback(() => {
    setDragPortId(null);
  }, []);

  // Move source box up/down
  const moveSource = (id: string, direction: 'up' | 'down') => {
    setSourceOrder(prev => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      
      const newOrder = [...prev];
      const temp = newOrder[idx];
      newOrder[idx] = newOrder[nextIdx];
      newOrder[nextIdx] = temp;
      return newOrder;
    });
  };

  // Move sink box up/down
  const moveSink = (id: string, direction: 'up' | 'down') => {
    setSinkOrder(prev => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      
      const newOrder = [...prev];
      const temp = newOrder[idx];
      newOrder[idx] = newOrder[nextIdx];
      newOrder[nextIdx] = temp;
      return newOrder;
    });
  };

  // Add a new source loop dynamically
  const addNewSource = () => {
    const loopId = `source-${Date.now()}`;
    const loopName = `Source Loop ${sourceOrder.length + 1}`;
    
    // Preset clean source colors
    const colors = ['#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#f43f5e', '#eab308'];
    const usedColors = state.loops.filter(l => l.type === 'source').map(l => l.color);
    const color = colors.find(c => !usedColors.includes(c)) || colors[state.loops.length % colors.length];

    const supplyPortId = `${loopId}-supply`;
    const returnPortId = `${loopId}-return`;

    const newPorts: ConnectionPort[] = [
      { id: supplyPortId, name: `${loopName} Supply (Warm In)`, type: 'supply', loopId, height: 0.70, color },
      { id: returnPortId, name: `${loopName} Return (Cold Out)`, type: 'return', loopId, height: 0.30, color }
    ];

    const newLoop: FluidLoop = {
      id: loopId,
      name: loopName,
      type: 'source',
      designPower: 100,
      designTempSupply: 80,
      designTempReturn: 40,
      isActive: true,
      color,
      ports: { supply: supplyPortId, return: returnPortId },
      sourceControlMode: 'tempLimited'
    };

    setState(prev => ({
      ...prev,
      ports: [...prev.ports, ...newPorts],
      loops: [...prev.loops, newLoop]
    }));

    setSourceOrder(prev => [...prev, loopId]);
    setExpandedBoxes(prev => ({ ...prev, [loopId]: false }));
  };

  // Add a new sink loop dynamically
  const addNewSink = () => {
    const loopId = `sink-${Date.now()}`;
    const loopName = `Sink Loop ${sinkOrder.length + 1}`;

    // Preset clean sink colors
    const colors = ['#3b82f6', '#ec4899', '#6366f1', '#10b981', '#06b6d4', '#84cc16'];
    const usedColors = state.loops.filter(l => l.type === 'sink').map(l => l.color);
    const color = colors.find(c => !usedColors.includes(c)) || colors[state.loops.length % colors.length];

    const supplyPortId = `${loopId}-return`; // Sink supply is inlet into tank (cold makeup)
    const returnPortId = `${loopId}-supply`; // Sink return is outlet from tank (hot draw)

    const newPorts: ConnectionPort[] = [
      { id: supplyPortId, name: `${loopName} Makeup (Cold In)`, type: 'supply', loopId, height: 0.25, color },
      { id: returnPortId, name: `${loopName} Draw (Hot Out)`, type: 'return', loopId, height: 0.75, color }
    ];

    const newLoop: FluidLoop = {
      id: loopId,
      name: loopName,
      type: 'sink',
      designPower: 100,
      designTempSupply: 60,
      designTempReturn: 20,
      isActive: true,
      color,
      ports: { supply: supplyPortId, return: returnPortId },
      sinkControlMode: 'unrestricted'
    };

    setState(prev => ({
      ...prev,
      ports: [...prev.ports, ...newPorts],
      loops: [...prev.loops, newLoop]
    }));

    setSinkOrder(prev => [...prev, loopId]);
    setExpandedBoxes(prev => ({ ...prev, [loopId]: false }));
  };

  // Delete a loop dynamically
  const deleteLoop = (loopId: string) => {
    setState(prev => {
      const loop = prev.loops.find(l => l.id === loopId);
      if (!loop) return prev;

      return {
        ...prev,
        loops: prev.loops.filter(l => l.id !== loopId),
        ports: prev.ports.filter(p => p.id !== loop.ports.supply && p.id !== loop.ports.return)
      };
    });

    setSourceOrder(prev => prev.filter(id => id !== loopId));
    setSinkOrder(prev => prev.filter(id => id !== loopId));
    setExpandedBoxes(prev => {
      const next = { ...prev };
      delete next[loopId];
      return next;
    });
  };

  // Listen to global mouse events during drag
  useEffect(() => {
    if (dragPortId) {
      window.addEventListener('mousemove', handlePortMouseMove);
      window.addEventListener('mouseup', handlePortMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handlePortMouseMove);
      window.removeEventListener('mouseup', handlePortMouseUp);
    };
  }, [dragPortId, handlePortMouseMove, handlePortMouseUp]);

  // Toggle active status of loops
  const toggleLoop = (loopId: string) => {
    setState(prev => ({
      ...prev,
      loops: prev.loops.map(l => l.id === loopId ? { ...l, isActive: !l.isActive } : l)
    }));
  };

  // Modify loop parameters
  const updateLoopParam = (
    loopId: string, 
    field: 'designPower' | 'designTempSupply' | 'designTempReturn' | 'name' | 'limitedByPower' | 'sinkControlMode' | 'sourceControlMode' | 'turndownability' | 'triggerOn' | 'sensorLocation', 
    value: any
  ) => {
    setState(prev => ({
      ...prev,
      loops: prev.loops.map(l => l.id === loopId ? { ...l, [field]: value } : l)
    }));
  };

  // Prepare chart data (nodes indexed bottom-to-top)
  const chartData = state.temperatures.map((temp, idx) => {
    const heightPercent = Math.round((idx / (NUM_NODES - 1)) * 100);
    return {
      node: idx,
      'Height (%)': heightPercent,
      'Temperature (°C)': Math.round(temp * 10) / 10,
    };
  });

  // Average tank temperature
  const avgTemp = Math.round((state.temperatures.reduce((a, b) => a + b, 0) / NUM_NODES) * 10) / 10;
  
  // -------------------------------------------------------------
  // Storage Analysis and KPIs Calculation (Theoretical)
  // -------------------------------------------------------------
  const activeSourcesList = state.loops.filter(l => l.isActive && l.type === 'source');
  const activeSinksList = state.loops.filter(l => l.isActive && l.type === 'sink');
  const allActiveLoops = state.loops.filter(l => l.isActive);

  const T_high = allActiveLoops.length > 0
    ? Math.max(...allActiveLoops.map(l => l.designTempSupply))
    : 90; // default to 90

  const T_low = allActiveLoops.length > 0
    ? Math.min(...allActiveLoops.map(l => l.designTempReturn))
    : 50; // default to 50

  const heatCapacityKWh = (params.tankVolume * 4180 * Math.max(0, T_high - T_low)) / 3600;
  
  // Heat stored in kWh relative to T_low (minimum envelope temperature)
  const heatStoredKWh = Math.round(
    (params.tankVolume * 4180 * Math.max(0, avgTemp - T_low)) / 3600 * 10
  ) / 10;

  // -------------------------------------------------------------
  // Richardson Number and Buoyancy calculation for display
  // -------------------------------------------------------------
  const g_grav = 9.81;
  const beta_therm = 0.0006;
  const H_t = params.tankHeight;
  const A_t = params.tankVolume / H_t;

  let maxFlow_m3s_disp = 0;
  state.loops.forEach(loop => {
    if (!loop.isActive) return;
    const actuals = getLoopActuals(loop, state.temperatures, state.ports);
    const flow_m3s = actuals.flowRate / 3600;
    if (flow_m3s > maxFlow_m3s_disp) {
      maxFlow_m3s_disp = flow_m3s;
    }
  });

  const u_vel = A_t > 0 ? (maxFlow_m3s_disp / A_t) : 0;
  const tMax_disp = Math.max(...state.temperatures);
  const tMin_disp = Math.min(...state.temperatures);
  const deltaT_disp = Math.max(0.1, tMax_disp - tMin_disp);

  let displayRi = Infinity;
  let displayEta = 1.0;
  if (u_vel > 0) {
    displayRi = (g_grav * beta_therm * deltaT_disp * H_t) / (u_vel * u_vel);
  }

  if (params.overrideBuoyancy) {
    displayEta = Math.min(1.0, Math.max(0.0, params.buoyancyOverrideValue));
  } else if (u_vel > 0) {
    // Guard against non-positive, NaN, or invalid min/max limits to prevent Infinity/NaN in log10
    const cleanMin = isNaN(params.riMin) || params.riMin <= 0 ? 0.1 : params.riMin;
    const cleanMax = isNaN(params.riMax) || params.riMax <= cleanMin ? cleanMin + 1 : params.riMax;
    
    const logMin = Math.log10(cleanMin);
    const logMax = Math.log10(cleanMax);
    if (displayRi >= cleanMax) {
      displayEta = 1.0;
    } else if (displayRi <= cleanMin) {
      displayEta = 0.0;
    } else if (logMax > logMin) {
      displayEta = (Math.log10(displayRi) - logMin) / (logMax - logMin);
    } else {
      displayEta = 1.0;
    }
  }

  // -------------------------------------------------------------
  // Internal Flow Math (Calculating centers of mass for ports)
  // -------------------------------------------------------------
  const getPortH = (id: string) => state.ports.find(p => p.id === id)?.height || 0  // -------------------------------------------------------------
  // Storage Analysis and KPIs Calculation (Theoretical) - moved up
  // -------------------------------------------------------------

  // Sum active source design power and design flow
  let totalSourcePower = 0;
  let totalSourceFlow = 0;
  state.loops.forEach(l => {
    if (l.isActive && l.type === 'source') {
      totalSourcePower += l.designPower;
      const dT = Math.abs(l.designTempSupply - l.designTempReturn);
      if (dT > 0) {
        totalSourceFlow += l.designPower / (1.161111 * dT);
      }
    }
  });

  // Sum active sink design power and design flow
  let totalSinkPower = 0;
  let totalSinkFlow = 0;
  state.loops.forEach(l => {
    if (l.isActive && l.type === 'sink') {
      totalSinkPower += l.designPower;
      const dT = Math.abs(l.designTempSupply - l.designTempReturn);
      if (dT > 0) {
        totalSinkFlow += l.designPower / (1.161111 * dT);
      }
    }
  });

  // -------------------------------------------------------------
  // Segmented Thermodynamic Capacity and Charging Time Calculation
  // -------------------------------------------------------------
  const T_baseline = allActiveLoops.length > 0
    ? Math.min(...allActiveLoops.map(l => l.designTempReturn))
    : 20; // fallback to 20°C cold reference

  // We collect all port heights from active sources
  const heightsSet = new Set<number>([0, 1]); // always include bottom (0) and top (1)
  activeSourcesList.forEach(loop => {
    const supplyPort = state.ports.find(p => p.id === loop.ports.supply);
    const returnPort = state.ports.find(p => p.id === loop.ports.return);
    if (supplyPort) heightsSet.add(supplyPort.height);
    if (returnPort) heightsSet.add(returnPort.height);
  });
  const sortedHeights = Array.from(heightsSet).sort((a, b) => a - b);

  interface Segment {
    yStart: number;
    yEnd: number;
    volume: number; // m³
    qNeeded: number; // kWh
    tMax: number; // °C
    coveringLoops: FluidLoop[];
  }

  const segments: Segment[] = [];
  for (let i = 0; i < sortedHeights.length - 1; i++) {
    const yStart = sortedHeights[i];
    const yEnd = sortedHeights[i + 1];
    const vol = params.tankVolume * (yEnd - yStart);

    // Find active sources covering this segment
    const covering = activeSourcesList.filter(loop => {
      const supplyPort = state.ports.find(p => p.id === loop.ports.supply);
      const returnPort = state.ports.find(p => p.id === loop.ports.return);
      if (!supplyPort || !returnPort) return false;
      const hMin = Math.min(supplyPort.height, returnPort.height);
      // Buoyancy-driven flow assumption: segments above a heated port are heatable
      return yStart >= hMin - 1e-5;
    });

    const tMax = covering.length > 0
      ? Math.max(...covering.map(l => l.designTempSupply))
      : T_baseline;

    const qNeeded = tMax > T_baseline
      ? (vol * 4180 * (tMax - T_baseline)) / 3600
      : 0;

    segments.push({
      yStart,
      yEnd,
      volume: vol,
      qNeeded,
      tMax,
      coveringLoops: covering
    });
  }

  const maxActiveSourceTemp = activeSourcesList.length > 0
    ? Math.max(...activeSourcesList.map(l => l.designTempSupply))
    : 0;

  const achievableCapacityKWh = segments.reduce((sum, seg) => sum + seg.qNeeded, 0);

  // Maximum thermodynamic potential capacity if the entire tank was heated to maxActiveSourceTemp from T_baseline
  const totalMaxCapacityKWh = maxActiveSourceTemp > T_baseline
    ? (params.tankVolume * 4180 * (maxActiveSourceTemp - T_baseline)) / 3600
    : 0;

  const achievablePercent = totalMaxCapacityKWh > 0
    ? Math.min(100, (achievableCapacityKWh / totalMaxCapacityKWh) * 100)
    : 0;

  // Heights and centers calculations for visual alignment in sizing modal
  const totalTankHeight = segments.reduce((sum, seg) => sum + Math.max(38, (seg.yEnd - seg.yStart) * 240), 0);

  const boundaries: { heightVal: number; topOffset: number }[] = [];
  let accumulatedHeight = 0;
  boundaries.push({ heightVal: 1.0, topOffset: 0 });
  [...segments].reverse().forEach((seg) => {
    const height = Math.max(38, (seg.yEnd - seg.yStart) * 240);
    accumulatedHeight += height;
    boundaries.push({ heightVal: seg.yStart, topOffset: accumulatedHeight });
  });

  const segmentCenters: number[] = [];
  let currentTop = 0;
  [...segments].reverse().forEach((seg) => {
    const height = Math.max(38, (seg.yEnd - seg.yStart) * 240);
    segmentCenters.push(currentTop + height / 2);
    currentTop += height;
  });

  // -------------------------------------------------------------
  // Dry-run Simulation Solver for Charging, Discharging, and Equilibrium
  // -------------------------------------------------------------
  const dryRunResults = useMemo(() => {
    const activeSources = state.loops.filter(l => l.isActive && l.type === 'source');
    const activeSinks = state.loops.filter(l => l.isActive && l.type === 'sink');

    const hasSources = activeSources.length > 0;
    const hasSinks = activeSinks.length > 0;

    // Default return baseline
    const tBaseline = activeSinks.length > 0
      ? Math.min(...activeSinks.map(l => l.designTempReturn))
      : 20;

    // Coldest return across all active loops in global state
    const returnTemps = state.loops.filter(l => l.isActive).map(l => l.designTempReturn);
    const globalColdestReturn = returnTemps.length > 0 ? Math.min(...returnTemps) : 20;

    // Target temps for sources (max achievable charge)
    const targetTemps: number[] = [];
    for (let i = 0; i < NUM_NODES; i++) {
      const fraction = i / (NUM_NODES - 1);
      const covering = activeSources.filter(loop => {
        const supplyPort = state.ports.find(p => p.id === loop.ports.supply);
        const returnPort = state.ports.find(p => p.id === loop.ports.return);
        if (!supplyPort || !returnPort) return false;
        const hMin = Math.min(supplyPort.height, returnPort.height);
        return fraction >= hMin - 1e-5;
      });

      if (covering.length > 0) {
        const tMax = Math.max(...covering.map(l => l.designTempSupply));
        targetTemps.push(tMax);
      } else {
        targetTemps.push(globalColdestReturn);
      }
    }

    // 1. Calculate Charging Time (sources active, sinks inactive)
    // Starts at globalColdestReturn, targets targetTemps
    let chargeTime = Infinity;
    if (hasSources) {
      let currentT = Array(NUM_NODES).fill(globalColdestReturn);
      let currentLoops = state.loops.map(l => ({ ...l, isActive: l.type === 'source' ? l.isActive : false }));
      const dt = 15.0;
      let elapsed = 0;
      const maxSteps = 2400;
      let solved = false;
      for (let step = 0; step < maxSteps; step++) {
        const isDone = currentT.every((temp, idx) => temp >= targetTemps[idx] - 0.5);
        if (isDone) {
          chargeTime = elapsed / 3600;
          solved = true;
          break;
        }
        const allOff = currentLoops.every(l => {
          if (!l.isActive || l.isShutDown) return true;
          return getLoopActuals(l, currentT, state.ports).actualPower < 0.1;
        });
        if (allOff) {
          chargeTime = elapsed / 3600;
          solved = true;
          break;
        }
        const result = simulateStep({ temperatures: currentT, ports: state.ports, loops: currentLoops }, params, dt);
        currentT = result.temperatures;
        currentLoops = result.loops;
        elapsed += dt;
      }
      if (!solved) chargeTime = elapsed / 3600;
    }

    // 2. Calculate Discharging Time (sources inactive, sinks active)
    // Starts at targetTemps (or T_high if no sources), targets globalColdestReturn
    let dischargeTime = Infinity;
    if (hasSinks) {
      const startTemps = hasSources ? targetTemps : Array(NUM_NODES).fill(T_high);
      let currentT = [...startTemps];
      let currentLoops = state.loops.map(l => ({ ...l, isActive: l.type === 'sink' ? l.isActive : false }));
      const dt = 15.0;
      let elapsed = 0;
      const maxSteps = 2400;
      let solved = false;
      for (let step = 0; step < maxSteps; step++) {
        const isDone = currentT.every(temp => temp <= globalColdestReturn + 0.5);
        if (isDone) {
          dischargeTime = elapsed / 3600;
          solved = true;
          break;
        }
        const allOff = currentLoops.every(l => {
          if (!l.isActive || l.isShutDown) return true;
          return getLoopActuals(l, currentT, state.ports).actualPower < 0.1;
        });
        if (allOff) {
          dischargeTime = elapsed / 3600;
          solved = true;
          break;
        }
        const result = simulateStep({ temperatures: currentT, ports: state.ports, loops: currentLoops }, params, dt);
        currentT = result.temperatures;
        currentLoops = result.loops;
        elapsed += dt;
      }
      if (!solved) dischargeTime = elapsed / 3600;
    }

    // 3. Find Equilibrium Profile (both active sources and sinks running)
    let eqProfile = Array(NUM_NODES).fill(globalColdestReturn);
    if (hasSources || hasSinks) {
      let currentT = Array(NUM_NODES).fill(globalColdestReturn);
      let currentLoops = state.loops.map(l => ({ ...l }));
      const dt = 15.0;
      const maxSteps = 2400;
      let prevT = [...currentT];
      let foundEq = false;
      for (let step = 0; step < maxSteps; step++) {
        const result = simulateStep({ temperatures: currentT, ports: state.ports, loops: currentLoops }, params, dt);
        currentT = result.temperatures;
        currentLoops = result.loops;
        const maxChange = Math.max(...currentT.map((t, idx) => Math.abs(t - prevT[idx])));
        if (maxChange < 0.0005 && step > 10) {
          eqProfile = currentT;
          foundEq = true;
          break;
        }
        prevT = [...currentT];
      }
      if (!foundEq) eqProfile = currentT;
    }

    // 4. Calculate time to reach equilibrium from fully drained
    let drainedToEqTime = Infinity;
    if (hasSources || hasSinks) {
      let currentT = Array(NUM_NODES).fill(globalColdestReturn);
      let currentLoops = state.loops.map(l => ({ ...l }));
      const dt = 15.0;
      let elapsed = 0;
      const maxSteps = 2400;
      let solved = false;
      for (let step = 0; step < maxSteps; step++) {
        const isDone = currentT.every((temp, idx) => Math.abs(temp - eqProfile[idx]) < 0.5);
        if (isDone) {
          drainedToEqTime = elapsed / 3600;
          solved = true;
          break;
        }
        const result = simulateStep({ temperatures: currentT, ports: state.ports, loops: currentLoops }, params, dt);
        currentT = result.temperatures;
        currentLoops = result.loops;
        elapsed += dt;
      }
      if (!solved) drainedToEqTime = elapsed / 3600;
    }

    // 5. Calculate time to reach equilibrium from fully charged (max achievable)
    let chargedToEqTime = Infinity;
    if (hasSources || hasSinks) {
      const startTemps = hasSources ? targetTemps : Array(NUM_NODES).fill(T_high);
      let currentT = [...startTemps];
      let currentLoops = state.loops.map(l => ({ ...l }));
      const dt = 15.0;
      let elapsed = 0;
      const maxSteps = 2400;
      let solved = false;
      for (let step = 0; step < maxSteps; step++) {
        const isDone = currentT.every((temp, idx) => Math.abs(temp - eqProfile[idx]) < 0.5);
        if (isDone) {
          chargedToEqTime = elapsed / 3600;
          solved = true;
          break;
        }
        const result = simulateStep({ temperatures: currentT, ports: state.ports, loops: currentLoops }, params, dt);
        currentT = result.temperatures;
        currentLoops = result.loops;
        elapsed += dt;
      }
      if (!solved) chargedToEqTime = elapsed / 3600;
    }

    return {
      chargeTime,
      dischargeTime,
      eqProfile,
      drainedToEqTime,
      chargedToEqTime
    };
  }, [state.temperatures, state.loops, state.ports, params, T_high]);

  const eqSegments = useMemo(() => {
    const activeLoops = state.loops.filter(l => l.isActive);
    const activePorts = state.ports.filter(p => activeLoops.some(l => l.ports.supply === p.id || l.ports.return === p.id));
    const heights = [0, 1.0, ...activePorts.map(p => p.height)];
    const uniqueHeights = Array.from(new Set(heights)).sort((a, b) => b - a);
    
    const segs: {
      yStart: number;
      yEnd: number;
      volume: number;
      eqTemp: number;
      coveringSources: LoopConfig[];
      coveringSinks: LoopConfig[];
    }[] = [];
    
    for (let i = 0; i < uniqueHeights.length - 1; i++) {
      const yStart = uniqueHeights[i];
      const yEnd = uniqueHeights[i + 1];
      const vol = params.tankVolume * (yStart - yEnd);
      
      const coveringSources = activeLoops.filter(l => {
        if (l.type !== 'source') return false;
        const supplyPort = state.ports.find(p => p.id === l.ports.supply);
        const returnPort = state.ports.find(p => p.id === l.ports.return);
        if (!supplyPort || !returnPort) return false;
        const hMin = Math.min(supplyPort.height, returnPort.height);
        return yStart >= hMin - 1e-5;
      });

      const coveringSinks = activeLoops.filter(l => {
        if (l.type !== 'sink') return false;
        const supplyPort = state.ports.find(p => p.id === l.ports.supply);
        const returnPort = state.ports.find(p => p.id === l.ports.return);
        if (!supplyPort || !returnPort) return false;
        const hMin = Math.min(supplyPort.height, returnPort.height);
        const hMax = Math.max(supplyPort.height, returnPort.height);
        return yStart <= hMax + 1e-5 && yEnd >= hMin - 1e-5;
      });
      
      const nodeStart = Math.max(0, Math.min(NUM_NODES - 1, Math.round(yEnd * (NUM_NODES - 1))));
      const nodeEnd = Math.max(0, Math.min(NUM_NODES - 1, Math.round(yStart * (NUM_NODES - 1))));
      
      let sumT = 0;
      let count = 0;
      for (let n = nodeStart; n <= nodeEnd; n++) {
        sumT += dryRunResults.eqProfile[n];
        count++;
      }
      const eqTemp = count > 0 ? sumT / count : dryRunResults.eqProfile[nodeStart];
      
      segs.push({
        yStart,
        yEnd,
        volume: vol,
        eqTemp,
        coveringSources,
        coveringSinks
      });
    }
    return segs;
  }, [state.loops, state.ports, params.tankVolume, dryRunResults.eqProfile]);

  const calculatedChargeTimeHours = dryRunResults.chargeTime;
  const timeToDischargeOnly = dryRunResults.dischargeTime;

  const activeSinksCount = state.loops.filter(l => l.isActive && l.type === 'sink').length;
  const chargeFromDrainedTime = activeSinksCount > 0 ? dryRunResults.drainedToEqTime : dryRunResults.chargeTime;
  const dischargeFromMaxTime = activeSinksCount > 0 ? dryRunResults.chargedToEqTime : 0;

  const equilibriumCapacityKWh = eqSegments.reduce((sum, seg) => sum + (seg.eqTemp > T_baseline ? (seg.volume * 4180 * (seg.eqTemp - T_baseline)) / 3600 : 0), 0);
  const equilibriumPercent = totalMaxCapacityKWh > 0 ? Math.min(100, (equilibriumCapacityKWh / totalMaxCapacityKWh) * 100) : 0;


  const formatTime = (hours: number) => {
    if (!isFinite(hours) || hours <= 0) return '—';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
  };

  const minTime = tempHistory.length > 0 ? tempHistory[0].time : 0;
  const maxTime = tempHistory.length > 0 ? Math.max(minTime + 0.1, tempHistory[tempHistory.length - 1].time) : 1;

  return (
    <div className="h-screen bg-slate-950 text-slate-100 font-sans flex flex-col antialiased overflow-hidden">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-4">
          <a 
            href={import.meta.env.DEV ? "http://localhost:5000/" : "../../index.html"} 
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition duration-200 border border-slate-700/50 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" />
          </a>
          <div>
            <div className="flex items-center space-x-2">
              <span className="bg-orange-500/10 text-orange-400 text-xs px-2.5 py-0.5 rounded-full border border-orange-500/20 font-medium tracking-wide">
                Thermal Storage
              </span>
              <h1 className="text-xl font-bold tracking-tight text-white">Stratified Tank Calculator</h1>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Simulate stratified thermal energy storage with drag-and-drop connections</p>
          </div>
        </div>

        {/* Sim Controls Group */}
        <div className="flex items-center space-x-3">
          {/* Config Export/Import */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1.5 shadow-inner">
            <button
              onClick={handleSaveConfig}
              className="flex items-center space-x-1 px-2.5 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg text-xs font-semibold transition cursor-pointer"
              title="Export complete simulation configuration to JSON"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export</span>
            </button>
            <div className="h-5 w-px bg-slate-800 my-auto mx-1"></div>
            <label
              className="flex items-center space-x-1 px-2.5 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg text-xs font-semibold transition cursor-pointer"
              title="Import saved simulation configuration from JSON"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Import</span>
              <input
                type="file"
                accept=".json"
                onChange={handleLoadConfig}
                className="hidden"
              />
            </label>
          </div>

          {/* Sim Controls */}
          <div className="relative flex items-center space-x-3 bg-slate-950 border border-slate-800 rounded-xl p-1.5 shadow-inner">
            <button
              onClick={() => setIsPaused(prev => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition duration-200 cursor-pointer ${
                !isPaused 
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' 
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              }`}
            >
              {!isPaused ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Run</span>
                </>
              )}
            </button>
            
            <button
              onClick={() => setShowResetDropdown(prev => !prev)}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition duration-200 cursor-pointer"
              title="Reset Simulation Options"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {showResetDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-20 cursor-default" 
                  onClick={() => setShowResetDropdown(false)} 
                />
                <div className="absolute left-[-20px] md:left-auto md:right-0 top-11 w-48 bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-1 z-30 select-none animate-fade-in text-[11px] text-slate-350">
                  <button
                    onClick={() => {
                      resetProfile('fullyCharged');
                      setShowResetDropdown(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-slate-350 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Fully charged
                  </button>
                  <button
                    onClick={() => {
                      resetProfile('maxAchievable');
                      setShowResetDropdown(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-slate-350 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Max achievable charge
                  </button>
                  <button
                    onClick={() => {
                      resetProfile('stratified');
                      setShowResetDropdown(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-slate-350 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Linearly stratified
                  </button>
                  <button
                    onClick={() => {
                      resetProfile('fullyDrained');
                      setShowResetDropdown(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-slate-350 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Fully drained
                  </button>
                </div>
              </>
            )}

            <div className="h-6 w-px bg-slate-800 my-auto"></div>

            <div className="flex items-center space-x-2 px-2 text-xs">
              <span className="text-slate-500">Speed:</span>
              <select
                value={simSpeed}
                onChange={(e) => setSimSpeed(Number(e.target.value))}
                className="bg-transparent text-slate-300 font-semibold focus:outline-none border-none cursor-pointer"
              >
                <option value={1} className="bg-slate-900">1x (Realtime)</option>
                <option value={10} className="bg-slate-900">10x</option>
                <option value={100} className="bg-slate-900">100x</option>
                <option value={500} className="bg-slate-900">500x</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center space-x-6 text-sm">
          <div className="flex items-center space-x-3 hidden sm:flex">
            <div className="text-right">
              <div className="text-xs text-slate-500 font-medium">Elapsed Time</div>
              <div className="font-mono text-slate-200 font-semibold">
                {formatElapsedTime(elapsedTime)}
              </div>
            </div>
            <button 
              onClick={handleResetTimer}
              className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-red-400 rounded-lg transition duration-200 cursor-pointer flex items-center justify-center"
              title="Reset Timer & Temp History Graph"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
          <button 
            onClick={() => setShowHelp(!showHelp)}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition duration-200 cursor-pointer"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-row overflow-hidden relative">
        
        <div 
          className={`bg-slate-900/60 border-r border-slate-800 backdrop-blur transition-all duration-300 flex flex-col relative ${
            leftPanelOpen ? 'w-[320px] p-5 opacity-100' : 'w-0 p-0 opacity-0 overflow-hidden'
          }`}
        >
          {leftPanelOpen && (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <h3 className="font-semibold text-sm text-slate-300 mb-4 flex items-center space-x-2">
                <Settings className="w-4 h-4 text-cyan-400" />
                <span>Physical Parameters</span>
              </h3>
              
              <div className="space-y-5 flex-1 flex flex-col justify-start">
                <div>
                  <div className="flex justify-between text-slate-400 mb-1 text-xs">
                    <span>Tank Height</span>
                    <span className="font-mono text-slate-200">{params.tankHeight} m</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="4" 
                    step="0.1"
                    value={params.tankHeight} 
                    onChange={(e) => setParams(prev => ({ ...prev, tankHeight: Number(e.target.value) }))}
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-white"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1 text-xs">
                    <span>Heat Loss Coefficient (U)</span>
                    <span className="font-mono text-slate-200">{params.heatLossCoef} W/m²K</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="3.0" 
                    step="0.1"
                    value={params.heatLossCoef} 
                    onChange={(e) => setParams(prev => ({ ...prev, heatLossCoef: Number(e.target.value) }))}
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-white"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1 text-xs">
                    <span>Internal Conduction / Mixing</span>
                    <span className="font-mono text-slate-200">{params.conductionCoef} W/K</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="10.0" 
                    step="0.1"
                    value={params.conductionCoef} 
                    onChange={(e) => setParams(prev => ({ ...prev, conductionCoef: Number(e.target.value) }))}
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-white"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1 text-xs">
                    <span>Ambient Temperature</span>
                    <span className="font-mono text-slate-200">{params.ambientTemp} °C</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="45" 
                    step="1"
                    value={params.ambientTemp} 
                    onChange={(e) => setParams(prev => ({ ...prev, ambientTemp: Number(e.target.value) }))}
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-white"
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Animation Factor</span>
                  <input 
                    type="number" 
                    step="0.1"
                    min="0.01"
                    value={flowDurationFactor} 
                    onChange={(e) => setFlowDurationFactor(Number(e.target.value))}
                    className="w-16 bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 text-right font-mono text-xs text-white focus:outline-none focus:border-slate-700 hover:border-slate-800"
                  />
                </div>

                <div className="flex items-center justify-between text-xs border-t border-slate-800/80 pt-3">
                  <span className="text-slate-400 font-semibold">Override Buoyancy</span>
                  <label className="relative inline-flex items-center cursor-pointer scale-75">
                    <input
                      type="checkbox"
                      checked={params.overrideBuoyancy}
                      onChange={(e) => setParams(prev => ({ ...prev, overrideBuoyancy: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4.5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-white peer-checked:after:bg-slate-900"></div>
                  </label>
                </div>

                {params.overrideBuoyancy ? (
                  <div>
                    <div className="flex justify-between text-slate-400 mb-1 text-[10px]">
                      <span>Manual Effectiveness</span>
                      <span className="font-mono text-slate-200">{(params.buoyancyOverrideValue * 100).toFixed(0)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01"
                      value={params.buoyancyOverrideValue} 
                      onChange={(e) => setParams(prev => ({ ...prev, buoyancyOverrideValue: Number(e.target.value) }))}
                      className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-white"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col space-y-2 text-xs text-slate-400">
                    <div className="flex items-center justify-between">
                      <span>Short-Circuit Ri Limit</span>
                      <input 
                        type="number"
                        min="0.1"
                        value={params.riMin} 
                        onChange={(e) => setParams(prev => ({ ...prev, riMin: Number(e.target.value) }))}
                        className="w-14 bg-slate-950 border border-slate-850 rounded px-1 py-0.5 text-right font-mono text-xs text-white focus:outline-none focus:border-slate-700 hover:border-slate-800"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Stratified Ri Limit</span>
                      <input 
                        type="number"
                        min="1.0"
                        value={params.riMax} 
                        onChange={(e) => setParams(prev => ({ ...prev, riMax: Number(e.target.value) }))}
                        className="w-14 bg-slate-950 border border-slate-850 rounded px-1 py-0.5 text-right font-mono text-xs text-white focus:outline-none focus:border-slate-700 hover:border-slate-800"
                      />
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-800/80 pt-3 mt-auto flex items-center justify-between text-xs">
                  <div className="flex flex-col">
                    <span className="text-slate-500 font-medium">Richardson (Ri)</span>
                    <span className="font-mono text-slate-300 font-semibold mt-0.5">
                      {displayRi === Infinity ? '∞' : displayRi.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-slate-500 font-medium">Buoyancy Eff.</span>
                    <span className="font-mono text-slate-300 font-semibold mt-0.5">
                      {(displayEta * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setLeftPanelOpen(!leftPanelOpen)}
          style={{ left: leftPanelOpen ? '320px' : '0px' }}
          className="absolute top-1/2 -translate-y-1/2 z-40 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white p-1 rounded-r-lg border-y border-r border-slate-800 shadow-lg transition-all duration-300 flex items-center justify-center cursor-pointer h-12 w-5"
          title={leftPanelOpen ? "Hide parameters" : "Show parameters"}
        >
          {leftPanelOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        <div className="flex-1 flex flex-col p-6 overflow-y-auto min-w-0">
          <main className="flex-1 flex flex-col w-full space-y-6">
            
            <div className="w-full flex flex-col items-center">

              <div className="w-full flex items-center justify-center relative min-h-[580px]">
                {showHelp && (
                  <div className="absolute inset-0 bg-slate-950/95 z-40 p-8 flex flex-col justify-center rounded-2xl border border-slate-800/60 overflow-y-auto max-w-[1300px] mx-auto">
                    <h3 className="text-lg font-bold text-white mb-4">Stratified Tank Simulation Help</h3>
                    <ul className="space-y-3 text-sm text-slate-300">
                      <li className="flex items-start space-x-2">
                        <span className="text-orange-400 font-bold">•</span>
                        <span><strong>Move Loop Position</strong>: Use the up/down arrows in the loop headers on the left (sources) and right (sinks) columns to swap loop positions.</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <span className="text-orange-400 font-bold">•</span>
                        <span><strong>Draggable Ports</strong>: Drag the port handles directly along the side boundaries of the tank to adjust connection heights.</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <span className="text-orange-400 font-bold">•</span>
                        <span><strong>Control Modes</strong>: Edit design parameters and configure control modes (Unrestricted, Temp Limited, Controlled) in expanded menus.</span>
                      </li>
                    </ul>
                    <button 
                      onClick={() => setShowHelp(false)}
                      className="mt-6 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium py-2 rounded-xl text-sm transition"
                    >
                      Close Help Guide
                    </button>
                  </div>
                )}

                <div 
                  ref={containerRef}
                  id="diagram-canvas" 
                  style={{ height: `${canvasHeight}px` }}
                  className="w-full max-w-[1300px] relative bg-slate-900/10 border border-slate-800/80 rounded-2xl shadow-2xl transition-all duration-150"
                >
                  
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                    <defs>
                      {state.loops.map(loop => (
                        <marker
                          key={`arrow-${loop.id}`}
                          id={`arrow-${loop.id}`}
                          viewBox="0 0 10 10"
                          refX="6"
                          refY="5"
                          markerWidth="6"
                          markerHeight="6"
                          orient="auto-start-reverse"
                        >
                          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={loop.color} />
                        </marker>
                      ))}
                    </defs>

                    {state.loops.map(loop => {
                      if (!loop.isActive) return null;
                      const supplyPort = state.ports.find(p => p.id === loop.ports.supply);
                      const returnPort = state.ports.find(p => p.id === loop.ports.return);
                      if (!supplyPort || !returnPort) return null;

                      const box = boxPositions[loop.id];
                      const isSource = loop.type === 'source';

                      const supplyPortY = tankTop + tankHeight * (1 - supplyPort.height);
                      const returnPortY = tankTop + tankHeight * (1 - returnPort.height);

                      let supplyPath = "";
                      let returnPath = "";
                      const dx = 50; 

                      if (isSource) {
                        const x1_s = box.x + 280;
                        const y1_s = box.y + 25;
                        const x2_s = tankLeft;
                        const y2_s = supplyPortY;

                        supplyPath = `M ${x1_s} ${y1_s} L ${x1_s + 20} ${y1_s} C ${x1_s + 20 + dx} ${y1_s}, ${x2_s - 20 - dx} ${y2_s}, ${x2_s - 20} ${y2_s} L ${x2_s} ${y2_s}`;

                        const isExpanded = expandedBoxes[loop.id];
                        const boxH = getBoxHeight(loop.id, isExpanded);
                        const x1_r = tankLeft;
                        const y1_r = returnPortY;
                        const x2_r = box.x + 280;
                        const y2_r = box.y + boxH - 25;

                        returnPath = `M ${x1_r} ${y1_r} L ${x1_r - 20} ${y1_r} C ${x1_r - 20 - dx} ${y1_r}, ${x2_r + 20 + dx} ${y2_r}, ${x2_r + 20} ${y2_r} L ${x2_r} ${y2_r}`;
                      } else {
                        const x1_d = tankRight;
                        const y1_d = returnPortY;
                        const x2_d = box.x;
                        const y2_d = box.y + 25;

                        supplyPath = `M ${x1_d} ${y1_d} L ${x1_d + 20} ${y1_d} C ${x1_d + 20 + dx} ${y1_d}, ${x2_d - 20 - dx} ${y2_d}, ${x2_d - 20} ${y2_d} L ${x2_d} ${y2_d}`;

                        const isExpanded = expandedBoxes[loop.id];
                        const boxH = getBoxHeight(loop.id, isExpanded);
                        const x1_r = box.x;
                        const y1_r = box.y + boxH - 25;
                        const x2_r = tankRight;
                        const y2_r = supplyPortY;

                        returnPath = `M ${x1_r} ${y1_r} L ${x1_r - 20} ${y1_r} C ${x1_r - 20 - dx} ${y1_r}, ${x2_r + 20 + dx} ${y2_r}, ${x2_r + 20} ${y2_r} L ${x2_r} ${y2_r}`;
                      }

                      const actuals = getLoopActuals(loop, state.temperatures, state.ports);
                      const animDuration = actuals.flowRate > 0 ? (flowDurationFactor / actuals.flowRate) : 0;

                      return (
                        <g key={`lines-${loop.id}`}>
                          <path d={supplyPath} fill="none" stroke={loop.color} strokeWidth="6" opacity="0.1" />
                          <path d={returnPath} fill="none" stroke={loop.color} strokeWidth="6" opacity="0.1" />
                          
                          <path
                            d={supplyPath}
                            fill="none"
                            stroke={loop.color}
                            strokeWidth="2.5"
                            opacity="0.75"
                            strokeDasharray="8 6"
                            markerEnd={`url(#arrow-${loop.id})`}
                            className={animDuration > 0 ? "animate-[dash_10s_linear_infinite]" : ""}
                            style={animDuration > 0 ? { 
                              animationDuration: `${animDuration}s`,
                              animationPlayState: isPaused ? 'paused' : 'running'
                            } : {}}
                          />
                          <path
                            d={returnPath}
                            fill="none"
                            stroke={loop.color}
                            strokeWidth="2.5"
                            opacity="0.75"
                            strokeDasharray="8 6"
                            markerEnd={`url(#arrow-${loop.id})`}
                            className={animDuration > 0 ? "animate-[dash_10s_linear_infinite]" : ""}
                            style={animDuration > 0 ? { 
                              animationDuration: `${animDuration}s`,
                              animationPlayState: isPaused ? 'paused' : 'running'
                            } : {}}
                          />
                        </g>
                      );
                    })}
                  </svg>

                  {(() => {
                    const leftBadges: PipelineBadgeItem[] = [];
                    const rightBadges: PipelineBadgeItem[] = [];

                    state.loops.forEach(loop => {
                      if (!loop.isActive) return;
                      const supplyPort = state.ports.find(p => p.id === loop.ports.supply);
                      const returnPort = state.ports.find(p => p.id === loop.ports.return);
                      if (!supplyPort || !returnPort) return;

                      const box = boxPositions[loop.id];
                      const isExpanded = expandedBoxes[loop.id];
                      const isSource = loop.type === 'source';
                      const boxH = getBoxHeight(loop.id, isExpanded);

                      const supplyPortY = tankTop + tankHeight * (1 - supplyPort.height);
                      const returnPortY = tankTop + tankHeight * (1 - returnPort.height);

                      const actuals = getLoopActuals(loop, state.temperatures, state.ports);

                      if (isSource) {
                        // Supply badge (top badge)
                        const x1_s = box.x + 280;
                        const y1_s = box.y + 25;
                        const x2_s = tankLeft;
                        const y2_s = supplyPortY;
                        const supplyMid = getMidpoint(x1_s, y1_s, x2_s, y2_s, 0.5);

                        leftBadges.push({
                          id: `${loop.id}-supply`,
                          loopId: loop.id,
                          type: 'supply',
                          side: 'left',
                          x1: x1_s,
                          y1: y1_s,
                          x2: x2_s,
                          y2: y2_s,
                          portY: supplyPortY,
                          isPort2: true,
                          defaultY: supplyMid.y,
                          t: 0.5,
                          flowRate: actuals.flowRate,
                          temp: actuals.tempIn,
                          color: loop.color,
                          isHotLine: true
                        });

                        // Return badge (bottom badge)
                        const x1_r = tankLeft;
                        const y1_r = returnPortY;
                        const x2_r = box.x + 280;
                        const y2_r = box.y + boxH - 25;
                        const returnMid = getMidpoint(x1_r, y1_r, x2_r, y2_r, 0.5);

                        leftBadges.push({
                          id: `${loop.id}-return`,
                          loopId: loop.id,
                          type: 'return',
                          side: 'left',
                          x1: x1_r,
                          y1: y1_r,
                          x2: x2_r,
                          y2: y2_r,
                          portY: returnPortY,
                          isPort2: false,
                          defaultY: returnMid.y,
                          t: 0.5,
                          flowRate: actuals.flowRate,
                          temp: actuals.tempOut,
                          color: loop.color,
                          isHotLine: false
                        });
                      } else {
                        // Supply badge (top badge)
                        const x1_d = tankRight;
                        const y1_d = returnPortY;
                        const x2_d = box.x;
                        const y2_d = box.y + 25;
                        const supplyMid = getMidpoint(x1_d, y1_d, x2_d, y2_d, 0.5);

                        rightBadges.push({
                          id: `${loop.id}-supply`,
                          loopId: loop.id,
                          type: 'supply',
                          side: 'right',
                          x1: x1_d,
                          y1: y1_d,
                          x2: x2_d,
                          y2: y2_d,
                          portY: returnPortY,
                          isPort2: false,
                          defaultY: supplyMid.y,
                          t: 0.5,
                          flowRate: actuals.flowRate,
                          temp: actuals.tempOut,
                          color: loop.color,
                          isHotLine: true
                        });

                        // Return badge (bottom badge)
                        const x1_r = box.x;
                        const y1_r = box.y + boxH - 25;
                        const x2_r = tankRight;
                        const y2_r = supplyPortY;
                        const returnMid = getMidpoint(x1_r, y1_r, x2_r, y2_r, 0.5);

                        rightBadges.push({
                          id: `${loop.id}-return`,
                          loopId: loop.id,
                          type: 'return',
                          side: 'right',
                          x1: x1_r,
                          y1: y1_r,
                          x2: x2_r,
                          y2: y2_r,
                          portY: supplyPortY,
                          isPort2: true,
                          defaultY: returnMid.y,
                          t: 0.5,
                          flowRate: actuals.flowRate,
                          temp: actuals.tempIn,
                          color: loop.color,
                          isHotLine: false
                        });
                      }
                    });

                    const threshold = 38;
                    const shiftAmount = 0.22;

                    const getBadgeY = (b: PipelineBadgeItem) => {
                      const mid = getMidpoint(b.x1, b.y1, b.x2, b.y2, b.t);
                      return mid.y;
                    };

                    const moveCloserToPort = (b: PipelineBadgeItem) => {
                      if (b.isPort2) {
                        b.t = 0.5 + shiftAmount;
                      } else {
                        b.t = 0.5 - shiftAmount;
                      }
                    };

                    const moveCloserToBox = (b: PipelineBadgeItem) => {
                      if (b.isPort2) {
                        b.t = 0.5 - shiftAmount;
                      } else {
                        b.t = 0.5 + shiftAmount;
                      }
                    };

                    const resolveOverlapsForSide = (badges: PipelineBadgeItem[]) => {
                      for (let iter = 0; iter < 3; iter++) {
                        badges.sort((a, b) => getBadgeY(a) - getBadgeY(b));
                        let adjusted = false;
                        for (let i = 0; i < badges.length - 1; i++) {
                          const badgeA = badges[i];
                          const badgeB = badges[i + 1];
                          const yA = getBadgeY(badgeA);
                          const yB = getBadgeY(badgeB);
                          if (yB - yA < threshold) {
                            if (badgeB.portY > badgeA.portY) {
                              moveCloserToPort(badgeB);
                              moveCloserToBox(badgeA);
                            } else {
                              moveCloserToPort(badgeA);
                              moveCloserToBox(badgeB);
                            }
                            adjusted = true;
                          }
                        }
                        if (!adjusted) break;
                      }
                    };

                    resolveOverlapsForSide(leftBadges);
                    resolveOverlapsForSide(rightBadges);

                    const allBadges = [...leftBadges, ...rightBadges];

                    return allBadges.map(badge => {
                      const pos = getMidpoint(badge.x1, badge.y1, badge.x2, badge.y2, badge.t);
                      return (
                        <div
                          key={badge.id}
                          style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}
                          className="absolute z-30 bg-slate-950/95 border border-slate-800 text-[10px] font-mono px-2 py-1 rounded shadow-lg pointer-events-none flex flex-col items-center justify-center leading-normal"
                        >
                          <span className="text-slate-400 text-[9px]">{badge.flowRate.toFixed(2)} m³/h</span>
                          <span 
                            style={badge.isHotLine ? { color: badge.color } : {}} 
                            className={`font-bold text-[9px] mt-0.5 ${badge.isHotLine ? "" : "text-slate-300"}`}
                          >
                            {badge.temp.toFixed(1)}°C
                          </span>
                        </div>
                      );
                    });
                  })()}

                  <div 
                    className="absolute top-[20px] flex flex-col items-center justify-center text-center select-none" 
                    style={{ left: `${tankLeft - 50}px`, width: '250px' }}
                  >
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                      Envelope: {T_low.toFixed(0)}°C — {T_high.toFixed(0)}°C
                    </span>
                    <span className="text-[11px] text-emerald-400 font-bold mt-0.5 flex items-center justify-center space-x-2">
                      <span className="text-amber-400">Stored: {heatStoredKWh.toFixed(1)} kWh</span>
                      <span className="text-slate-500 font-normal">|</span>
                      <span>Cap: {heatCapacityKWh.toFixed(1)} kWh</span>
                    </span>
                  </div>

                  <div 
                    ref={tankRef}
                    style={{ left: `${tankLeft}px`, top: `${tankTop}px`, width: '150px', height: `${tankHeight}px` }}
                    className="absolute border-4 border-slate-800 rounded-3xl overflow-hidden bg-slate-950 shadow-[0_0_40px_rgba(30,41,59,0.35)] flex flex-col z-10"
                  >
                    {state.temperatures.slice().reverse().map((temp, index) => {
                      const nodeIndex = NUM_NODES - 1 - index;
                      return (
                        <div 
                          key={nodeIndex}
                          style={{ 
                            backgroundColor: getTempColor(temp),
                            height: `${100 / NUM_NODES}%`
                          }}
                          className="w-full border-b border-white/[0.03] last:border-b-0"
                        />
                      );
                    })}

                    <div className="absolute inset-0 pointer-events-none z-20" style={{ zIndex: 20 }}>
                      {(() => {
                        interface FlowNode {
                          id: string;
                          loopId: string;
                          x: number;
                          y: number;
                          height: number;
                          flow: number;
                          color: string;
                        }

                        interface MatchedPath {
                          d: string;
                          flow: number;
                          isCross: boolean;
                          inletX: number;
                          inletY: number;
                          outletX: number;
                          outletY: number;
                        }

                        const activeInlets: FlowNode[] = [];
                        const activeOutlets: FlowNode[] = [];
                        const tol = 0.001;

                        state.loops.forEach(loop => {
                          if (!loop.isActive) return;
                          const actuals = getLoopActuals(loop, state.temperatures, state.ports);
                          if (actuals.flowRate <= tol) return;

                          const supplyPort = state.ports.find(p => p.id === loop.ports.supply);
                          const returnPort = state.ports.find(p => p.id === loop.ports.return);

                          if (supplyPort && returnPort) {
                            const isLeft = loop.type === 'source';
                            
                            activeInlets.push({
                              id: supplyPort.id,
                              loopId: loop.id,
                              x: isLeft ? 0 : 150,
                              y: (1 - supplyPort.height) * tankHeight,
                              height: supplyPort.height,
                              flow: actuals.flowRate,
                              color: supplyPort.color
                            });

                            activeOutlets.push({
                              id: returnPort.id,
                              loopId: loop.id,
                              x: isLeft ? 0 : 150,
                              y: (1 - returnPort.height) * tankHeight,
                              height: returnPort.height,
                              flow: actuals.flowRate,
                              color: returnPort.color
                            });
                          }
                        });

                        activeInlets.sort((a, b) => b.height - a.height);
                        activeOutlets.sort((a, b) => b.height - a.height);

                        const paths: MatchedPath[] = [];
                        const inletsTemp = activeInlets.map(node => ({ ...node }));
                        const outletsTemp = activeOutlets.map(node => ({ ...node }));

                        let i = 0;
                        let j = 0;

                        while (i < inletsTemp.length && j < outletsTemp.length) {
                          const inlet = inletsTemp[i];
                          const outlet = outletsTemp[j];

                          const matchedFlow = Math.min(inlet.flow, outlet.flow);
                          if (matchedFlow > tol) {
                            let pathD = "";
                            const isCross = inlet.x !== outlet.x;
                            if (!isCross) {
                              pathD = `M ${inlet.x} ${inlet.y} C 75 ${inlet.y}, 75 ${outlet.y}, ${outlet.x} ${outlet.y}`;
                            } else {
                              pathD = `M ${inlet.x} ${inlet.y} L ${outlet.x} ${outlet.y}`;
                            }

                            paths.push({
                              d: pathD,
                              flow: matchedFlow,
                              isCross,
                              inletX: inlet.x,
                              inletY: inlet.y,
                              outletX: outlet.x,
                              outletY: outlet.y
                            });

                            inlet.flow -= matchedFlow;
                            outlet.flow -= matchedFlow;
                          }

                          if (inlet.flow <= tol) i++;
                          if (outlet.flow <= tol) j++;
                        }

                        return (
                          <>
                            <svg className="w-full h-full absolute inset-0 z-10" style={{ zIndex: 10 }}>
                              {paths.map((p, idx) => {
                                const baseDur = p.isCross ? 1.0 : 1.33;
                                const dur = p.flow > 0 ? ((baseDur * flowDurationFactor) / p.flow) : 0;
                                return (
                                  <path
                                    key={`internal-path-${idx}`}
                                    d={p.d}
                                    fill="none"
                                    stroke="rgba(255, 255, 255, 0.45)"
                                    strokeWidth="2.5"
                                    strokeDasharray="6 5"
                                    className={dur > 0 ? "animate-[dash_10s_linear_infinite]" : ""}
                                    style={dur > 0 ? { 
                                      animationDuration: `${dur}s`,
                                      animationPlayState: isPaused ? 'paused' : 'running'
                                    } : {}}
                                  />
                                );
                              })}
                            </svg>

                            {paths.map((p, idx) => {
                              if (p.flow <= 0.01) return null;
                              
                              let midX = 0;
                              let midY = (p.inletY + p.outletY) / 2;
                              if (p.inletX === p.outletX) {
                                midX = p.inletX === 0 ? 56.25 : 93.75;
                              } else {
                                midX = (p.inletX + p.outletX) / 2;
                              }

                              // Shift flow badge (jump on top of or below the Mid badge at the center) to prevent overlap
                              const midYCenter = tankHeight / 2;
                              let displayY = midY;
                              if (midY >= midYCenter - 35 && midY <= midYCenter + 35) {
                                if (p.inletY <= p.outletY) {
                                  displayY = midYCenter - 35; // Jump to just on top of Mid label
                                } else {
                                  displayY = midYCenter + 35; // Jump to just below Mid label
                                }
                              }

                              return (
                                <div
                                  key={`internal-badge-${idx}`}
                                  style={{ left: `${midX}px`, top: `${displayY}px`, transform: 'translate(-50%, -50%)', zIndex: 30 }}
                                  className="absolute bg-slate-950/90 border border-slate-800/80 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded shadow-md pointer-events-none text-slate-300 whitespace-nowrap"
                                >
                                  {p.flow.toFixed(2)} m³/h
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>

                    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-slate-950/85 border border-slate-800 text-[10px] font-mono font-semibold px-2 py-0.5 rounded text-white shadow-md pointer-events-none whitespace-nowrap">
                      Top: {state.temperatures[NUM_NODES - 1].toFixed(1)}°C
                    </div>

                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 bg-slate-950/85 border border-slate-800 text-[10px] font-mono font-semibold px-2 py-0.5 rounded text-white shadow-md pointer-events-none whitespace-nowrap">
                      Mid: {state.temperatures[Math.floor(NUM_NODES / 2)].toFixed(1)}°C
                    </div>

                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 bg-slate-950/85 border border-slate-800 text-[10px] font-mono font-semibold px-2 py-0.5 rounded text-white shadow-md pointer-events-none whitespace-nowrap">
                      Bot: {state.temperatures[0].toFixed(1)}°C
                    </div>

                  </div>

                  {state.loops.map(loop => {
                    if (loop.isActive && loop.type === 'source' && (loop.turndownability ?? 0) > 0) {
                      const returnPort = state.ports.find(p => p.id === loop.ports.return);
                      const supplyPort = state.ports.find(p => p.id === loop.ports.supply);
                      if (returnPort && supplyPort) {
                        const sensLoc = loop.sensorLocation !== undefined ? loop.sensorLocation : 50;
                        const sensorHeight = returnPort.height + (sensLoc / 100) * (supplyPort.height - returnPort.height);
                        const yPos = tankTop + tankHeight * (1 - sensorHeight);
                        const cleanName = loop.name.length > 12 ? loop.name.substring(0, 10) + '..' : loop.name;
                        return (
                          <div 
                            key={`sensor-line-${loop.id}`}
                            style={{ top: `${yPos}px`, left: `${tankLeft}px`, width: '150px' }}
                            className="absolute h-px border-t border-dashed border-amber-400/80 z-20 pointer-events-none"
                          >
                            <span className="absolute -left-24 -top-2.5 bg-slate-950/90 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono text-[9px] scale-90 whitespace-nowrap shadow-md">
                              {cleanName} Sensor ({sensLoc}%)
                            </span>
                          </div>
                        );
                      }
                    }
                    return null;
                  })}

                  {state.ports.map((port) => {
                    const loop = state.loops.find(l => l.id === port.loopId);
                    const isLeft = loop ? loop.type === 'source' : true;
                    const xPos = isLeft ? tankLeft : tankRight;
                    const yPos = tankTop + tankHeight * (1 - port.height);
                    
                    return (
                      <div 
                        key={port.id}
                        style={{ 
                          left: `${xPos}px`, 
                          top: `${yPos}px`,
                          transform: 'translate(-50%, -50%)' 
                        }}
                        onMouseDown={() => handlePortMouseDown(port.id)}
                        className="absolute w-5 h-5 rounded-full cursor-ns-resize border-2 border-white bg-slate-950 shadow-md transition transform hover:scale-125 hover:bg-slate-900 active:scale-95 z-20 flex items-center justify-center group"
                        title="Drag Up/Down to adjust connection point"
                      >
                        <div style={{ backgroundColor: port.color }} className="w-2.5 h-2.5 rounded-full" />
                        <span className="absolute hidden group-hover:block bottom-6 bg-slate-950 text-white text-[9px] px-1.5 py-0.5 rounded border border-slate-800 whitespace-nowrap z-30 pointer-events-none">
                          {port.name.split(' (')[0]} ({Math.round(port.height * 100)}%)
                        </span>
                      </div>
                    );
                  })}

                  {state.loops.map((loop) => {
                    const box = boxPositions[loop.id];
                    if (!box) return null;
                    const isExpanded = expandedBoxes[loop.id];
                    const actuals = getLoopActuals(loop, state.temperatures, state.ports);
                    const isSource = loop.type === 'source';
                    const boxH = getBoxHeight(loop.id, isExpanded);

                    return (
                      <div
                        key={loop.id}
                        style={{
                          left: `${box.x}px`,
                          top: `${box.y}px`,
                          width: '280px',
                          height: `${boxH}px`,
                          borderLeftColor: loop.color
                        }}
                        className="absolute bg-slate-900/90 border border-slate-800/95 border-l-4 rounded-xl shadow-xl flex flex-col overflow-hidden transition-all duration-150 z-10 select-none backdrop-blur-sm"
                      >
                        <div className="px-3 py-2 bg-slate-950/40 border-b border-slate-800/50 flex items-center justify-between min-w-0">
                          <div className="flex items-center space-x-2 min-w-0">
                            <div className="flex flex-col -space-y-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => isSource ? moveSource(loop.id, 'up') : moveSink(loop.id, 'up')}
                                disabled={isSource ? sourceOrder.indexOf(loop.id) === 0 : sinkOrder.indexOf(loop.id) === 0}
                                className="p-0.5 hover:bg-slate-800 rounded text-slate-500 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => isSource ? moveSource(loop.id, 'down') : moveSink(loop.id, 'down')}
                                disabled={isSource ? sourceOrder.indexOf(loop.id) === sourceOrder.length - 1 : sinkOrder.indexOf(loop.id) === sinkOrder.length - 1}
                                className="p-0.5 hover:bg-slate-800 rounded text-slate-500 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </div>

                            <input
                              type="text"
                              value={loop.name}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateLoopParam(loop.id, 'name', e.target.value)}
                              className="bg-transparent text-xs font-bold text-white focus:outline-none border-b border-transparent hover:border-slate-800 focus:border-slate-700 min-w-0 py-0.5 cursor-text text-ellipsis"
                            />
                            {loop.isShutDown && (
                              <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20 font-semibold tracking-wide flex-shrink-0 animate-pulse">
                                Turndown
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center space-x-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <label className="relative inline-flex items-center cursor-pointer scale-75">
                              <input
                                type="checkbox"
                                checked={loop.isActive}
                                onChange={() => toggleLoop(loop.id)}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4.5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-white peer-checked:after:bg-slate-900"></div>
                            </label>
                            
                            <button
                              onClick={() => setExpandedBoxes(prev => ({ ...prev, [loop.id]: !prev[loop.id] }))}
                              className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
                              title="Configure Loop Parameters"
                            >
                              <Sliders className={`w-3.5 h-3.5 transform transition-transform ${isExpanded ? 'rotate-90 text-white' : ''}`} />
                            </button>

                            <button
                              onClick={() => deleteLoop(loop.id)}
                              className="p-1 hover:bg-red-950/30 rounded-lg text-slate-400 hover:text-red-400 transition cursor-pointer"
                              title="Delete Loop"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 p-3 flex flex-col justify-between text-xs min-h-0">
                          {isExpanded ? (
                            <div className="space-y-2 flex-1 overflow-hidden mb-2 pr-0.5" onClick={(e) => e.stopPropagation()}>
                              
                              {isSource ? (
                                <>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <span className="text-slate-400 text-[10px] block mb-1">Design Power (kW)</span>
                                      <input
                                        type="number"
                                        value={loop.designPower}
                                        onChange={(e) => updateLoopParam(loop.id, 'designPower', Number(e.target.value))}
                                        className="w-full bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 text-right font-mono text-xs text-white focus:outline-none focus:border-slate-700"
                                      />
                                    </div>
                                    <div>
                                      <span className="text-slate-400 text-[10px] block mb-1">Design Return Temp (°C)</span>
                                      <input
                                        type="number"
                                        value={loop.designTempReturn}
                                        onChange={(e) => updateLoopParam(loop.id, 'designTempReturn', Number(e.target.value))}
                                        className="w-full bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 text-right font-mono text-xs text-white focus:outline-none focus:border-slate-700"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <span className="text-slate-400 text-[10px] block mb-1">Design Supply Temp (°C)</span>
                                      <input
                                        type="number"
                                        value={loop.designTempSupply}
                                        onChange={(e) => updateLoopParam(loop.id, 'designTempSupply', Number(e.target.value))}
                                        className="w-full bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 text-right font-mono text-xs text-white focus:outline-none focus:border-slate-700"
                                      />
                                    </div>
                                    <div className="flex flex-col justify-between">
                                      <span className="text-slate-400 text-[10px] block mb-1">Control Mode</span>
                                      <select
                                        value={loop.sourceControlMode || 'tempLimited'}
                                        onChange={(e) => updateLoopParam(loop.id, 'sourceControlMode', e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 font-mono text-[10px] text-white focus:outline-none focus:border-slate-700 h-[24px]"
                                      >
                                        <option value="unrestricted">Unrestricted</option>
                                        <option value="tempLimited">Temp Limited</option>
                                        <option value="controlledFlow">Flow controlled</option>
                                      </select>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <span className="text-slate-400 text-[10px] block mb-1">Design Power (kW)</span>
                                      <input
                                        type="number"
                                        value={loop.designPower}
                                        onChange={(e) => updateLoopParam(loop.id, 'designPower', Number(e.target.value))}
                                        className="w-full bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 text-right font-mono text-xs text-white focus:outline-none focus:border-slate-700"
                                      />
                                    </div>
                                    <div>
                                      <span className="text-slate-400 text-[10px] block mb-1">Design Supply Temp (°C)</span>
                                      <input
                                        type="number"
                                        value={loop.designTempSupply}
                                        onChange={(e) => updateLoopParam(loop.id, 'designTempSupply', Number(e.target.value))}
                                        className="w-full bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 text-right font-mono text-xs text-white focus:outline-none focus:border-slate-700"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <span className="text-slate-400 text-[10px] block mb-1">Design Return Temp (°C)</span>
                                      <input
                                        type="number"
                                        value={loop.designTempReturn}
                                        onChange={(e) => updateLoopParam(loop.id, 'designTempReturn', Number(e.target.value))}
                                        className="w-full bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 text-right font-mono text-xs text-white focus:outline-none focus:border-slate-700"
                                      />
                                    </div>
                                    <div className="flex flex-col justify-between">
                                      <span className="text-slate-400 text-[10px] block mb-1">Control Mode</span>
                                      <select
                                        value={loop.sinkControlMode || 'unrestricted'}
                                        onChange={(e) => updateLoopParam(loop.id, 'sinkControlMode', e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 font-mono text-[10px] text-white focus:outline-none focus:border-slate-700 h-[24px]"
                                      >
                                        <option value="unrestricted">Unrestricted</option>
                                        <option value="returnTempLimited">Temp Limited</option>
                                        <option value="controlledFlow">Controlled</option>
                                      </select>
                                    </div>
                                  </div>
                                </>
                              )}

                              {loop.type === 'source' && (
                                <div className="border-t border-slate-800/80 pt-2.5 mt-1">
                                  <span className="text-slate-350 font-semibold text-[10px] block mb-2">Hysteresis Controls</span>
                                  
                                  <div className="grid grid-cols-3 gap-2">
                                    <div>
                                      <span className="text-slate-500 text-[8px] block mb-1 leading-tight text-center font-medium">Turndown (%)</span>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={loop.turndownability ?? 0}
                                        onChange={(e) => {
                                          const val = Math.min(100, Math.max(0, Number(e.target.value)));
                                          updateLoopParam(loop.id, 'turndownability', val);
                                          if ((loop.triggerOn ?? 0) > val) {
                                            updateLoopParam(loop.id, 'triggerOn', val);
                                          }
                                        }}
                                        className="w-full bg-slate-950 border border-slate-855 rounded px-1 py-0.5 text-center font-mono text-xs text-white focus:outline-none focus:border-slate-700"
                                      />
                                    </div>

                                    <div>
                                      <span className="text-slate-500 text-[8px] block mb-1 leading-tight text-center font-medium">Trigger on (%)</span>
                                      <input
                                        type="number"
                                        min="0"
                                        max={loop.turndownability ?? 0}
                                        value={loop.triggerOn ?? 0}
                                        onChange={(e) => {
                                          const maxVal = loop.turndownability ?? 0;
                                          const val = Math.min(maxVal, Math.max(0, Number(e.target.value)));
                                          updateLoopParam(loop.id, 'triggerOn', val);
                                        }}
                                        className="w-full bg-slate-950 border border-slate-855 rounded px-1 py-0.5 text-center font-mono text-xs text-white focus:outline-none focus:border-slate-700"
                                      />
                                    </div>

                                    <div>
                                      <span className="text-slate-500 text-[8px] block mb-1 leading-tight text-center font-medium">Sensor Loc (%)</span>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={loop.sensorLocation ?? 50}
                                        onChange={(e) => {
                                          const val = Math.min(100, Math.max(0, Number(e.target.value)));
                                          updateLoopParam(loop.id, 'sensorLocation', val);
                                        }}
                                        className="w-full bg-slate-950 border border-slate-855 rounded px-1 py-0.5 text-center font-mono text-xs text-white focus:outline-none focus:border-slate-700"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}

                          <div className="pt-2 border-t border-slate-855 flex items-center justify-between mt-auto">
                            <span className="text-[10px] text-slate-500 font-medium">Exchanged Power:</span>
                            <span className="font-mono font-bold text-white text-sm">
                              {actuals.actualPower.toFixed(1)} kW
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div 
                    style={{ left: '50%', bottom: '20px', transform: 'translateX(-50%)' }}
                    className="absolute bg-slate-900/60 border border-slate-800/50 rounded-xl flex flex-row select-none backdrop-blur-sm z-20 text-[10px] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Left Column: Charge Time */}
                    <div className="flex flex-col items-center justify-center p-3 border-r border-slate-800/50 w-[140px] bg-slate-900/40">
                      <div className="flex items-center text-slate-400 text-[9px] font-semibold uppercase tracking-wide mb-1">
                        <span>Charge Time</span>
                        <button
                          onClick={() => setShowChargeExplanation(true)}
                          className="w-3.5 h-3.5 ml-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-full flex items-center justify-center text-[9px] font-bold cursor-pointer transition border border-slate-700"
                          title="Explain segmented charging calculations"
                        >
                          ?
                        </button>
                      </div>
                      <span className="font-mono text-[13px] text-emerald-400 font-bold">{formatTime(calculatedChargeTimeHours)}</span>
                      <span className="text-slate-400 mt-1 text-center">up to {achievableCapacityKWh.toFixed(1)} kWh</span>
                      <span className="text-slate-500 font-medium">({achievablePercent.toFixed(0)}% of max cap)</span>
                    </div>

                    {/* Middle Column */}
                    <div className="flex flex-col w-[360px]">
                      {/* Tank Volume Slider */}
                      <div className="flex items-center justify-between p-2 border-b border-slate-800/50 bg-slate-900/20">
                        <span className="text-slate-400 font-medium pl-2">Tank Volume</span>
                        <div className="flex-1 px-4">
                          <input
                            type="range"
                            min="1"
                            max="200"
                            step="1"
                            value={params.tankVolume}
                            onChange={(e) => setParams(prev => ({ ...prev, tankVolume: Number(e.target.value) }))}
                            className="w-full h-1 bg-slate-850 rounded appearance-none cursor-pointer accent-white"
                          />
                        </div>
                        <span className="font-mono text-slate-200 font-bold pr-2">{params.tankVolume} m³</span>
                      </div>
                      
                      {/* Time to balance title */}
                      <div className="flex justify-center items-center p-2 border-b border-slate-800/50 text-slate-300 font-medium bg-slate-900/40">
                        Time to balance: {equilibriumCapacityKWh.toFixed(1)} kWh ({equilibriumPercent.toFixed(0)}%)
                        <button
                          onClick={() => setShowNetExplanation(true)}
                          className="w-3.5 h-3.5 ml-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-full flex items-center justify-center text-[9px] font-bold cursor-pointer transition border border-slate-700"
                          title="Explain active sinks and sources equilibrium"
                        >
                          ?
                        </button>
                      </div>

                      {/* Detail rows */}
                      <div className="flex flex-col font-mono text-slate-400 bg-slate-900/20">
                        <div className="flex border-b border-slate-800/50">
                          <div className="flex-1 p-1.5 text-right border-r border-slate-800/50 flex items-center justify-end pr-3">Charging from drained:</div>
                          <div className="w-[100px] p-1.5 text-center font-bold text-emerald-400 flex items-center justify-center">{formatTime(chargeFromDrainedTime)}</div>
                        </div>
                        <div className="flex">
                          <div className="flex-1 p-1.5 text-right border-r border-slate-800/50 flex items-center justify-end pr-3">Discharging from Achievable max:</div>
                          <div className="w-[100px] p-1.5 text-center font-bold text-purple-400 flex items-center justify-center">{formatTime(dischargeFromMaxTime)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Discharge Time */}
                    <div className="flex flex-col items-center justify-center p-3 border-l border-slate-800/50 w-[140px] bg-slate-900/40">
                      <span className="text-slate-400 text-[9px] font-semibold uppercase tracking-wide mb-1">Discharge Time</span>
                      <span className="font-mono text-[13px] text-purple-400 font-bold">{formatTime(timeToDischargeOnly)}</span>
                      <span className="text-slate-400 mt-1 text-center">Down to 0.0 kWh</span>
                      <span className="text-slate-500 font-medium">(0% of max cap)</span>
                    </div>
                  </div>

                  {/* Add Source Button */}
                  <button
                    onClick={addNewSource}
                    style={{ left: '20px', top: `${sourcesEndY}px` }}
                    className="absolute w-[280px] h-9 border border-dashed border-slate-700/60 hover:border-slate-500 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition duration-200 text-xs font-semibold bg-slate-900/40 hover:bg-slate-900/80 cursor-pointer z-20 shadow-md"
                  >
                    + Add Source Loop
                  </button>

                  {/* Add Sink Button */}
                  <button
                    onClick={addNewSink}
                    style={{ left: `${canvasWidth - 280 - 20}px`, top: `${sinksEndY}px` }}
                    className="absolute w-[280px] h-9 border border-dashed border-slate-700/60 hover:border-slate-500 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition duration-200 text-xs font-semibold bg-slate-900/40 hover:bg-slate-900/80 cursor-pointer z-20 shadow-md"
                  >
                    + Add Sink Loop
                  </button>

                </div>
              </div>
            </div>

            <div className="w-full max-w-[1300px] mx-auto mt-2 flex-shrink-0">
              <div className="bg-slate-950 border border-slate-900/80 rounded-2xl p-5 flex flex-col h-[320px] shadow-sm">
                <h3 className="font-semibold text-sm text-slate-300 mb-3 flex items-center justify-between">
                  <span>Temperature History (Time-series)</span>
                  <span className="font-mono text-[10px] text-slate-500 font-normal">5 heights over time</span>
                </h3>
                
                <div className="flex-1 w-full relative min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={tempHistory}
                      margin={{ top: 5, right: 15, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis 
                        dataKey="time"
                        type="number"
                        domain={[minTime, maxTime]}
                        tickFormatter={(v) => `${v.toFixed(1)}m`}
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        stroke="#334155"
                      />
                      <YAxis 
                        type="number"
                        domain={[0, 100]} 
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        stroke="#334155"
                        unit="°C"
                        width={45}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px' }}
                        labelStyle={{ color: '#38bdf8', fontSize: 11 }}
                        labelFormatter={(v) => `Time: ${Number(v).toFixed(2)} min`}
                        itemStyle={{ fontSize: 12 }}
                        itemSorter={(item) => {
                          const key = item.dataKey || item.name || '';
                          const order: { [key: string]: number } = {
                            'Top (100%)': 0,
                            '75% Height': 1,
                            '50% Height': 2,
                            '25% Height': 3,
                            'Bottom (0%)': 4
                          };
                          return order[key] !== undefined ? order[key] : 99;
                        }}
                      />
                      <Legend 
                        wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
                        verticalAlign="bottom"
                        height={36}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Top (100%)" 
                        stroke="#ef4444" 
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="75% Height" 
                        stroke="#f97316" 
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="50% Height" 
                        stroke="#eab308" 
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="25% Height" 
                        stroke="#06b6d4" 
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Bottom (0%)" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        dot={false}
                                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {showChargeExplanation && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-6xl w-full max-h-[90vh] shadow-2xl relative flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white">
                Segmented Thermodynamic Sizing & Solver
              </h3>
              <button 
                onClick={() => setShowChargeExplanation(false)}
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              
              {/* Top Section: Side-by-Side Table and Tank Visual */}
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] gap-6 items-start">
                
                {/* Left Column: Top-Down segments table */}
                <div className="overflow-x-auto">
                  <div className="border border-slate-800 rounded-xl bg-slate-950 text-[11px] min-w-[620px] flex flex-col">
                    {/* Header Row */}
                    <div className="grid grid-cols-[60px_80px_65px_minmax(0,1fr)_65px_80px_85px] bg-slate-900/80 border-b border-slate-800 text-slate-450 font-semibold px-3 h-[36px] items-center">
                      <div>Segment</div>
                      <div>Height Range</div>
                      <div>Volume</div>
                      <div>Covering Sources</div>
                      <div className="text-center">Max Temp</div>
                      <div className="text-center flex items-center justify-center gap-1 group relative cursor-help">
                        <span>Time to Heat</span>
                        <span className="text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-350 px-1 rounded-full font-bold w-3.5 h-3.5 flex items-center justify-center select-none border border-slate-700">?</span>
                        <div className="absolute hidden group-hover:block bg-slate-950/98 border border-slate-800 text-slate-300 text-[10px] p-2.5 rounded-lg shadow-2xl font-normal w-56 text-left z-50 left-1/2 transform -translate-x-1/2 top-8 leading-relaxed pointer-events-none select-none">
                          <p className="font-semibold text-slate-100 border-b border-slate-800 pb-1 mb-1">Segment Time to Heat</p>
                          Calculated as <span className="font-mono text-amber-400 font-semibold">Q_j / Σ P_i</span> (segment energy needed divided by the sum of design power of all loops covering this segment).
                          <p className="mt-1.5 text-slate-400">The overall total charge time is solved using a max-flow bottleneck algorithm across all overlapping segment subsets.</p>
                        </div>
                      </div>
                      <div className="text-right">Energy (kWh)</div>
                    </div>
                    {/* Body Rows */}
                    <div className="divide-y divide-slate-800/50 flex-1">
                      {[...segments].reverse().map((seg) => {
                        const originalIdx = segments.indexOf(seg);
                        const height = Math.max(38, (seg.yEnd - seg.yStart) * 240);
                        const sumPower = seg.coveringLoops.reduce((sum, l) => sum + l.designPower, 0);
                        const timeToHeatStr = sumPower > 0 ? (seg.qNeeded / sumPower).toFixed(2) + ' h' : '—';
                        return (
                          <div 
                            key={originalIdx} 
                            style={{ height: `${height}px` }}
                            className="grid grid-cols-[60px_80px_65px_minmax(0,1fr)_65px_80px_85px] items-center px-3 hover:bg-slate-800/20 text-slate-350 transition-colors"
                          >
                            <div className="font-semibold text-slate-400">#{originalIdx + 1}</div>
                            <div className="font-mono text-[10px]">{(seg.yStart * 100).toFixed(0)}% — {(seg.yEnd * 100).toFixed(0)}%</div>
                            <div className="font-mono text-[10px]">{seg.volume.toFixed(2)} m³</div>
                            <div className="pr-2">
                              {seg.coveringLoops.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {seg.coveringLoops.map(l => (
                                    <span key={l.id} className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ backgroundColor: `${l.color}15`, color: l.color, border: `1px solid ${l.color}30` }}>
                                      {l.name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-655 italic text-[10px]">None (Unheatable)</span>
                              )}
                            </div>
                            <div className="font-mono text-center text-amber-400 font-semibold">{seg.tMax.toFixed(0)}°C</div>
                            <div className="font-mono text-center text-slate-300 font-semibold">{timeToHeatStr}</div>
                            <div className="font-mono text-right text-emerald-400 font-semibold">{seg.qNeeded.toFixed(1)} kWh</div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Totals Row */}
                    <div className="grid grid-cols-[60px_80px_65px_minmax(0,1fr)_65px_80px_85px] bg-slate-900/60 border-t border-slate-800 text-slate-200 font-bold px-3 py-2 items-center">
                      <div>Total</div>
                      <div className="font-mono text-[10px] text-slate-405 font-normal">0% — 100%</div>
                      <div className="font-mono text-[10px]">{params.tankVolume.toFixed(2)} m³</div>
                      <div className="text-[10px] text-slate-405 font-normal">Calculated charge time</div>
                      <div className="text-center text-slate-450 font-normal">—</div>
                      <div className="font-mono text-center text-sky-400 font-bold">
                        {calculatedChargeTimeHours === Infinity ? '—' : calculatedChargeTimeHours.toFixed(2) + ' h'}
                      </div>
                      <div className="font-mono text-right text-emerald-400">{achievableCapacityKWh.toFixed(1)} kWh</div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Visual Tank Reference and Legend */}
                <div className="flex flex-col items-center select-none border-t md:border-t-0 md:border-l border-slate-800/50 md:pl-6 relative">
                  {/* Tank Header to align with table header */}
                  <div className="h-[36px] flex items-center justify-center w-full">
                    <h4 className="font-semibold text-slate-300 text-xs">Visual Tank Reference</h4>
                  </div>

                  <div className="relative flex items-center justify-center px-12 w-full">
                    
                    {/* Standard Height Ticks on the right of the tank */}
                    <div 
                      className="absolute left-[calc(50%+52px)] w-7 flex flex-col justify-between text-[9px] text-slate-500 font-mono select-none"
                      style={{ height: `${totalTankHeight}px`, top: '2px' }}
                    >
                      <div className="h-0 flex items-center"><span className="w-1 h-[1px] bg-slate-800 mr-1" />100%</div>
                      <div className="h-0 flex items-center"><span className="w-1 h-[1px] bg-slate-800 mr-1" />75%</div>
                      <div className="h-0 flex items-center"><span className="w-1 h-[1px] bg-slate-800 mr-1" />50%</div>
                      <div className="h-0 flex items-center"><span className="w-1 h-[1px] bg-slate-800 mr-1" />25%</div>
                      <div className="h-0 flex items-center"><span className="w-1 h-[1px] bg-slate-800 mr-1" />0%</div>
                    </div>

                    {/* Segment Boundary Heights on the right of the tank (further right) */}
                    <div 
                      className="absolute left-[calc(50%+82px)] w-10 select-none pointer-events-none"
                      style={{ height: `${totalTankHeight}px`, top: '2px' }}
                    >
                      {boundaries.map((b, i) => (
                        <div 
                          key={i} 
                          className="absolute left-0 h-0 flex items-center text-[9px] text-orange-400 font-mono font-semibold"
                          style={{ top: `${b.topOffset}px` }}
                        >
                          <span className="w-1.5 h-[1px] bg-orange-500 mr-1" />
                          {(b.heightVal * 100).toFixed(0)}%
                        </div>
                      ))}
                    </div>

                    {/* The Tank */}
                    <div 
                      className="relative w-24 bg-slate-950 border-2 border-slate-700 rounded-t-3xl rounded-b-3xl overflow-hidden shadow-inner flex flex-col"
                      style={{ height: `${totalTankHeight + 4}px` }}
                    >
                      {[...segments].reverse().map((seg, idx) => {
                        const originalIdx = segments.indexOf(seg);
                        const isUnheatable = seg.tMax <= T_baseline + 1e-5;
                        const isPartiallyHeated = !isUnheatable && seg.tMax < maxActiveSourceTemp - 1e-5;
                        const height = Math.max(38, (seg.yEnd - seg.yStart) * 240);
                        const sumPower = seg.coveringLoops.reduce((sum, l) => sum + l.designPower, 0);
                        const timeToHeatStr = sumPower > 0 ? (seg.qNeeded / sumPower).toFixed(1) + 'h' : '—';

                        const bgStyle = isUnheatable
                          ? {
                              background: 'repeating-linear-gradient(45deg, rgba(30, 58, 138, 0.25) 0px, rgba(30, 58, 138, 0.25) 8px, rgba(59, 130, 246, 0.12) 8px, rgba(59, 130, 246, 0.12) 16px)',
                              borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
                            }
                          : isPartiallyHeated
                          ? {
                              background: 'linear-gradient(180deg, rgba(234, 179, 8, 0.35) 0%, rgba(202, 138, 4, 0.2) 100%)',
                              borderBottom: '1px solid rgba(234, 179, 8, 0.4)',
                            }
                          : {
                              background: 'linear-gradient(180deg, rgba(249, 115, 22, 0.35) 0%, rgba(217, 119, 6, 0.2) 100%)',
                              borderBottom: '1px solid rgba(249, 115, 22, 0.4)',
                            };

                        return (
                          <div
                            key={originalIdx}
                            className="relative w-full cursor-help transition-all duration-200 hover:brightness-125 last:border-b-0"
                            style={{
                              height: `${height}px`,
                              ...bgStyle,
                            }}
                            onMouseEnter={() => setHoveredSegIdx(originalIdx)}
                            onMouseLeave={() => setHoveredSegIdx(null)}
                          >
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] font-bold text-slate-100 select-none text-center leading-tight">
                              <span>#{originalIdx + 1}</span>
                              <span className="text-[9px] font-mono font-medium text-slate-350 mt-0.5">
                                {seg.tMax.toFixed(0)}°C
                              </span>
                              {sumPower > 0 && (
                                <span className="text-[7.5px] font-mono font-normal text-slate-400 mt-0.5 opacity-90">
                                  {timeToHeatStr}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Floating Tooltip outside overflow-hidden, positioned relative to parent */}
                    {hoveredSegIdx !== null && segments[hoveredSegIdx] && (() => {
                      const reversedIdx = [...segments].reverse().findIndex(seg => segments.indexOf(seg) === hoveredSegIdx);
                      const centerOffset = segmentCenters[reversedIdx];
                      const targetSeg = segments[hoveredSegIdx];
                      const isUnheatable = targetSeg.tMax <= T_baseline + 1e-5;
                      const isPartiallyHeated = !isUnheatable && targetSeg.tMax < maxActiveSourceTemp - 1e-5;
                      const sumPower = targetSeg.coveringLoops.reduce((sum, l) => sum + l.designPower, 0);
                      const timeToHeatStr = sumPower > 0 ? (targetSeg.qNeeded / sumPower).toFixed(2) + ' h' : '—';
                      const statusText = isUnheatable 
                        ? 'Unheatable' 
                        : isPartiallyHeated 
                        ? 'Partially Heated' 
                        : 'Fully Heated';
                      const statusColor = isUnheatable 
                        ? 'text-blue-400' 
                        : isPartiallyHeated 
                        ? 'text-yellow-450' 
                        : 'text-orange-400';

                      return (
                        <div 
                          className="absolute bg-slate-950/95 border border-slate-800 text-[10px] text-slate-200 rounded-lg p-2 shadow-2xl z-50 min-w-[145px] pointer-events-none transition-all duration-150"
                          style={{
                            right: 'calc(50% + 56px)', // 50% of parent + half of tank width (48px) + offset (8px)
                            top: `${centerOffset + 2}px`, // aligned with ticks start
                            transform: 'translateY(-50%)'
                          }}
                        >
                          <div className="font-bold text-slate-100 border-b border-slate-800 pb-1 mb-1">
                            Segment #{hoveredSegIdx + 1}
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-400">Span:</span>
                            <span className="font-mono font-semibold">{(targetSeg.yStart * 100).toFixed(0)}%–{(targetSeg.yEnd * 100).toFixed(0)}%</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-400">Volume:</span>
                            <span className="font-mono font-semibold">{targetSeg.volume.toFixed(2)} m³</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-400">Max Temp:</span>
                            <span className="font-mono font-semibold text-amber-400">{targetSeg.tMax.toFixed(0)}°C</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-400">Time to Heat:</span>
                            <span className="font-mono font-semibold text-slate-350">{timeToHeatStr}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-400">Energy:</span>
                            <span className="font-mono font-semibold text-emerald-400">{targetSeg.qNeeded.toFixed(1)} kWh</span>
                          </div>
                          <div className="flex justify-between gap-2 mt-1 border-t border-slate-800/50 pt-1">
                            <span className="text-slate-400">Status:</span>
                            <span className={`font-semibold ${statusColor}`}>
                              {statusText}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Legend below the tank */}
                  <div className="mt-4 flex flex-col gap-1.5 w-full px-2 text-[10px] items-center md:items-start">
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded bg-gradient-to-r from-orange-500/40 to-amber-500/30 border border-orange-500/30 shadow-sm" />
                      <span className="text-slate-300 font-medium text-[10px]">Fully Heated</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded bg-gradient-to-r from-yellow-500/40 to-yellow-600/30 border border-yellow-500/30 shadow-sm" />
                      <span className="text-slate-300 font-medium text-[10px]">Partially Heated</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3.5 h-3.5 rounded border border-blue-500/30 shadow-sm" 
                        style={{ background: 'repeating-linear-gradient(45deg, rgba(30, 58, 138, 0.3) 0px, rgba(30, 58, 138, 0.3) 4px, rgba(59, 130, 246, 0.15) 4px, rgba(59, 130, 246, 0.15) 8px)' }}
                      />
                      <span className="text-slate-300 font-medium text-[10px]">Unheatable Zone</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Section: Separator and Paragraph Explanations */}
              <div className="border-t border-slate-800/80 pt-3.5 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-405 leading-relaxed">
                  <div>
                    <h4 className="font-semibold text-slate-200 mb-1">1. Slicing the Tank into Segments</h4>
                    <p>
                      To handle arbitrary port heights, the tank height is sliced into segments using all active port heights as boundary levels (including the bottom 0% and top 100%).
                      Each segment represents a specific volume portion of the total tank volume.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-200 mb-1">2. Achievable Sizing Capacity (kWh)</h4>
                    <p>
                      Instead of assuming the whole tank is heated to the maximum temperature, we identify which segments are actually heated by active source loops.
                      Due to gravity buoyancy, hot water rises, so a segment is considered heatable if it lies at or above the lowest port height of any active source loop.
                    </p>
                    <p className="mt-2 text-emerald-400 font-semibold font-mono text-[10px] bg-slate-950/50 p-1.5 rounded border border-slate-800/50 text-center">
                      Achievable Capacity: {achievableCapacityKWh.toFixed(1)} kWh ({achievablePercent.toFixed(0)}%)
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-200 mb-1">3. Transient Charging Solver (Total Charge Time)</h4>
                    <p>
                      To find the overall charging time, we run a fast transient simulation of the tank charging process from its current state. This accounts for sequential loop shutdowns (e.g., when the Heat Pump completes charging the upper zones and turns off, leaving only the Compressed Air loop to heat the lower zone).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNetExplanation && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-6xl w-full max-h-[90vh] shadow-2xl relative flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white">
                Active Sinks & Sources (Equilibrium Analysis)
              </h3>
              <button 
                onClick={() => setShowNetExplanation(false)}
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              
              {/* Top Section: Side-by-Side Table and Tank Visual */}
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] gap-6 items-start">
                
                {/* Left Column: Top-Down segments table */}
                <div className="overflow-x-auto">
                  <div className="border border-slate-800 rounded-xl bg-slate-950 text-[11px] min-w-[620px] flex flex-col">
                    {/* Header Row */}
                    <div className="grid grid-cols-[50px_70px_55px_minmax(0,1fr)_minmax(0,1fr)_60px_60px_65px] bg-slate-900/80 border-b border-slate-800 text-slate-450 font-semibold px-3 h-[36px] items-center text-[10px]">
                      <div>Segment</div>
                      <div>Height Range</div>
                      <div>Volume</div>
                      <div>Covering Sources</div>
                      <div>Covering Sinks</div>
                      <div className="text-right">Capacity</div>
                      <div className="text-right">Time</div>
                      <div className="text-center">Eq. Temp</div>
                    </div>
                    
                    {/* Data Rows */}
                    <div className="divide-y divide-slate-800/50 flex-1">
                      {eqSegments.map((seg, idx) => {
                        const isUnheatable = seg.coveringSources.length === 0;
                        const height = Math.max(38, (seg.yStart - seg.yEnd) * 240);
                        const qEq = seg.eqTemp > T_baseline ? (seg.volume * 4180 * (seg.eqTemp - T_baseline)) / 3600 : 0;
                        const sumPower = seg.coveringSources.reduce((sum, l) => sum + l.designPower, 0);
                        const timeStr = sumPower > 0 ? (qEq / sumPower).toFixed(1) + ' h' : '-';

                        return (
                          <div 
                            key={idx}
                            style={{ height: `${height}px` }}
                            className="grid grid-cols-[50px_70px_55px_minmax(0,1fr)_minmax(0,1fr)_60px_60px_65px] items-center px-3 hover:bg-slate-800/20 text-slate-350 transition-colors"
                          >
                            <div className="font-semibold text-slate-400">#{idx + 1}</div>
                            <div className="font-mono text-[10px]">{(seg.yEnd * 100).toFixed(0)}% — {(seg.yStart * 100).toFixed(0)}%</div>
                            <div className="font-mono text-[10px]">{seg.volume.toFixed(2)} m³</div>
                          
                          {/* Covering Sources */}
                          <div className="flex flex-wrap gap-1 pr-2">
                            {seg.coveringSources.length > 0 ? seg.coveringSources.map(l => (
                              <span key={l.id} className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                                {l.name}
                              </span>
                            )) : (
                              <span className="text-slate-600 italic text-[9px]">-</span>
                            )}
                          </div>

                          {/* Covering Sinks */}
                          <div className="flex flex-wrap gap-1 pr-2">
                            {seg.coveringSinks.length > 0 ? seg.coveringSinks.map(l => (
                              <span key={l.id} className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap">
                                {l.name}
                              </span>
                            )) : (
                              <span className="text-slate-600 italic text-[9px]">-</span>
                            )}
                          </div>

                          {/* Capacity */}
                          <div className="font-mono text-[10px] text-emerald-400 text-right pr-2">
                            {qEq.toFixed(1)} kWh
                          </div>

                          {/* Time */}
                          <div className="font-mono text-[10px] text-slate-300 text-right pr-2">
                            {timeStr}
                          </div>

                          {/* Equilibrium Temp */}
                          <div className="text-center">
                            <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${isUnheatable ? 'text-slate-500 bg-slate-800/50' : 'text-amber-400 bg-amber-500/10'}`}>
                              {seg.eqTemp.toFixed(1)}°C
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                    {/* Totals Row */}
                    <div className="grid grid-cols-[50px_70px_55px_minmax(0,1fr)_minmax(0,1fr)_60px_60px_65px] bg-slate-900/60 border-t border-slate-800 text-slate-200 font-bold px-3 py-2 items-center">
                      <div>Total</div>
                      <div className="font-mono text-[10px] text-slate-405 font-normal">0% — 100%</div>
                      <div className="font-mono text-[10px]">{params.tankVolume.toFixed(2)} m³</div>
                      <div className="text-[10px] text-slate-405 font-normal text-center col-span-2">Steady-state reached</div>
                      <div className="font-mono text-[10px] text-emerald-400 text-right pr-2">{eqSegments.reduce((sum, seg) => sum + (seg.eqTemp > T_baseline ? (seg.volume * 4180 * (seg.eqTemp - T_baseline)) / 3600 : 0), 0).toFixed(1)} kWh</div>
                      <div className="font-mono text-center text-amber-400 font-bold col-span-2">—</div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Visual Tank Representation */}
                <div className="flex flex-col items-center select-none border-t md:border-t-0 md:border-l border-slate-800/50 md:pl-6 relative">
                  <div className="h-[36px] flex items-center justify-center w-full">
                    <h4 className="font-semibold text-slate-300 text-xs">Equilibrium Temp Profile</h4>
                  </div>

                  <div className="relative flex items-center justify-center px-12 w-full">
                    {/* Ticks on the right */}
                    <div 
                      className="absolute left-[calc(50%+52px)] w-24 flex flex-col justify-between text-[9px] text-slate-500 font-mono select-none"
                      style={{ height: `240px`, top: '2px' }}
                    >
                      <div className="h-0 flex items-center">
                        <span className="w-1.5 h-[1px] bg-slate-800 mr-1" />
                        <span className="font-semibold text-slate-400">100%</span>
                        <span className="ml-1 text-amber-450">({dryRunResults.eqProfile[NUM_NODES - 1].toFixed(0)}°C)</span>
                      </div>
                      
                      <div className="h-0 flex items-center">
                        <span className="w-1.5 h-[1px] bg-slate-800 mr-1" />
                        <span className="font-semibold text-slate-400">75%</span>
                        <span className="ml-1 text-orange-450">({dryRunResults.eqProfile[Math.round((NUM_NODES - 1) * 0.75)].toFixed(0)}°C)</span>
                      </div>

                      <div className="h-0 flex items-center">
                        <span className="w-1.5 h-[1px] bg-slate-800 mr-1" />
                        <span className="font-semibold text-slate-400">50%</span>
                        <span className="ml-1 text-yellow-500">({dryRunResults.eqProfile[Math.round((NUM_NODES - 1) * 0.50)].toFixed(0)}°C)</span>
                      </div>

                      <div className="h-0 flex items-center">
                        <span className="w-1.5 h-[1px] bg-slate-800 mr-1" />
                        <span className="font-semibold text-slate-400">25%</span>
                        <span className="ml-1 text-sky-400">({dryRunResults.eqProfile[Math.round((NUM_NODES - 1) * 0.25)].toFixed(0)}°C)</span>
                      </div>

                      <div className="h-0 flex items-center">
                        <span className="w-1.5 h-[1px] bg-slate-800 mr-1" />
                        <span className="font-semibold text-slate-400">0%</span>
                        <span className="ml-1 text-blue-400">({dryRunResults.eqProfile[0].toFixed(0)}°C)</span>
                      </div>
                    </div>

                    {/* The Tank Visual Cylinder */}
                    <div 
                      className="relative w-24 bg-slate-950 border-2 border-slate-700 rounded-t-3xl rounded-b-3xl overflow-hidden shadow-inner flex flex-col"
                      style={{ height: `244px` }}
                    >
                      {eqSegments.map((seg, idx) => {
                        const color = seg.coveringSources.length === 0 ? '#1e293b' : getTempColor(seg.eqTemp);
                        return (
                          <div 
                            key={idx}
                            className="w-full flex items-center justify-center border-b border-black/20 last:border-b-0 relative"
                            style={{ 
                              height: `${(seg.yStart - seg.yEnd) * 100}%`,
                              backgroundColor: color 
                            }}
                          >
                            <span className="text-[10px] font-bold text-white/50 absolute left-2 select-none">
                              #{idx + 1}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Legend below the tank */}
                  <div className="mt-4 flex flex-col gap-1.5 w-full px-2 text-[10px] items-center md:items-start">
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded bg-orange-500 border border-orange-500/30 shadow-sm" />
                      <span className="text-slate-300 font-medium text-[10px]">Hot (Source T)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded bg-yellow-450 border border-yellow-500/30 shadow-sm" />
                      <span className="text-slate-300 font-medium text-[10px]">Warm (Mixed)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded bg-blue-500 border border-blue-500/30 shadow-sm" />
                      <span className="text-slate-300 font-medium text-[10px]">Cold (Sink/Init T)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Section: Separator and Paragraph Explanations */}
              <div className="border-t border-slate-800/80 pt-3.5 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-405 leading-relaxed">
                  <div>
                    <h4 className="font-semibold text-slate-200 mb-1">1. Equilibrium Segments</h4>
                    <p>
                      The tank height is sliced into segments using all active port heights from both heating sources and drawing sinks. Each segment represents a volume portion that reaches a distinct steady-state temperature when balanced.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-200 mb-1">2. Steady-State Profile</h4>
                    <p>
                      Instead of a simple heated or unheated state, the equilibrium analysis runs a full transient simulation to find the exact temperatures each segment converges to when all active heating and drawing loops are running simultaneously.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-200 mb-1">3. Transient Settle Times</h4>
                    <div className="flex flex-col space-y-2 mt-2">
                      <div className="flex justify-between items-center bg-slate-950/50 p-2 rounded border border-emerald-500/20">
                        <span className="text-emerald-450 font-medium">Startup:</span>
                        <span className="font-mono text-emerald-400 font-bold text-sm">{formatTime(chargeFromDrainedTime)}</span>
                      </div>
                      <div className="flex justify-between items-center bg-slate-950/50 p-2 rounded border border-purple-500/20">
                        <span className="text-purple-400 font-medium">Depletion:</span>
                        <span className="font-mono text-purple-400 font-bold text-sm">{formatTime(dischargeFromMaxTime)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
