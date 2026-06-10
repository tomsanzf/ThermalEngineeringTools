import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Trash2
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
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
    overrideBuoyancy: false,
    buoyancyOverrideValue: 0.5
  });
  
  const [simSpeed, setSimSpeed] = useState<number>(5); // 0 (paused), 1x, 5x, 10x, 20x
  const [flowDurationFactor, setFlowDurationFactor] = useState<number>(15.0);
  const [dragPortId, setDragPortId] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0); // in simulated minutes
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Collapsible physical parameters side panel
  const [leftPanelOpen, setLeftPanelOpen] = useState<boolean>(true);

  // Responsive canvas width observer
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(1050);

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
    if (loopId === 'hp') {
      return 280; // HP needs 280px for hysteresis section
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
  const canvasHeight = Math.max(580, sourcesEndY + 60, sinksEndY + 60);

  const tankTop = 80;
  const tankHeight = canvasHeight - tankTop - 80;
  const tankLeft = Math.round((canvasWidth - 150) / 2);
  const tankRight = tankLeft + 150;

  const tankRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<number | null>(null);
  
  // Color mapping function based on temperature
  const getTempColor = (temp: number) => {
    const minT = 10;
    const maxT = 90;
    const percentage = Math.min(100, Math.max(0, ((temp - minT) / (maxT - minT)) * 100));
    const hue = 240 - (percentage / 100) * 240;
    return `hsl(${hue}, 85%, 45%)`;
  };

  // Run simulation step
  const tick = useCallback(() => {
    if (simSpeed === 0) return;

    setState((prev) => {
      let currentT = [...prev.temperatures];
      let currentLoops = [...prev.loops];
      const stepsPerFrame = simSpeed; 
      const dt = 1.0;
      
      for (let i = 0; i < stepsPerFrame; i++) {
        const result = simulateStep({ ...prev, temperatures: currentT, loops: currentLoops }, params, dt);
        currentT = result.temperatures;
        currentLoops = result.loops;
      }
      
      setElapsedTime(t => t + (dt * stepsPerFrame) / 60);

      return {
        ...prev,
        temperatures: currentT,
        loops: currentLoops
      };
    });
  }, [simSpeed, params]);

  // RequestAnimationFrame Loop
  useEffect(() => {
    if (simSpeed > 0) {
      const loop = () => {
        tick();
        simRef.current = requestAnimationFrame(loop);
      };
      simRef.current = requestAnimationFrame(loop);
    }
    return () => {
      if (simRef.current) cancelAnimationFrame(simRef.current);
    };
  }, [simSpeed, tick]);

  // Reset simulation
  const handleReset = () => {
    setState(createInitialState(NUM_NODES));
    setElapsedTime(0);
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

  const T_high = activeSourcesList.length > 0
    ? Math.max(...activeSourcesList.map(l => l.designTempSupply))
    : 90; // default to 90

  const T_low = activeSinksList.length > 0
    ? Math.min(...activeSinksList.map(l => l.designTempReturn))
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

  const timeToChargeOnly = totalSourcePower > 0 ? (heatCapacityKWh / totalSourcePower) : Infinity;
  const timeToDischargeOnly = totalSinkPower > 0 ? (heatCapacityKWh / totalSinkPower) : Infinity;

  const netPower = totalSourcePower - totalSinkPower;
  const timeToNet = netPower !== 0 ? (heatCapacityKWh / Math.abs(netPower)) : Infinity;

  let netStatusText = 'Balanced';
  if (netPower > 0) {
    netStatusText = 'Charging';
  } else if (netPower < 0) {
    netStatusText = 'Discharging';
  }

  const formatTime = (hours: number) => {
    if (!isFinite(hours) || hours <= 0 || heatCapacityKWh <= 0) return '—';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 font-sans flex flex-col antialiased overflow-hidden">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-4">
          <a 
            href="../../index.html" 
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

        {/* Sim Controls */}
        <div className="flex items-center space-x-3 bg-slate-950 border border-slate-800 rounded-xl p-1.5 shadow-inner">
          <button
            onClick={() => setSimSpeed(simSpeed === 0 ? 5 : 0)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition duration-200 ${
              simSpeed > 0 
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' 
                : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
            }`}
          >
            {simSpeed > 0 ? (
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
            onClick={handleReset}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition duration-200"
            title="Reset Simulation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="h-6 w-px bg-slate-800 my-auto"></div>

          <div className="flex items-center space-x-2 px-2 text-xs">
            <span className="text-slate-500">Speed:</span>
            <select
              value={simSpeed}
              onChange={(e) => setSimSpeed(Number(e.target.value))}
              className="bg-transparent text-slate-300 font-semibold focus:outline-none border-none cursor-pointer"
            >
              <option value={0} className="bg-slate-900">Paused</option>
              <option value={1} className="bg-slate-900">1x (Realtime)</option>
              <option value={5} className="bg-slate-900">5x</option>
              <option value={15} className="bg-slate-900">15x</option>
              <option value={30} className="bg-slate-900">30x</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center space-x-6 text-sm">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-500 font-medium">Elapsed Time</div>
            <div className="font-mono text-slate-200 font-semibold">
              {Math.floor(elapsedTime)}m {Math.floor((elapsedTime % 1) * 60)}s
            </div>
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
                            markerEnd={`url(#arrow-${loop.id})`}
                            className={animDuration > 0 ? "animate-[dash_10s_linear_infinite]" : ""}
                            style={animDuration > 0 ? { 
                              animationDuration: `${animDuration}s`,
                              animationPlayState: simSpeed === 0 ? 'paused' : 'running'
                            } : {}}
                          />
                          <path
                            d={returnPath}
                            fill="none"
                            stroke={loop.color}
                            strokeWidth="2.5"
                            opacity="0.75"
                            markerEnd={`url(#arrow-${loop.id})`}
                            className={animDuration > 0 ? "animate-[dash_10s_linear_infinite]" : ""}
                            style={animDuration > 0 ? { 
                              animationDuration: `${animDuration}s`,
                              animationPlayState: simSpeed === 0 ? 'paused' : 'running'
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
                                      animationPlayState: simSpeed === 0 ? 'paused' : 'running'
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

                  {(() => {
                    const hpLoop = state.loops.find(l => l.id === 'hp');
                    if (hpLoop && hpLoop.isActive && (hpLoop.turndownability ?? 0) > 0) {
                      const returnPort = state.ports.find(p => p.id === hpLoop.ports.return);
                      const supplyPort = state.ports.find(p => p.id === hpLoop.ports.supply);
                      if (returnPort && supplyPort) {
                        const sensLoc = hpLoop.sensorLocation !== undefined ? hpLoop.sensorLocation : 50;
                        const sensorHeight = returnPort.height + (sensLoc / 100) * (supplyPort.height - returnPort.height);
                        const yPos = tankTop + tankHeight * (1 - sensorHeight);
                        return (
                          <div 
                            style={{ top: `${yPos}px`, left: `${tankLeft}px`, width: '150px' }}
                            className="absolute h-px border-t border-dashed border-amber-400/80 z-20 pointer-events-none"
                          >
                            <span className="absolute -left-18 -top-2.5 bg-slate-950/90 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono text-[9px] scale-90 whitespace-nowrap shadow-md">
                              HP Sensor ({sensLoc}%)
                            </span>
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}

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
                                        <option value="controlledFlow">Controlled</option>
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

                              {loop.id === 'hp' && (
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
                    style={{ left: `${tankLeft - 50}px`, top: `${canvasHeight - 65}px`, width: '250px' }}
                    className="absolute bg-slate-900/60 border border-slate-800/50 p-2 rounded-xl flex flex-col space-y-1 select-none backdrop-blur-sm z-20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                      <span>Tank Volume</span>
                      <span className="font-mono text-slate-200 font-bold">{params.tankVolume} m³</span>
                    </div>
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

                  <div 
                    style={{ left: `${tankLeft - 145}px`, top: `${canvasHeight - 65}px`, width: '85px' }}
                    className="absolute bg-slate-900/60 border border-slate-800/50 p-2 rounded-xl flex flex-col justify-center select-none backdrop-blur-sm z-20 text-center"
                  >
                    <span className="text-[8px] text-slate-400 font-semibold uppercase tracking-wide">Charge Time</span>
                    <span className="font-mono text-[11px] text-emerald-400 font-bold mt-0.5">{formatTime(timeToChargeOnly)}</span>
                    <span className="text-[8px] text-slate-500 mt-0.5">{totalSourcePower} kW</span>
                  </div>

                  <div 
                    style={{ left: `${tankRight + 60}px`, top: `${canvasHeight - 65}px`, width: '85px' }}
                    className="absolute bg-slate-900/60 border border-slate-800/50 p-2 rounded-xl flex flex-col justify-center select-none backdrop-blur-sm z-20 text-center"
                  >
                    <span className="text-[8px] text-slate-400 font-semibold uppercase tracking-wide">Disch. Time</span>
                    <span className="font-mono text-[11px] text-blue-400 font-bold mt-0.5">{formatTime(timeToDischargeOnly)}</span>
                    <span className="text-[8px] text-slate-500 mt-0.5">{totalSinkPower} kW</span>
                  </div>

                  <div 
                    style={{ left: `${tankLeft + 75}px`, top: `${canvasHeight - 22}px`, transform: 'translateX(-50%)', width: '400px' }}
                    className="absolute text-center select-none z-20 flex items-center justify-center space-x-2 text-[10px]"
                  >
                    <span className="text-slate-400 font-medium">Net Combined Rate:</span>
                    <span className="font-mono font-bold text-purple-400">{netStatusText} ({formatTime(timeToNet)})</span>
                    <span className="text-slate-500 font-mono">({Math.abs(netPower).toFixed(0)} kW)</span>
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
                  <span>Temperature Profile (z-profile)</span>
                  <span className="font-mono text-[10px] text-slate-500 font-normal">Height vs Temp</span>
                </h3>
                
                <div className="flex-1 w-full relative min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      layout="vertical"
                      data={chartData}
                      margin={{ top: 5, right: 15, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis 
                        type="number" 
                        domain={[10, 90]} 
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        stroke="#334155"
                        unit="°C"
                      />
                      <YAxis 
                        type="number" 
                        dataKey="Height (%)" 
                        domain={[0, 100]} 
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        stroke="#334155"
                        unit="%"
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px' }}
                        labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                        itemStyle={{ color: '#f8fafc', fontSize: 12 }}
                        formatter={(value) => [`${value}°C`, 'Temp']}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Temperature (°C)" 
                        stroke="#f97316" 
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
