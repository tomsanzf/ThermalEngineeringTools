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
  GripVertical
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
const getMidpoint = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = 70; 
  const cx1 = x1 < x2 ? x1 + dx : x1 - dx;
  const cy1 = y1;
  const cx2 = x1 < x2 ? x2 - dx : x2 + dx;
  const cy2 = y2;
  
  const t = 0.5;
  const mx = Math.pow(1 - t, 3) * x1 + 3 * Math.pow(1 - t, 2) * t * cx1 + 3 * (1 - t) * Math.pow(t, 2) * cx2 + Math.pow(t, 3) * x2;
  const my = Math.pow(1 - t, 3) * y1 + 3 * Math.pow(1 - t, 2) * t * cy1 + 3 * (1 - t) * Math.pow(t, 2) * cy2 + Math.pow(t, 3) * y2;
  return { x: mx, y: my };
};

function App() {
  const NUM_NODES = 20;
  
  // State
  const [state, setState] = useState<TankState>(() => createInitialState(NUM_NODES));
  const [params, setParams] = useState<SimulationParams>({
    tankVolume: 1000,
    tankHeight: 2.0,
    ambientTemp: 20,
    heatLossCoef: 0.8, // W/m²K (highly insulated)
    conductionCoef: 1.5, // W/K internal conduction
    numNodes: NUM_NODES
  });
  
  const [simSpeed, setSimSpeed] = useState<number>(5); // 0 (paused), 1x, 5x, 10x, 20x
  const [flowDurationFactor, setFlowDurationFactor] = useState<number>(15.0);
  const [dragPortId, setDragPortId] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0); // in simulated minutes
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Draggable boxes positions
  const [boxPositions, setBoxPositions] = useState<{ [key: string]: { x: number; y: number } }>({
    solar: { x: 40, y: 310 },
    hp: { x: 40, y: 50 },
    heating: { x: 790, y: 50 },
    dhw: { x: 790, y: 310 }
  });

  // Box expansion state
  const [expandedBoxes, setExpandedBoxes] = useState<{ [key: string]: boolean }>({
    solar: false,
    hp: false,
    heating: false,
    dhw: false
  });

  // Dragging state for boxes
  const [draggedBox, setDraggedBox] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const tankRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<number | null>(null);
  
  // Color mapping function based on temperature
  // Blue (10°C) to Red (90°C)
  const getTempColor = (temp: number) => {
    const minT = 10;
    const maxT = 90;
    const percentage = Math.min(100, Math.max(0, ((temp - minT) / (maxT - minT)) * 100));
    // HSL: 240 (blue) to 0 (red)
    const hue = 240 - (percentage / 100) * 240;
    return `hsl(${hue}, 85%, 45%)`;
  };

  // Run simulation step
  const tick = useCallback(() => {
    if (simSpeed === 0) return;

    setState((prev) => {
      // Run multiple sub-steps for stability and speed
      let currentT = [...prev.temperatures];
      const stepsPerFrame = simSpeed; 
      const dt = 1.0; // 1 second per step
      
      for (let i = 0; i < stepsPerFrame; i++) {
        currentT = simulateStep({ ...prev, temperatures: currentT }, params, dt);
      }
      
      // Update elapsed time (convert dt * stepsPerFrame seconds to minutes)
      setElapsedTime(t => t + (dt * stepsPerFrame) / 60);

      return {
        ...prev,
        temperatures: currentT
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
    
    // We snap relative to the fixed tank position in the canvas
    // Tank top is 80px, tank height is 420px.
    // The canvas is relative, we can find the canvas container bounds.
    const canvasElement = document.getElementById('diagram-canvas');
    if (!canvasElement) return;

    const rect = canvasElement.getBoundingClientRect();
    const y = e.clientY - (rect.top + 80); // relative to tank top

    // Calculate fractional height from bottom (0 = bottom, 1 = top)
    let height = 1 - (y / 420);
    height = Math.min(1, Math.max(0, height)); // clamp between 0 and 1
    
    // Round to nearest node level to align with finite volumes
    const nodeIdx = Math.min(NUM_NODES - 1, Math.max(0, Math.floor(height * NUM_NODES)));
    const snappedHeight = (nodeIdx + 0.5) / NUM_NODES;

    setState(prev => ({
      ...prev,
      ports: prev.ports.map(p => p.id === dragPortId ? { ...p, height: snappedHeight } : p)
    }));
  }, [dragPortId]);

  const handlePortMouseUp = useCallback(() => {
    setDragPortId(null);
  }, []);

  // Box Dragging handlers
  const handleBoxMouseDown = (loopId: string, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input') || target.closest('button') || target.closest('select')) return;
    
    setDraggedBox(loopId);
    setDragOffset({
      x: e.clientX - boxPositions[loopId].x,
      y: e.clientY - boxPositions[loopId].y
    });
  };

  const handleBoxMouseMove = useCallback((e: MouseEvent) => {
    if (!draggedBox) return;
    
    let newX = e.clientX - dragOffset.x;
    let newY = e.clientY - dragOffset.y;
    
    const isDraggedSource = state.loops.find(l => l.id === draggedBox)?.type === 'source';
    const boxH = expandedBoxes[draggedBox] ? (isDraggedSource ? 210 : 180) : 85;
    
    // Bounds check to keep within the 1050x580 canvas
    // Box dimensions: width 220px, height varies from 85px to 180px.
    newX = Math.min(1050 - 220 - 10, Math.max(10, newX));
    newY = Math.min(580 - boxH - 10, Math.max(10, newY));
    
    setBoxPositions(prev => ({
      ...prev,
      [draggedBox]: { x: newX, y: newY }
    }));
  }, [draggedBox, dragOffset, expandedBoxes]);

  const handleBoxMouseUp = useCallback(() => {
    setDraggedBox(null);
  }, []);

  // Listen to global mouse events during drag
  useEffect(() => {
    if (dragPortId) {
      window.addEventListener('mousemove', handlePortMouseMove);
      window.addEventListener('mouseup', handlePortMouseUp);
    }
    if (draggedBox) {
      window.addEventListener('mousemove', handleBoxMouseMove);
      window.addEventListener('mouseup', handleBoxMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handlePortMouseMove);
      window.removeEventListener('mouseup', handlePortMouseUp);
      window.removeEventListener('mousemove', handleBoxMouseMove);
      window.removeEventListener('mouseup', handleBoxMouseUp);
    };
  }, [dragPortId, draggedBox, handlePortMouseMove, handlePortMouseUp, handleBoxMouseMove, handleBoxMouseUp]);

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
    field: 'designPower' | 'designTempSupply' | 'designTempReturn' | 'name' | 'limitedByPower', 
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
  
  // Heat stored in kWh: E = V * Cp * rho * dT / 3600
  // Reference temperature: 10°C (mains temperature)
  const heatStoredKWh = Math.round(
    (params.tankVolume * 4180 * 1000 * Math.max(0, avgTemp - 10)) / (1000 * 3600 * 1000) * 10
  ) / 10;

  // -------------------------------------------------------------
  // Internal Flow Math (Calculating centers of mass for ports)
  // -------------------------------------------------------------
  const getPortH = (id: string) => state.ports.find(p => p.id === id)?.height || 0.5;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col antialiased">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-4">
          <a 
            href="../index.html" 
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
            className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition duration-200"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col p-6 overflow-y-auto w-full space-y-6">
        
        {/* Upper Visualizer (Diagram Canvas takes up the full width) */}
        <div className="w-full flex flex-col items-center">
          
          {/* Dashboard Cards */}
          <div className="grid grid-cols-3 gap-4 mb-4 max-w-[1050px] mx-auto w-full">
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between backdrop-blur">
              <span className="text-xs text-slate-500 font-medium flex items-center space-x-1">
                <Thermometer className="w-3.5 h-3.5 text-orange-400" />
                <span>Avg Tank Temp</span>
              </span>
              <span className="text-2xl font-bold tracking-tight text-white mt-1">
                {avgTemp} <span className="text-lg font-light text-slate-400">°C</span>
              </span>
            </div>
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between backdrop-blur">
              <span className="text-xs text-slate-500 font-medium flex items-center space-x-1">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                <span>Thermal Energy</span>
              </span>
              <span className="text-2xl font-bold tracking-tight text-white mt-1">
                {heatStoredKWh} <span className="text-lg font-light text-slate-400">kWh</span>
              </span>
            </div>
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between backdrop-blur">
              <span className="text-xs text-slate-500 font-medium flex items-center space-x-1">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>Stratification Index</span>
              </span>
              <span className="text-2xl font-bold tracking-tight text-white mt-1">
                {/* Stratification index calculated from temperature standard deviation */}
                {Math.round(
                  Math.sqrt(state.temperatures.map(t => Math.pow(t - avgTemp, 2)).reduce((a, b) => a + b, 0) / NUM_NODES) * 10
                ) / 10}
              </span>
            </div>
          </div>

          {/* Draggable Tank Canvas Area */}
          <div className="w-full flex items-center justify-center relative min-h-[580px]">
            {/* Help Overlay */}
            {showHelp && (
              <div className="absolute inset-0 bg-slate-950/95 z-40 p-8 flex flex-col justify-center rounded-2xl border border-slate-800/60 overflow-y-auto max-w-[1050px] mx-auto">
                <h3 className="text-lg font-bold text-white mb-4">Stratified Tank Simulation Help</h3>
                <ul className="space-y-3 text-sm text-slate-300">
                  <li className="flex items-start space-x-2">
                    <span className="text-orange-400 font-bold">•</span>
                    <span><strong>Draggable Boxes</strong>: Grab the header of any loop box to drag and position it anywhere in the workspace. Toggle them ON/OFF or edit design parameters by clicking the slider icon.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-orange-400 font-bold">•</span>
                    <span><strong>Draggable Ports</strong>: Hover and drag the circular connection knobs on the sides of the tank to adjust connection heights along the tank.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-orange-400 font-bold">•</span>
                    <span><strong>Thermal Stratification</strong>: The simulation solves the 1D finite volume heat equation and handles buoyancy-driven mixing when cold water sits above hot water.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-orange-400 font-bold">•</span>
                    <span><strong>Exchanged Power & Flow</strong>: Flow rates (m³/h) are automatically calculated from Design Power and Delta T. If the drawn return water temperature rises (for sources) or drops (for sinks), the actual heat transfer rate decreases automatically.</span>
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

            {/* Draggable Canvas container (fixed w/h) */}
            <div 
              id="diagram-canvas" 
              className="w-[1050px] h-[580px] relative bg-slate-900/10 border border-slate-800/80 rounded-2xl shadow-2xl flex-shrink-0"
            >
              
              {/* SVG Pipes & Arrows Overlay */}
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

                {/* Render lines for active loops */}
                {state.loops.map(loop => {
                  if (!loop.isActive) return null;
                  const supplyPort = state.ports.find(p => p.id === loop.ports.supply);
                  const returnPort = state.ports.find(p => p.id === loop.ports.return);
                  if (!supplyPort || !returnPort) return null;

                  const box = boxPositions[loop.id];
                  const isSource = loop.type === 'source';

                  // Tank left/right coordinates
                  const tankLeft = 450;
                  const tankRight = 600;
                  const tankTop = 80;
                  const tankHeight = 420;

                  const supplyPortY = tankTop + tankHeight * (1 - supplyPort.height);
                  const returnPortY = tankTop + tankHeight * (1 - returnPort.height);

                  let supplyPath = "";
                  let returnPath = "";
                  const dx = 50; // Use dx = 50 for the Bezier portion now that we have 20px stubs

                  if (isSource) {
                    // Source (left to tank)
                    const x1_s = box.x + 220;
                    const y1_s = box.y + 25;
                    const x2_s = tankLeft;
                    const y2_s = supplyPortY;

                    supplyPath = `M ${x1_s} ${y1_s} L ${x1_s + 20} ${y1_s} C ${x1_s + 20 + dx} ${y1_s}, ${x2_s - 20 - dx} ${y2_s}, ${x2_s - 20} ${y2_s} L ${x2_s} ${y2_s}`;

                    // Return: Tank to Box bottom-right
                    const isExpanded = expandedBoxes[loop.id];
                    const boxH = isExpanded ? 210 : 85;
                    const x1_r = tankLeft;
                    const y1_r = returnPortY;
                    const x2_r = box.x + 220;
                    const y2_r = box.y + boxH - 25;

                    returnPath = `M ${x1_r} ${y1_r} L ${x1_r - 20} ${y1_r} C ${x1_r - 20 - dx} ${y1_r}, ${x2_r + 20 + dx} ${y2_r}, ${x2_r + 20} ${y2_r} L ${x2_r} ${y2_r}`;
                  } else {
                    // Sink (tank to right box)
                    const x1_d = tankRight;
                    const y1_d = returnPortY;
                    const x2_d = box.x;
                    const y2_d = box.y + 25;

                    supplyPath = `M ${x1_d} ${y1_d} L ${x1_d + 20} ${y1_d} C ${x1_d + 20 + dx} ${y1_d}, ${x2_d - 20 - dx} ${y2_d}, ${x2_d - 20} ${y2_d} L ${x2_d} ${y2_d}`;

                    // Return: Box bottom-left to Tank
                    const isExpanded = expandedBoxes[loop.id];
                    const boxH = isExpanded ? 180 : 85;
                    const x1_r = box.x;
                    const y1_r = box.y + boxH - 25;
                    const x2_r = tankRight;
                    const y2_r = supplyPortY;

                    returnPath = `M ${x1_r} ${y1_r} L ${x1_r - 20} ${y1_r} C ${x1_r - 20 - dx} ${y1_r}, ${x2_r + 20 + dx} ${y2_r}, ${x2_r + 20} ${y2_r} L ${x2_r} ${y2_r}`;
                  }

                  // Get actual parameters for dash speed
                  const actuals = getLoopActuals(loop, state.temperatures, state.ports);
                  // Speed scales with flow rate and duration factor in numerator
                  const animDuration = actuals.flowRate > 0 ? (flowDurationFactor / actuals.flowRate) : 0;

                  return (
                    <g key={`lines-${loop.id}`}>
                      {/* Background pipes (glow effect) */}
                      <path d={supplyPath} fill="none" stroke={loop.color} strokeWidth="6" opacity="0.1" />
                      <path d={returnPath} fill="none" stroke={loop.color} strokeWidth="6" opacity="0.1" />
                      
                      {/* Flow lines */}
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

              {/* Mid-point HTML Badges overlay */}
              {state.loops.map(loop => {
                if (!loop.isActive) return null;
                const supplyPort = state.ports.find(p => p.id === loop.ports.supply);
                const returnPort = state.ports.find(p => p.id === loop.ports.return);
                if (!supplyPort || !returnPort) return null;

                const box = boxPositions[loop.id];
                const isExpanded = expandedBoxes[loop.id];
                const isSource = loop.type === 'source';
                const boxH = isExpanded ? (isSource ? 210 : 180) : 85;
                const tankLeft = 450;
                const tankRight = 600;
                const tankTop = 80;
                const tankHeight = 420;

                const supplyPortY = tankTop + tankHeight * (1 - supplyPort.height);
                const returnPortY = tankTop + tankHeight * (1 - returnPort.height);

                const actuals = getLoopActuals(loop, state.temperatures, state.ports);

                let supplyMid = { x: 0, y: 0 };
                let returnMid = { x: 0, y: 0 };

                if (isSource) {
                  supplyMid = getMidpoint(box.x + 220, box.y + 25, tankLeft, supplyPortY);
                  returnMid = getMidpoint(tankLeft, returnPortY, box.x + 220, box.y + boxH - 25);
                } else {
                  supplyMid = getMidpoint(tankRight, returnPortY, box.x, box.y + 25);
                  returnMid = getMidpoint(box.x, box.y + boxH - 25, tankRight, supplyPortY);
                }

                // Hot stream is colored with loop.color, cold/return stream is colored grey (#94a3b8)
                const topTemp = isSource ? actuals.tempIn : actuals.tempOut;
                const bottomTemp = isSource ? actuals.tempOut : actuals.tempIn;

                return (
                  <React.Fragment key={`badges-${loop.id}`}>
                    {/* Top Line Badge - Stacked Vertically */}
                    <div
                      style={{ left: supplyMid.x, top: supplyMid.y, transform: 'translate(-50%, -50%)' }}
                      className="absolute z-30 bg-slate-950/95 border border-slate-800 text-[10px] font-mono px-2 py-1 rounded shadow-lg pointer-events-none flex flex-col items-center justify-center leading-normal"
                    >
                      <span className="text-slate-400 text-[9px]">{actuals.flowRate.toFixed(2)} m³/h</span>
                      <span style={{ color: loop.color }} className="font-bold text-[9px] mt-0.5">{topTemp.toFixed(1)}°C</span>
                    </div>

                    {/* Bottom Line Badge - Stacked Vertically */}
                    <div
                      style={{ left: returnMid.x, top: returnMid.y, transform: 'translate(-50%, -50%)' }}
                      className="absolute z-30 bg-slate-950/95 border border-slate-800 text-[10px] font-mono px-2 py-1 rounded shadow-lg pointer-events-none flex flex-col items-center justify-center leading-normal"
                    >
                      <span className="text-slate-400 text-[9px]">{actuals.flowRate.toFixed(2)} m³/h</span>
                      <span className="text-slate-300 font-bold text-[9px] mt-0.5">{bottomTemp.toFixed(1)}°C</span>
                    </div>
                  </React.Fragment>
                );
              })}

              {/* Tank Visual (Centered at x: 450px) */}
              <div 
                ref={tankRef}
                style={{ left: '450px', top: '80px', width: '150px', height: '420px' }}
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

                {/* Internal Flow SVG Overlay (Dotted flow dynamics vectors inside tank) */}
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
                          y: (1 - supplyPort.height) * 420,
                          height: supplyPort.height,
                          flow: actuals.flowRate,
                          color: supplyPort.color
                        });

                        activeOutlets.push({
                          id: returnPort.id,
                          loopId: loop.id,
                          x: isLeft ? 0 : 150,
                          y: (1 - returnPort.height) * 420,
                          height: returnPort.height,
                          flow: actuals.flowRate,
                          color: returnPort.color
                        });
                      }
                    });

                    // Sort top-to-bottom (height descending)
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
                          // Vertical bypass on the same wall
                          pathD = `M ${inlet.x} ${inlet.y} C 75 ${inlet.y}, 75 ${outlet.y}, ${outlet.x} ${outlet.y}`;
                        } else {
                          // Diagonal/Horizontal cross-flow between opposite walls
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

                      if (inlet.flow <= tol) {
                        i++;
                      }
                      if (outlet.flow <= tol) {
                        j++;
                      }
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

                        {/* Internal Flow Value Badges */}
                        {paths.map((p, idx) => {
                          if (p.flow <= 0.01) return null;
                          
                          // Midpoint calculation (local coordinates inside the tank visual container)
                          let midX = 0;
                          let midY = (p.inletY + p.outletY) / 2;
                          if (p.inletX === p.outletX) {
                            // Bypass curve on wall
                            midX = p.inletX === 0 ? 56.25 : 93.75;
                          } else {
                            // Cross flow
                            midX = (p.inletX + p.outletX) / 2;
                          }

                          return (
                            <div
                              key={`internal-badge-${idx}`}
                              style={{ left: `${midX}px`, top: `${midY}px`, transform: 'translate(-50%, -50%)', zIndex: 30 }}
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

                {/* 3-Point Temperature Overlays (Top, Middle, Bottom) */}
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

              {/* Draggable Port Handles along Left/Right boundaries of Tank */}
              {state.ports.map((port) => {
                const isLeft = port.loopId === 'solar' || port.loopId === 'hp';
                const xPos = isLeft ? 450 : 600;
                const yPos = 80 + 420 * (1 - port.height);
                
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

              {/* Draggable Loop Parameter Boxes */}
              {state.loops.map((loop) => {
                const box = boxPositions[loop.id];
                const isExpanded = expandedBoxes[loop.id];
                const actuals = getLoopActuals(loop, state.temperatures, state.ports);
                const isSource = loop.type === 'source';
                const boxH = isExpanded ? 180 : 85;

                return (
                  <div
                    key={loop.id}
                    style={{
                      left: `${box.x}px`,
                      top: `${box.y}px`,
                      width: '220px',
                      height: `${boxH}px`,
                      borderLeftColor: loop.color
                    }}
                    onMouseDown={(e) => handleBoxMouseDown(loop.id, e)}
                    className="absolute bg-slate-900/90 border border-slate-800/95 border-l-4 rounded-xl shadow-xl flex flex-col overflow-hidden transition-all duration-150 z-10 select-none backdrop-blur-sm"
                  >
                    {/* Header (Drag Handle) */}
                    <div className="px-3 py-2 bg-slate-950/40 border-b border-slate-800/50 flex items-center justify-between cursor-grab active:cursor-grabbing min-w-0">
                      <div className="flex items-center space-x-2 min-w-0">
                        <GripVertical className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <input
                          type="text"
                          value={loop.name}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateLoopParam(loop.id, 'name', e.target.value)}
                          className="bg-transparent text-xs font-bold text-white focus:outline-none border-b border-transparent hover:border-slate-800 focus:border-slate-700 min-w-0 py-0.5 cursor-text text-ellipsis"
                        />
                      </div>
                      
                      <div className="flex items-center space-x-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {/* ON/OFF Switch */}
                        <label className="relative inline-flex items-center cursor-pointer scale-75">
                          <input
                            type="checkbox"
                            checked={loop.isActive}
                            onChange={() => toggleLoop(loop.id)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4.5 bg-slate-855 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-white peer-checked:after:bg-slate-900"></div>
                        </label>
                        
                        {/* Expand / Controls Switch */}
                        <button
                          onClick={() => setExpandedBoxes(prev => ({ ...prev, [loop.id]: !prev[loop.id] }))}
                          className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
                        >
                          <Sliders className={`w-3.5 h-3.5 transform transition-transform ${isExpanded ? 'rotate-90 text-white' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Box Body */}
                    <div className="flex-1 p-3 flex flex-col justify-between text-xs min-h-0">
                      {isExpanded ? (
                        <div className="space-y-2.5 flex-1 overflow-y-auto mb-2 pr-0.5 scrollbar-thin" onClick={(e) => e.stopPropagation()}>
                          
                          {/* Number Input fields replacing the range sliders */}
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-[10px]">Design Power (kW)</span>
                            <input
                              type="number"
                              value={loop.designPower}
                              onChange={(e) => updateLoopParam(loop.id, 'designPower', Number(e.target.value))}
                              className="w-18 bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 text-right font-mono text-xs text-white focus:outline-none focus:border-slate-700"
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-[10px]">Design Supply Temp (°C)</span>
                            <input
                              type="number"
                              value={loop.designTempSupply}
                              onChange={(e) => updateLoopParam(loop.id, 'designTempSupply', Number(e.target.value))}
                              className="w-18 bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 text-right font-mono text-xs text-white focus:outline-none focus:border-slate-700"
                            />
                          </div>

                          {isSource && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 text-[10px]">Limited by Power</span>
                              <label className="relative inline-flex items-center cursor-pointer scale-75">
                                <input
                                  type="checkbox"
                                  checked={loop.limitedByPower !== false}
                                  onChange={(e) => updateLoopParam(loop.id, 'limitedByPower', e.target.checked)}
                                  className="sr-only peer"
                                />
                                <div className="w-8 h-4.5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-white peer-checked:after:bg-slate-900"></div>
                              </label>
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-[10px]">Design Return Temp (°C)</span>
                            <input
                              type="number"
                              value={loop.designTempReturn}
                              onChange={(e) => updateLoopParam(loop.id, 'designTempReturn', Number(e.target.value))}
                              className="w-18 bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 text-right font-mono text-xs text-white focus:outline-none focus:border-slate-700"
                            />
                          </div>
                        </div>
                      ) : null}

                      {/* Exchanged Power Footer (Always Visible) */}
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

              {/* Tank Volume slider centered right below the tank */}
              <div
                style={{ left: '400px', top: '515px', width: '250px' }}
                className="absolute bg-slate-900/60 border border-slate-800/50 p-2 rounded-xl flex flex-col space-y-1 select-none backdrop-blur-sm z-20"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                  <span>Tank Volume</span>
                  <span className="font-mono text-slate-200 font-bold">{params.tankVolume} Liters</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="3000"
                  step="100"
                  value={params.tankVolume}
                  onChange={(e) => setParams(prev => ({ ...prev, tankVolume: Number(e.target.value) }))}
                  className="w-full h-1 bg-slate-850 rounded appearance-none cursor-pointer accent-white"
                />
              </div>

            </div>
          </div>
        </div>

        {/* Lower Details Section: Z-Profile Chart & Remaining Physical Params side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-[1050px] mx-auto mt-2">
          
          {/* Temperature Profile Graph */}
          <div className="bg-slate-950 border border-slate-900/80 rounded-2xl p-5 flex flex-col h-[380px] shadow-sm">
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

          {/* Compact Physical Params */}
          <div className="bg-slate-950 border border-slate-900/80 rounded-2xl p-5 shadow-sm h-[380px] flex flex-col justify-between">
            <h3 className="font-semibold text-sm text-slate-300 mb-3 flex items-center space-x-2">
              <Settings className="w-4 h-4 text-cyan-400" />
              <span>Physical Parameters</span>
            </h3>
            
            <div className="space-y-3 flex-1 flex flex-col justify-around">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
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
                  className="w-full h-1 bg-slate-855 rounded appearance-none cursor-pointer accent-white"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
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
                  className="w-full h-1 bg-slate-855 rounded appearance-none cursor-pointer accent-white"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
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
                  className="w-full h-1 bg-slate-855 rounded appearance-none cursor-pointer accent-white"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
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
                  className="w-full h-1 bg-slate-855 rounded appearance-none cursor-pointer accent-white"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Animation Duration Factor</span>
                <input 
                  type="number" 
                  step="0.1"
                  min="0.01"
                  value={flowDurationFactor} 
                  onChange={(e) => setFlowDurationFactor(Number(e.target.value))}
                  className="w-18 bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 text-right font-mono text-xs text-white focus:outline-none focus:border-slate-700 hover:border-slate-800"
                />
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

export default App;
