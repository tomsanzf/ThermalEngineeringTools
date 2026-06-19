import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  ChevronRight, 
  ChevronLeft, 
  Sliders, 
  Flame, 
  Droplet, 
  Info,
  HelpCircle,
  TrendingDown,
  Percent,
  CheckCircle,
  ListCollapse
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ReferenceLine,
  ReferenceDot
} from 'recharts';
import { 
  calculatePinch, 
  createDefaultStreams
} from './pinchEngine';
import type { 
  ProcessStream, 
  PinchResults 
} from './pinchEngine';

// Helper to interpolate enthalpy (H) on a composite curve at a given temperature (T)
const interpolateH = (points: { h: number; t: number }[], t: number): number => {
  if (points.length === 0) return 0;
  if (t <= points[0].t) return points[0].h;
  if (t >= points[points.length - 1].t) return points[points.length - 1].h;
  
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (t >= p1.t && t <= p2.t) {
      if (p2.t === p1.t) return p1.h;
      const ratio = (t - p1.t) / (p2.t - p1.t);
      return p1.h + ratio * (p2.h - p1.h);
    }
  }
  return 0;
};

function App() {
  // State
  const [streams, setStreams] = useState<ProcessStream[]>(() => createDefaultStreams());
  const [dTmin, setDTmin] = useState<number>(10);
  const [activeStep, setActiveStep] = useState<number>(0);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  
  // Form State for new stream
  const [newStream, setNewStream] = useState<Omit<ProcessStream, 'id'>>({
    name: 'New Stream',
    type: 'hot',
    tempIn: 100,
    tempOut: 40,
    cp: 1.5,
    q: 90
  });

  // Calculate results dynamically
  const results = useMemo(() => {
    return calculatePinch(streams, dTmin);
  }, [streams, dTmin]);

  // Handle adding stream
  // Handle adding stream
  const handleAddStream = () => {
    const dT = Math.abs(newStream.tempIn - newStream.tempOut);
    const cp = dT > 0 ? Math.round((newStream.q / dT) * 100) / 100 : 0;
    const type = newStream.tempIn > newStream.tempOut ? 'hot' : 'cold';
    
    const streamToAdd: ProcessStream = {
      ...newStream,
      id: Date.now().toString(),
      type,
      cp
    };

    setStreams(prev => [...prev, streamToAdd]);
    
    // Reset form with default values
    setNewStream({
      name: `Stream ${streams.length + 2}`,
      type: 'hot',
      tempIn: 120,
      tempOut: 60,
      cp: 2.0,
      q: 120
    });
  };

  // Handle deleting stream
  const handleDeleteStream = (id: string) => {
    setStreams(prev => prev.filter(s => s.id !== id));
  };

  // Modify existing stream inline
  const handleEditStream = (id: string, field: keyof ProcessStream, value: any) => {
    setStreams(prev => prev.map(s => {
      if (s.id === id) {
        const updated = { ...s, [field]: value };
        // Recalculate type and cp if tempIn, tempOut, or q change
        if (field === 'tempIn' || field === 'tempOut' || field === 'q') {
          const tIn = field === 'tempIn' ? Number(value) : s.tempIn;
          const tOut = field === 'tempOut' ? Number(value) : s.tempOut;
          const q = field === 'q' ? Number(value) : s.q;
          
          updated.type = tIn > tOut ? 'hot' : 'cold';
          const dT = Math.abs(tIn - tOut);
          updated.cp = dT > 0 ? Math.round((q / dT) * 100) / 100 : 0;
        }
        return updated;
      }
      return s;
    }));
  };

  // Energy Statistics
  const stats = useMemo(() => {
    // Without heat recovery:
    // Hot streams release heat (require cooling)
    // Cold streams absorb heat (require heating)
    let totalHotLoad = 0; // Total cooling required without integration
    let totalColdLoad = 0; // Total heating required without integration
    
    streams.forEach(s => {
      if (s.type === 'hot') totalHotLoad += s.q;
      if (s.type === 'cold') totalColdLoad += s.q;
    });

    const recoveryTarget = totalColdLoad - results.qhMin;
    const energySavingsPercent = totalColdLoad > 0 
      ? Math.round((recoveryTarget / totalColdLoad) * 100)
      : 0;

    return {
      totalHotLoad: Math.round(totalHotLoad * 10) / 10,
      totalColdLoad: Math.round(totalColdLoad * 10) / 10,
      recoveryTarget: Math.round(recoveryTarget * 10) / 10,
      energySavingsPercent
    };
  }, [streams, results]);

  const steps = [
    { title: 'Stream Database', desc: 'Input your process streams and set ΔTmin' },
    { title: 'Unshifted Composite Curves', desc: 'Combine hot and cold streams starting from 0 kW' },
    { title: 'Interval Shifts', desc: 'Shift temperatures and map thermal zones' },
    { title: 'Heat Cascade', desc: 'Calculate energy balance & locate the Pinch' },
    { title: 'Pinch-Aligned Composite Curves', desc: 'View Hot & Cold composite T-H profiles aligned at the Pinch' },
    { title: 'Grand Composite Curve', desc: 'Map utility placements against the GCC' }
  ];

  // Find min/max temperature for stable Y domain
  const tempDomain = useMemo(() => {
    if (streams.length === 0) return [0, 200];
    const temps = streams.flatMap(s => [s.tempIn, s.tempOut]);
    const minT = Math.min(...temps);
    const maxT = Math.max(...temps);
    const pad = Math.max((maxT - minT) * 0.1, 10);
    return [Math.max(0, Math.floor(minT - pad)), Math.ceil(maxT + pad)];
  }, [streams]);

  // Find max enthalpy for stable X domain
  const enthalpyDomain = useMemo(() => {
    const maxH = Math.max(stats.totalHotLoad, stats.totalColdLoad + results.qhMin, 100);
    return [0, Math.ceil(maxH * 1.05)];
  }, [stats.totalHotLoad, stats.totalColdLoad, results.qhMin]);

  // Animation State
  const [transitionProgress, setTransitionProgress] = useState<number>(activeStep > 0 ? 1 : 0);

  React.useEffect(() => {
    let animationFrameId: number;
    const startTime = performance.now();
    const duration = 1200; // 1.2 seconds transition
    const startVal = transitionProgress;
    const targetVal = activeStep >= 1 ? 1 : 0;

    if (startVal === targetVal) return;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeInOutCubic
      const ease = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      
      const currentVal = startVal + (targetVal - startVal) * ease;
      setTransitionProgress(currentVal);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setTransitionProgress(targetVal);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [activeStep]);

  // Sort streams by target offset to get their animation order (left-to-right)
  const sortedStreams = useMemo(() => {
    return [...streams].sort((a, b) => {
      const offsetA = a.type === 'hot'
        ? interpolateH(results.hotComposite, a.tempOut)
        : interpolateH(results.coldCompositeRaw, a.tempIn);
      const offsetB = b.type === 'hot'
        ? interpolateH(results.hotComposite, b.tempOut)
        : interpolateH(results.coldCompositeRaw, b.tempIn);
      return offsetA - offsetB;
    });
  }, [streams, results]);

  // Stream animation windows (start and end fractions of the transition progress)
  const streamAnimationData = useMemo(() => {
    const N = sortedStreams.length;
    const span = 0.5; // duration of each stream's individual slide
    
    return sortedStreams.map((s, idx) => {
      const targetOffset = s.type === 'hot'
        ? interpolateH(results.hotComposite, s.tempOut)
        : interpolateH(results.coldCompositeRaw, s.tempIn);
        
      let start = 0;
      let end = 1;
      if (N > 1) {
        start = (idx / (N - 1)) * (1 - span);
        end = start + span;
      }
      
      return {
        id: s.id,
        targetOffset,
        start,
        end
      };
    });
  }, [sortedStreams, results]);

  // Enthalpy shift for Cold Composite curve: 0 in step 1/2, qhMin in steps 3-5
  const coldShift = activeStep >= 2 ? results.qhMin : 0;

  // Prepare Composite Chart Data (Hot and Shifted Cold curves merged)
  const compositeChartData = useMemo(() => {
    const data: { h: number; hotT?: number; coldT?: number }[] = [];
    
    // Add all hot points
    results.hotComposite.forEach(pt => {
      data.push({ h: Math.round(pt.h * 10) / 10, hotT: pt.t });
    });

    // Add all cold points (shifted by coldShift)
    results.coldCompositeRaw.forEach(pt => {
      data.push({ h: Math.round((pt.h + coldShift) * 10) / 10, coldT: pt.t });
    });

    // Sort by Enthalpy (H) ascending
    data.sort((a, b) => a.h - b.h);
    
    // Linearly interpolate missing temperatures to make the lines smooth in Recharts
    const interpolate = (points: { h: number; t: number }[], h: number): number | undefined => {
      if (points.length === 0) return undefined;
      if (h < points[0].h - 0.01 || h > points[points.length - 1].h + 0.01) return undefined;
      if (h <= points[0].h) return points[0].t;
      if (h >= points[points.length - 1].h) return points[points.length - 1].t;
      
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        if (h >= p1.h && h <= p2.h) {
          if (p2.h === p1.h) return p1.t;
          const ratio = (h - p1.h) / (p2.h - p1.h);
          return p1.t + ratio * (p2.t - p1.t);
        }
      }
      return undefined;
    };

    const interpolateCold = (points: { h: number; t: number }[], h: number): number | undefined => {
      const shiftedPoints = points.map(pt => ({ h: pt.h + coldShift, t: pt.t }));
      return interpolate(shiftedPoints, h);
    };

    return data.map(pt => ({
      h: pt.h,
      'Hot Composite': pt.hotT !== undefined ? pt.hotT : interpolate(results.hotComposite, pt.h),
      'Cold Composite': pt.coldT !== undefined ? pt.coldT : interpolateCold(results.coldCompositeRaw, pt.h)
    }));
  }, [results, coldShift]);


  // Grand Composite Curve Chart Data
  const gccChartData = useMemo(() => {
    return results.grandComposite.map(pt => ({
      h: Math.round(pt.h * 10) / 10,
      tShifted: Math.round(pt.t * 10) / 10
    }));
  }, [results]);

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-slate-950 text-slate-100 font-sans flex flex-col antialiased">
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
              <span className="bg-cyan-500/10 text-cyan-400 text-xs px-2.5 py-0.5 rounded-full border border-cyan-500/20 font-medium tracking-wide">
                Process Integration
              </span>
              <h1 className="text-xl font-bold tracking-tight text-white">Pinch Analysis Tool</h1>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Determine energy targets and visualize thermal pinch points</p>
          </div>
        </div>

        {/* Wizard Progress Dots */}
        <div className="hidden md:flex items-center space-x-2">
          {steps.map((step, idx) => (
            <button
              key={idx}
              onClick={() => setActiveStep(idx)}
              className={`h-2.5 rounded-full transition-all duration-300 ${
                activeStep === idx 
                  ? 'w-8 bg-cyan-400' 
                  : idx < activeStep 
                    ? 'w-2.5 bg-slate-600' 
                    : 'w-2.5 bg-slate-800'
              }`}
              title={step.title}
            />
          ))}
        </div>

        {/* Help */}
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setShowHelp(!showHelp)}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition duration-200"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Side: Input Stream Manager / Calculations */}
        <div className="flex-1 lg:flex-[1.1] p-6 flex flex-col overflow-y-auto bg-slate-950 border-r border-slate-900">
          
          {/* Dashboard Summary Cards */}
          {activeStep >= 4 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between backdrop-blur">
                <span className="text-xs text-slate-500 font-medium flex items-center space-x-1.5">
                  <Flame className="w-3.5 h-3.5 text-red-400" />
                  <span>Hot Utility Target</span>
                </span>
                <span className="text-xl font-bold tracking-tight text-white mt-1.5">
                  {results.qhMin} <span className="text-sm font-light text-slate-500">kW</span>
                </span>
              </div>
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between backdrop-blur">
                <span className="text-xs text-slate-500 font-medium flex items-center space-x-1.5">
                  <Droplet className="w-3.5 h-3.5 text-blue-400" />
                  <span>Cold Utility Target</span>
                </span>
                <span className="text-xl font-bold tracking-tight text-white mt-1.5">
                  {results.qcMin} <span className="text-sm font-light text-slate-500">kW</span>
                </span>
              </div>
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between backdrop-blur">
                <span className="text-xs text-slate-500 font-medium flex items-center space-x-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Pinch Temperature</span>
                </span>
                <span className="text-xl font-bold tracking-tight text-white mt-1.5">
                  {results.pinchTempShifted} <span className="text-sm font-light text-slate-500">°C</span>
                </span>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  H: {results.pinchTempHot}°C | C: {results.pinchTempCold}°C
                </div>
              </div>
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between backdrop-blur">
                <span className="text-xs text-slate-500 font-medium flex items-center space-x-1.5">
                  <Percent className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Energy Savings</span>
                </span>
                <span className="text-xl font-bold tracking-tight text-emerald-400 mt-1.5">
                  {stats.energySavingsPercent}%
                </span>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Saved {stats.recoveryTarget} kW
                </div>
              </div>
            </div>
          )}

          {/* Help Overlay */}
          {showHelp && (
            <div className="bg-slate-900 border border-slate-850 rounded-xl p-5 mb-6 text-sm text-slate-300 space-y-3">
              <h3 className="font-bold text-white text-base">What is Pinch Analysis?</h3>
              <p>Pinch Analysis calculates the maximum energy recovery in a thermal process.</p>
              <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-400">
                <li><strong>Hot Streams</strong>: Streams that need cooling (e.g. reactor products). They release heat.</li>
                <li><strong>Cold Streams</strong>: Streams that need heating (e.g. cold feedstocks). They absorb heat.</li>
                <li><strong>ΔTmin (Min Approach Temperature)</strong>: The minimum temperature difference required in heat exchangers. Smaller values increase heat recovery but require larger, more expensive heat exchangers.</li>
                <li><strong>Pinch Point</strong>: The bottleneck temperature dividing the system into an upper zone (heat deficit, requires only hot utility) and a lower zone (heat surplus, requires only cold utility). Don't transfer heat across the pinch!</li>
              </ul>
            </div>
          )}

          {/* Wizard Content */}
          <div className="flex-1 bg-slate-900/20 border border-slate-850 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              {/* Wizard Step Heading */}
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-3 mb-6">
                <div>
                  <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Step {activeStep + 1} of {steps.length}</span>
                  <h2 className="text-lg font-bold text-white mt-0.5">{steps[activeStep].title}</h2>
                  <p className="text-xs text-slate-500">{steps[activeStep].desc}</p>
                </div>
                
                {/* Navigation Buttons on Top Right */}
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    disabled={activeStep === 0}
                    onClick={() => setActiveStep(prev => prev - 1)}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-700/60 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-800 text-xs font-semibold transition"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    disabled={activeStep === steps.length - 1}
                    onClick={() => setActiveStep(prev => prev + 1)}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-30 disabled:pointer-events-none text-xs font-bold transition"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* STEP 1: Stream Entry */}
              {activeStep === 0 && (
                <div className="space-y-6">
                  {/* Slider for dTmin */}
                  <div className="bg-slate-900/40 p-4 border border-slate-850 rounded-xl">
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-slate-300 font-medium">Minimum Approach Temp (ΔTmin)</span>
                      <span className="font-mono text-cyan-400 font-bold">{dTmin} °C</span>
                    </div>
                    <input 
                      type="range" 
                      min="2" 
                      max="35" 
                      value={dTmin} 
                      onChange={(e) => setDTmin(Number(e.target.value))}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    />
                    <p className="text-[10px] text-slate-500 mt-1.5">A typical industrial value is between 5°C and 15°C.</p>
                  </div>

                  {/* Streams List Table */}
                  <div className="overflow-x-auto border border-slate-800/80 rounded-xl bg-slate-950/40">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-medium border-l-2 border-l-transparent">
                          <th className="p-3">Stream Name</th>
                          <th className="p-3">Type</th>
                          <th className="p-3">Tin (°C)</th>
                          <th className="p-3">Tout (°C)</th>
                          <th className="p-3">Power Q (kW)</th>
                          <th className="p-3">Calc. CP (kW/K)</th>
                          <th className="p-3 text-center">Delete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {streams.map((s) => (
                          <tr 
                            key={s.id} 
                            className={`border-b border-slate-800/50 transition duration-150 ${
                              s.type === 'hot' 
                                ? 'bg-red-950/10 hover:bg-red-950/20 border-l-2 border-l-red-500/60' 
                                : 'bg-blue-950/10 hover:bg-blue-950/20 border-l-2 border-l-blue-500/60'
                            }`}
                          >
                            <td className="p-3 font-medium">
                              <input 
                                type="text"
                                value={s.name}
                                onChange={(e) => handleEditStream(s.id, 'name', e.target.value)}
                                className={`bg-transparent border-b border-transparent hover:border-slate-700 focus:outline-none py-0.5 text-xs font-semibold w-full transition ${
                                  s.type === 'hot' 
                                    ? 'text-red-250 focus:border-red-500' 
                                    : 'text-blue-205 focus:border-blue-500'
                                }`}
                              />
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold inline-block border ${
                                s.type === 'hot' 
                                  ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                                  : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                              }`}>
                                {s.type === 'hot' ? 'Hot' : 'Cold'}
                              </span>
                            </td>
                            <td className="p-3">
                              <input 
                                type="number"
                                value={s.tempIn}
                                onChange={(e) => handleEditStream(s.id, 'tempIn', Number(e.target.value))}
                                className={`bg-slate-900/50 border rounded px-1.5 py-0.5 text-xs text-white w-14 text-center focus:outline-none transition ${
                                  s.type === 'hot' 
                                    ? 'border-red-500/20 focus:border-red-500 focus:ring-1 focus:ring-red-500/40' 
                                    : 'border-blue-500/20 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40'
                                }`}
                              />
                            </td>
                            <td className="p-3">
                              <input 
                                type="number"
                                value={s.tempOut}
                                onChange={(e) => handleEditStream(s.id, 'tempOut', Number(e.target.value))}
                                className={`bg-slate-900/50 border rounded px-1.5 py-0.5 text-xs text-white w-14 text-center focus:outline-none transition ${
                                  s.type === 'hot' 
                                    ? 'border-red-500/20 focus:border-red-500 focus:ring-1 focus:ring-red-500/40' 
                                    : 'border-blue-500/20 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40'
                                }`}
                              />
                            </td>
                            <td className="p-3">
                              <input 
                                type="number"
                                value={s.q}
                                onChange={(e) => handleEditStream(s.id, 'q', Number(e.target.value))}
                                className={`bg-slate-900/50 border rounded px-1.5 py-0.5 text-xs text-white w-16 text-center focus:outline-none transition ${
                                  s.type === 'hot' 
                                    ? 'border-red-500/20 focus:border-red-500 focus:ring-1 focus:ring-red-500/40' 
                                    : 'border-blue-500/20 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40'
                                }`}
                              />
                            </td>
                            <td className="p-3 font-mono font-medium text-slate-400">{s.cp}</td>
                            <td className="p-3 text-center">
                              <button 
                                onClick={() => handleDeleteStream(s.id)}
                                className={`p-1.5 text-slate-500 rounded-lg transition ${
                                  s.type === 'hot' ? 'hover:bg-red-500/10 hover:text-red-400' : 'hover:bg-blue-500/10 hover:text-blue-400'
                                }`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Add Stream Form */}
                  {(() => {
                    const isHot = newStream.tempIn > newStream.tempOut;
                    return (
                      <div className={`border rounded-xl p-4 transition duration-300 ${
                        isHot ? 'bg-red-950/5 border-red-500/10' : 'bg-blue-950/5 border-blue-500/10'
                      }`}>
                        <h4 className="font-semibold text-xs text-slate-400 mb-3 flex items-center space-x-1.5">
                          <Plus className={`w-3.5 h-3.5 ${isHot ? 'text-red-400' : 'text-blue-400'}`} />
                          <span>Add Process Stream</span>
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11px]">
                          <div className="col-span-2 sm:col-span-1">
                            <label className="block text-slate-500 mb-1">Name</label>
                            <input 
                              type="text"
                              value={newStream.name}
                              onChange={(e) => setNewStream(prev => ({ ...prev, name: e.target.value }))}
                              className={`bg-slate-900 border rounded px-2.5 py-1.5 text-xs text-white w-full focus:outline-none transition ${
                                isHot
                                  ? 'border-red-500/20 focus:border-red-500 focus:ring-1 focus:ring-red-500/40'
                                  : 'border-blue-500/20 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 mb-1">Supply Temp (Tin °C)</label>
                            <input 
                              type="number"
                              value={newStream.tempIn}
                              onChange={(e) => setNewStream(prev => ({ ...prev, tempIn: Number(e.target.value) }))}
                              className={`bg-slate-900 border rounded px-2.5 py-1.5 text-xs text-white w-full focus:outline-none transition ${
                                isHot
                                  ? 'border-red-500/20 focus:border-red-500 focus:ring-1 focus:ring-red-500/40'
                                  : 'border-blue-500/20 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 mb-1">Target Temp (Tout °C)</label>
                            <input 
                              type="number"
                              value={newStream.tempOut}
                              onChange={(e) => setNewStream(prev => ({ ...prev, tempOut: Number(e.target.value) }))}
                              className={`bg-slate-900 border rounded px-2.5 py-1.5 text-xs text-white w-full focus:outline-none transition ${
                                isHot
                                  ? 'border-red-500/20 focus:border-red-500 focus:ring-1 focus:ring-red-500/40'
                                  : 'border-blue-500/20 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 mb-1">Power Q (kW)</label>
                            <input 
                              type="number"
                              value={newStream.q}
                              onChange={(e) => setNewStream(prev => ({ ...prev, q: Number(e.target.value) }))}
                              className={`bg-slate-900 border rounded px-2.5 py-1.5 text-xs text-white w-full focus:outline-none transition ${
                                isHot
                                  ? 'border-red-500/20 focus:border-red-500 focus:ring-1 focus:ring-red-500/40'
                                  : 'border-blue-500/20 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40'
                              }`}
                            />
                          </div>
                          <div className="col-span-2 sm:col-span-1 flex items-end">
                            <button 
                              onClick={handleAddStream}
                              className={`font-bold py-1.5 px-3 rounded-lg text-xs w-full text-slate-950 transition duration-150 ${
                                isHot
                                  ? 'bg-red-500 hover:bg-red-400'
                                  : 'bg-blue-500 hover:bg-blue-400'
                              }`}
                            >
                              Add Stream
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* STEP 2: Unshifted Composite Curves */}
              {activeStep === 1 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">
                    Before finding the Pinch, we combine all hot streams into a single Hot Composite Curve and all cold streams into a single Cold Composite Curve. Both curves start at <span className="font-semibold text-cyan-400">0 kW enthalpy</span>.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-red-950/10 border border-red-500/10 p-4 rounded-xl space-y-2">
                      <h4 className="font-semibold text-xs text-red-400 flex items-center space-x-1.5">
                        <Flame className="w-3.5 h-3.5" />
                        <span>Hot Composite Profile</span>
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Combines all hot streams. Total heat available for recovery: 
                        <span className="font-mono font-bold text-white block mt-1 text-sm">{stats.totalHotLoad} kW</span>
                      </p>
                    </div>

                    <div className="bg-blue-950/10 border border-blue-500/10 p-4 rounded-xl space-y-2">
                      <h4 className="font-semibold text-xs text-blue-400 flex items-center space-x-1.5">
                        <Droplet className="w-3.5 h-3.5" />
                        <span>Cold Composite Profile</span>
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Combines all cold streams. Total heat required by process:
                        <span className="font-mono font-bold text-white block mt-1 text-sm">{stats.totalColdLoad} kW</span>
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-900/30 border border-slate-850 p-4 rounded-xl text-xs text-slate-400 space-y-2">
                    <h4 className="font-semibold text-slate-200">How they are constructed:</h4>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Divide the temperature range into intervals based on stream inlet/outlet temperatures.</li>
                      <li>In each interval, sum the heat capacities (\(\sum CP\)) of all active streams.</li>
                      <li>Calculate the change in enthalpy for each interval: \(dH = \sum CP \times dT\).</li>
                      <li>Accumulate these enthalpies starting from 0 kW to plot the composite curves.</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* STEP 3: Shifted Temperatures */}
              {activeStep === 2 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">
                    To compute interval heat balances, we shift temperatures by <span className="font-semibold text-cyan-400">ΔTmin / 2 ({dTmin/2}°C)</span>:
                    Hot streams are shifted <span className="text-red-400">downward</span>, and cold streams are shifted <span className="text-blue-400">upward</span>.
                  </p>

                  <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/40">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 border-l-2 border-l-transparent">
                          <th className="p-3">Stream</th>
                          <th className="p-3">Type</th>
                          <th className="p-3">Supply Tin</th>
                          <th className="p-3">Shifted Tin'</th>
                          <th className="p-3">Target Tout</th>
                          <th className="p-3">Shifted Tout'</th>
                        </tr>
                      </thead>
                      <tbody>
                        {streams.map((s) => {
                          const shift = s.type === 'hot' ? -dTmin/2 : dTmin/2;
                          return (
                            <tr 
                              key={s.id} 
                              className={`border-b border-slate-800/50 transition duration-150 ${
                                s.type === 'hot' 
                                  ? 'bg-red-950/10 border-l-2 border-l-red-500/50' 
                                  : 'bg-blue-950/10 border-l-2 border-l-blue-500/50'
                              }`}
                            >
                              <td className="p-3 font-medium text-slate-200">{s.name}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  s.type === 'hot' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                }`}>
                                  {s.type.toUpperCase()}
                                </span>
                              </td>
                              <td className="p-3 font-mono">{s.tempIn}°C</td>
                              <td className={`p-3 font-mono font-bold ${s.type === 'hot' ? 'text-red-400' : 'text-blue-400'}`}>
                                {s.tempIn + shift}°C
                              </td>
                              <td className="p-3 font-mono">{s.tempOut}°C</td>
                              <td className={`p-3 font-mono font-bold ${s.type === 'hot' ? 'text-red-400' : 'text-blue-400'}`}>
                                {s.tempOut + shift}°C
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Visualizing intervals */}
                  <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl">
                    <h4 className="font-semibold text-xs text-slate-300 mb-3">Unique Shifted Temperatures (Interval Boundaries)</h4>
                    <div className="flex flex-wrap gap-2">
                      {results.shiftedTemps.map((t, idx) => (
                        <div key={idx} className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 font-mono text-xs flex items-center space-x-1.5 shadow-sm">
                          <span className="text-slate-500 font-normal">T{idx}':</span>
                          <span className="font-bold text-white">{t}°C</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: Heat Cascade & Pinch Point */}
              {activeStep === 3 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">
                    The heat cascade aggregates the heat surplus or deficit in each temperature interval. 
                    The cascade is adjusted so that no heat flow is negative. The point where the heat flow is 
                    <span className="text-amber-400 font-semibold"> exactly zero</span> marks the Pinch Temperature.
                  </p>

                  <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/40">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 border-l-4 border-l-transparent">
                          <th className="p-3">Interval Boundary</th>
                          <th className="p-3">Shifted Temp</th>
                          <th className="p-3">Interval Heat Balance (dH)</th>
                          <th className="p-3">Raw Cascade</th>
                          <th className="p-3">Adjusted Cascade</th>
                          <th className="p-3 text-center">Pinch?</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.shiftedTemps.map((t, idx) => {
                          const dH = idx < results.intervals.length ? results.intervals[idx].dH : null;
                          const rawH = results.rawCascade[idx];
                          const adjH = results.adjustedCascade[idx];
                          const isPinch = Math.abs(adjH) < 1e-5;
                          
                          return (
                            <tr 
                              key={idx} 
                              className={`border-b border-slate-800/50 hover:bg-slate-900/20 transition ${
                                isPinch ? 'bg-amber-500/5 border-l-4 border-l-amber-500' : 'border-l-4 border-l-transparent'
                              }`}
                            >
                              <td className="p-3 text-slate-500 font-mono">T{idx}'</td>
                              <td className="p-3 font-mono font-bold text-white">{t}°C</td>
                              <td className="p-3 font-mono text-slate-400">
                                {dH !== null ? `${Math.round(dH * 10) / 10} kW` : '-'}
                              </td>
                              <td className="p-3 font-mono text-slate-400">{Math.round(rawH * 10) / 10} kW</td>
                              <td className={`p-3 font-mono font-bold ${isPinch ? 'text-amber-400 text-shadow-glow' : 'text-slate-300'}`}>
                                {Math.round(adjH * 10) / 10} kW
                              </td>
                              <td className="p-3 text-center">
                                {isPinch && (
                                  <span className="bg-amber-500/20 text-amber-400 text-[9px] font-bold px-2 py-0.5 rounded border border-amber-500/30 uppercase tracking-wider">
                                    Pinch
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* STEP 5: Pinch-Aligned Composite Curves Summary */}
              {activeStep === 4 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">
                    The Hot and Cold Composite Curves plot process temperatures against cumulative Enthalpy.
                    The curves are shifted horizontally such that the closest approach between them is exactly 
                    <span className="font-semibold text-cyan-400"> ΔTmin ({dTmin}°C)</span> at the actual temperatures.
                  </p>
                  
                  <div className="bg-slate-900/30 border border-slate-850 p-4 rounded-xl space-y-2 text-xs">
                    <h4 className="font-semibold text-slate-200">Curve Interpretation Guide:</h4>
                    <div className="grid grid-cols-2 gap-4 text-slate-400">
                      <div>
                        <span className="text-white font-semibold">• Top Horizontal Overlap</span>: Represents the minimum hot utility required ($Q_{H,min}$ = {results.qhMin} kW).
                      </div>
                      <div>
                        <span className="text-white font-semibold">• Bottom Horizontal Overlap</span>: Represents the minimum cold utility required ($Q_{C,min}$ = {results.qcMin} kW).
                      </div>
                      <div className="col-span-2">
                        <span className="text-white font-semibold">• Intermediate Overlap Zone</span>: Represents the heat recovery potential ($Q_{rec}$ = {stats.recoveryTarget} kW) within the process itself.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 6: GCC Summary */}
              {activeStep === 5 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">
                    The Grand Composite Curve (GCC) plots the net heat cascade surplus or deficit vs shifted temperatures.
                    It shows the thermodynamic "pockets" where internal heat integration occurs.
                  </p>
                  
                  <div className="bg-slate-900/30 border border-slate-850 p-4 rounded-xl space-y-2.5 text-xs text-slate-400">
                    <h4 className="font-semibold text-slate-200">Utility Placement Rules:</h4>
                    <ul className="list-disc list-inside space-y-1.5">
                      <li><strong>Above the Pinch</strong>: The system is in heat deficit. We place hot utilities (steam, boilers) at the highest possible temperature levels where they touch the GCC.</li>
                      <li><strong>Below the Pinch</strong>: The system is in heat surplus. We place cold utilities (cooling water, ambient air) at the lowest temperature levels to absorb the waste heat.</li>
                      <li><strong>Pockets</strong>: The closed loops (pockets) represent process-to-process heat exchange that is fully balanced inside the process.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Charts Display Area */}
        <div className="flex-1 lg:flex-[0.9] bg-slate-900/40 p-6 flex flex-col justify-between overflow-y-auto">
          
          {/* Charts Container */}
          <div className="flex-1 flex flex-col justify-center min-h-[450px] space-y-6">
            
            {/* Step-conditional charts */}
            {activeStep < 5 ? (
              // Unified Chart for Steps 1-5: Stable frame with staggered transitions
              <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 flex flex-col flex-1">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-sm text-slate-200">
                      {activeStep === 0 
                        ? "Individual Process Streams" 
                        : activeStep === 1 
                          ? "Unshifted Composite Curves" 
                          : "Composite Curves (T-H Diagram)"
                      }
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      {activeStep === 0 
                        ? "Plot of each stream starting at 0 kW enthalpy" 
                        : activeStep === 1 
                          ? "Hot and Cold composite profiles starting at 0 kW" 
                          : "Plot of temperature vs cumulative enthalpy"
                      }
                    </p>
                  </div>
                  <div className="flex items-center space-x-3 text-[10px] font-mono">
                    {activeStep === 0 ? (
                      <>
                        <span className="flex items-center space-x-1">
                          <span className="w-2.5 h-0.5 bg-red-500 inline-block"></span>
                          <span className="text-slate-400">Hot Streams</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <span className="w-2.5 h-0.5 bg-blue-500 inline-block"></span>
                          <span className="text-slate-400">Cold Streams</span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex items-center space-x-1">
                          <span className="w-2.5 h-0.5 bg-red-500 inline-block"></span>
                          <span className="text-slate-400">Hot Composite</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <span className="w-2.5 h-0.5 bg-blue-500 inline-block"></span>
                          <span className="text-slate-400">
                            {activeStep === 1 ? "Cold Composite (Unshifted)" : "Cold Composite"}
                          </span>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex-1 w-full relative min-h-[350px]">
                  {streams.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
                      No streams entered. Add process streams using the table.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis 
                          type="number" 
                          dataKey="h" 
                          domain={enthalpyDomain}
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          stroke="#334155"
                          unit=" kW"
                        />
                        <YAxis 
                          type="number" 
                          domain={tempDomain}
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          stroke="#334155"
                          unit="°C"
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px' }}
                          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                          itemStyle={{ color: '#f8fafc', fontSize: 12 }}
                          formatter={(value, name, item) => {
                            if (activeStep === 0) {
                              const stream = streams.find(s => s.name === name || s.id === item.dataKey);
                              const label = stream ? `${stream.name} (${stream.type === 'hot' ? 'Hot' : 'Cold'})` : String(name);
                              return [`${value}°C`, label];
                            } else {
                              return [`${value}°C`, String(name)];
                            }
                          }}
                        />
                        
                        {/* Composite Curves */}
                        <Line 
                          data={compositeChartData}
                          type="linear" 
                          dataKey="Hot Composite" 
                          stroke="#ef4444" 
                          strokeWidth={3}
                          strokeOpacity={activeStep >= 1 ? transitionProgress : 0}
                          dot={false}
                          activeDot={activeStep >= 1 ? { r: 4 } : false}
                          connectNulls
                        />
                        <Line 
                          data={compositeChartData}
                          type="linear" 
                          dataKey="Cold Composite" 
                          stroke="#3b82f6" 
                          strokeWidth={3}
                          strokeOpacity={activeStep >= 1 ? transitionProgress : 0}
                          dot={false}
                          activeDot={activeStep >= 1 ? { r: 4 } : false}
                          connectNulls
                        />

                        {/* Individual Process Streams */}
                        {streams.map((s) => {
                          const anim = streamAnimationData.find(a => a.id === s.id);
                          const start = anim ? anim.start : 0;
                          const end = anim ? anim.end : 1;
                          const targetOffset = anim ? anim.targetOffset : 0;
                          
                          let f = 0;
                          if (transitionProgress <= start) {
                            f = 0;
                          } else if (transitionProgress >= end) {
                            f = 1;
                          } else {
                            f = (transitionProgress - start) / (end - start);
                          }
                          
                          const currentOffset = f * targetOffset;

                          const lineData = s.type === 'hot'
                            ? [{ h: currentOffset, t: s.tempOut }, { h: currentOffset + s.q, t: s.tempIn }]
                            : [{ h: currentOffset, t: s.tempIn }, { h: currentOffset + s.q, t: s.tempOut }];

                          let opacity = 0;
                          if (activeStep === 0 || activeStep === 1) {
                            opacity = 1 - transitionProgress * 0.55;
                          }

                          if (opacity === 0) return null;

                          return (
                            <Line 
                              key={s.id}
                              data={lineData}
                              type="linear" 
                              dataKey="t" 
                              name={s.name}
                              stroke={s.type === 'hot' ? '#ef4444' : '#3b82f6'} 
                              strokeWidth={activeStep === 0 ? 2.5 : 1.5}
                              strokeOpacity={opacity}
                              strokeDasharray={transitionProgress > 0.1 ? "3 3" : undefined}
                              connectNulls
                              dot={(props: any) => {
                                const { cx, cy, payload } = props;
                                if (!payload) return null;
                                const hVal = payload.h;
                                const isStart = Math.abs(hVal - currentOffset) < 0.1;
                                const isEnd = Math.abs(hVal - (currentOffset + s.q)) < 0.1;
                                if (isStart || isEnd) {
                                  return (
                                    <circle 
                                      cx={cx} 
                                      cy={cy} 
                                      r={activeStep === 0 ? 3.5 : 2.5} 
                                      fill={s.type === 'hot' ? '#ef4444' : '#3b82f6'} 
                                      stroke="white" 
                                      strokeWidth={1}
                                      opacity={opacity}
                                    />
                                  );
                                }
                                return null;
                              }}
                              activeDot={(props: any) => {
                                const { cx, cy, payload } = props;
                                if (!payload) return null;
                                const hVal = payload.h;
                                const isStart = Math.abs(hVal - currentOffset) < 0.1;
                                const isEnd = Math.abs(hVal - (currentOffset + s.q)) < 0.1;
                                if (isStart || isEnd) {
                                  return (
                                    <circle 
                                      cx={cx} 
                                      cy={cy} 
                                      r={activeStep === 0 ? 5 : 4} 
                                      fill={s.type === 'hot' ? '#ef4444' : '#3b82f6'} 
                                      stroke="white" 
                                      strokeWidth={1.5}
                                      opacity={opacity}
                                    />
                                  );
                                }
                                return null;
                              }}
                            />
                          );
                        })}
                        
                        {/* Reference lines for the Pinch temperature */}
                        {activeStep >= 2 && !isNaN(results.pinchTempHot) && !isNaN(results.pinchTempCold) && (
                          <>
                            <ReferenceLine 
                              y={results.pinchTempHot} 
                              stroke="#f59e0b" 
                              strokeDasharray="3 3" 
                              strokeWidth={1.5}
                            />
                            <ReferenceLine 
                              y={results.pinchTempCold} 
                              stroke="#f59e0b" 
                              strokeDasharray="3 3" 
                              strokeWidth={1.5}
                            />
                          </>
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            ) : (
              // Step 6: Show Grand Composite Curve
              <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 flex flex-col flex-1">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-sm text-slate-200">Grand Composite Curve (Shifted T vs H)</h3>
                    <p className="text-[10px] text-slate-500">Net heat flow cascade profile. Zero point is the Pinch.</p>
                  </div>
                  <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono px-2 py-0.5 rounded">
                    Pinch: {results.pinchTempShifted}°C
                  </span>
                </div>

                <div className="flex-1 w-full relative min-h-[350px]">
                  {streams.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
                      No streams entered. Go back to Step 1 to add process streams.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={gccChartData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis 
                          type="number" 
                          dataKey="h" 
                          domain={enthalpyDomain}
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          stroke="#334155"
                          unit=" kW"
                        />
                        <YAxis 
                          type="number" 
                          dataKey="tShifted"
                          domain={tempDomain}
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          stroke="#334155"
                          unit="°C"
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px' }}
                          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                          itemStyle={{ color: '#f8fafc', fontSize: 12 }}
                          formatter={(value) => [`${value}°C`, 'Shifted Temp']}
                        />
                        <Line 
                          type="linear" 
                          dataKey="tShifted" 
                          stroke="#f59e0b" 
                          strokeWidth={2.5}
                          dot={{ r: 3, stroke: '#d97706', strokeWidth: 1 }}
                          activeDot={{ r: 5 }}
                        />
                        
                        {/* Reference lines for the Pinch temperature */}
                        {!isNaN(results.pinchTempShifted) && (
                          <ReferenceLine 
                            y={results.pinchTempShifted} 
                            stroke="#f59e0b" 
                            strokeDasharray="4 4" 
                            strokeWidth={1.5}
                          />
                        )}
                        {/* Highlight hot and cold utility points */}
                        {results.shiftedTemps.length > 0 && !isNaN(results.shiftedTemps[0]) && (
                          <ReferenceDot 
                            x={results.qhMin} 
                            y={results.shiftedTemps[0]} 
                            r={5} 
                            fill="#ef4444" 
                            stroke="white" 
                          />
                        )}
                        {results.shiftedTemps.length > 0 && !isNaN(results.shiftedTemps[results.shiftedTemps.length - 1]) && (
                          <ReferenceDot 
                            x={results.qcMin} 
                            y={results.shiftedTemps[results.shiftedTemps.length - 1]} 
                            r={5} 
                            fill="#3b82f6" 
                            stroke="white" 
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
