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
  const handleAddStream = () => {
    // Calculate Q
    const q = Math.round(newStream.cp * Math.abs(newStream.tempIn - newStream.tempOut) * 10) / 10;
    
    const streamToAdd: ProcessStream = {
      ...newStream,
      id: Date.now().toString(),
      q
    };

    setStreams(prev => [...prev, streamToAdd]);
    
    // Reset form with default values
    setNewStream({
      name: `Stream ${streams.length + 1}`,
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
        // Recalculate Q if tempIn, tempOut, or cp change
        if (field === 'tempIn' || field === 'tempOut' || field === 'cp') {
          const cp = field === 'cp' ? Number(value) : s.cp;
          const tIn = field === 'tempIn' ? Number(value) : s.tempIn;
          const tOut = field === 'tempOut' ? Number(value) : s.tempOut;
          updated.q = Math.round(cp * Math.abs(tIn - tOut) * 10) / 10;
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
    { title: 'Interval Shifts', desc: 'Shift temperatures and map thermal zones' },
    { title: 'Heat Cascade', desc: 'Calculate energy balance & locate the Pinch' },
    { title: 'Composite Curves', desc: 'View Hot & Cold composite T-H profiles' },
    { title: 'Grand Composite Curve', desc: 'Map utility placements against the GCC' }
  ];

  // Prepare Composite Chart Data
  // We need to merge Hot and Cold composite points to plot them on the same horizontal Enthalpy (H) axis
  // To make it simple for Recharts, we can build a combined list of sorted H points.
  const compositeChartData = useMemo(() => {
    const data: { h: number; hotT?: number; coldT?: number }[] = [];
    
    // Add all hot points
    results.hotComposite.forEach(pt => {
      data.push({ h: Math.round(pt.h * 10) / 10, hotT: pt.t });
    });

    // Add all cold points
    results.coldComposite.forEach(pt => {
      data.push({ h: Math.round(pt.h * 10) / 10, coldT: pt.t });
    });

    // Sort by Enthalpy (H) ascending
    data.sort((a, b) => a.h - b.h);
    
    // Linearly interpolate missing temperatures to make the lines smooth in Recharts
    const interpolate = (points: { h: number; t: number }[], h: number): number | undefined => {
      if (points.length === 0) return undefined;
      if (h <= points[0].h) return points[0].t;
      if (h >= points[points.length - 1].h) return points[points.length - 1].t;
      
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        if (h >= p1.h && h <= p2.h) {
          const ratio = (h - p1.h) / (p2.h - p1.h);
          return p1.t + ratio * (p2.t - p1.t);
        }
      }
      return undefined;
    };

    return data.map(pt => ({
      h: pt.h,
      'Hot Composite': pt.hotT !== undefined ? pt.hotT : interpolate(results.hotComposite, pt.h),
      'Cold Composite': pt.coldT !== undefined ? pt.coldT : interpolate(results.coldComposite, pt.h)
    }));
  }, [results]);

  // Grand Composite Curve Chart Data
  const gccChartData = useMemo(() => {
    return results.grandComposite.map(pt => ({
      h: Math.round(pt.h * 10) / 10,
      tShifted: Math.round(pt.t * 10) / 10
    }));
  }, [results]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col antialiased">
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
                  <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Step {activeStep + 1} of 5</span>
                  <h2 className="text-lg font-bold text-white mt-0.5">{steps[activeStep].title}</h2>
                  <p className="text-xs text-slate-500">{steps[activeStep].desc}</p>
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
                          <th className="p-3">CP (kW/K)</th>
                          <th className="p-3">Load Q (kW)</th>
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
                              <select 
                                value={s.type}
                                onChange={(e) => handleEditStream(s.id, 'type', e.target.value)}
                                className={`border rounded px-1.5 py-0.5 text-xs font-medium focus:outline-none focus:ring-1 transition ${
                                  s.type === 'hot' 
                                    ? 'bg-slate-900 border-red-500/30 focus:border-red-500 focus:ring-red-500/40 text-red-300' 
                                    : 'bg-slate-900 border-blue-500/30 focus:border-blue-500 focus:ring-blue-500/40 text-blue-300'
                                }`}
                              >
                                <option value="hot" className="text-red-400">Hot</option>
                                <option value="cold" className="text-blue-400">Cold</option>
                              </select>
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
                                step="0.1"
                                value={s.cp}
                                onChange={(e) => handleEditStream(s.id, 'cp', Number(e.target.value))}
                                className={`bg-slate-900/50 border rounded px-1.5 py-0.5 text-xs text-white w-14 text-center focus:outline-none transition ${
                                  s.type === 'hot' 
                                    ? 'border-red-500/20 focus:border-red-500 focus:ring-1 focus:ring-red-500/40' 
                                    : 'border-blue-500/20 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40'
                                }`}
                              />
                            </td>
                            <td className={`p-3 font-mono font-bold transition ${s.type === 'hot' ? 'text-red-400' : 'text-blue-400'}`}>{s.q}</td>
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
                  <div className={`border rounded-xl p-4 transition duration-300 ${
                    newStream.type === 'hot' 
                      ? 'bg-red-950/5 border-red-500/10' 
                      : 'bg-blue-950/5 border-blue-500/10'
                  }`}>
                    <h4 className="font-semibold text-xs text-slate-400 mb-3 flex items-center space-x-1.5">
                      <Plus className={`w-3.5 h-3.5 ${newStream.type === 'hot' ? 'text-red-400' : 'text-blue-400'}`} />
                      <span>Add Process Stream</span>
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11px]">
                      <div>
                        <label className="block text-slate-500 mb-1">Name</label>
                        <input 
                          type="text"
                          value={newStream.name}
                          onChange={(e) => setNewStream(prev => ({ ...prev, name: e.target.value }))}
                          className={`bg-slate-900 border rounded px-2.5 py-1.5 text-xs text-white w-full focus:outline-none transition ${
                            newStream.type === 'hot'
                              ? 'border-red-500/20 focus:border-red-500 focus:ring-1 focus:ring-red-500/40'
                              : 'border-blue-500/20 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 mb-1">Type</label>
                        <select 
                          value={newStream.type}
                          onChange={(e) => setNewStream(prev => ({ ...prev, type: e.target.value as 'hot' | 'cold' }))}
                          className={`bg-slate-900 border rounded px-2.5 py-1.5 text-xs w-full focus:outline-none transition ${
                            newStream.type === 'hot'
                              ? 'border-red-500/20 focus:border-red-500 focus:ring-1 focus:ring-red-500/40 text-red-300'
                              : 'border-blue-500/20 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 text-blue-300'
                          }`}
                        >
                          <option value="hot" className="text-red-400">Hot (Release Q)</option>
                          <option value="cold" className="text-blue-400">Cold (Absorb Q)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-500 mb-1">Supply Temp (Tin °C)</label>
                        <input 
                          type="number"
                          value={newStream.tempIn}
                          onChange={(e) => setNewStream(prev => ({ ...prev, tempIn: Number(e.target.value) }))}
                          className={`bg-slate-900 border rounded px-2.5 py-1.5 text-xs text-white w-full focus:outline-none transition ${
                            newStream.type === 'hot'
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
                            newStream.type === 'hot'
                              ? 'border-red-500/20 focus:border-red-500 focus:ring-1 focus:ring-red-500/40'
                              : 'border-blue-500/20 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40'
                          }`}
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1 flex items-end">
                        <button 
                          onClick={handleAddStream}
                          className={`font-bold py-1.5 px-3 rounded-lg text-xs w-full text-slate-950 transition duration-150 ${
                            newStream.type === 'hot'
                              ? 'bg-red-500 hover:bg-red-400'
                              : 'bg-blue-500 hover:bg-blue-400'
                          }`}
                        >
                          Add Stream
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Shifted Temperatures */}
              {activeStep === 1 && (
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

              {/* STEP 3: Heat Cascade & Pinch Point */}
              {activeStep === 2 && (
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

              {/* STEP 4: Composite Curves Summary */}
              {activeStep === 3 && (
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

              {/* STEP 5: GCC Summary */}
              {activeStep === 4 && (
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

            {/* Wizard Navigation Footer */}
            <div className="mt-8 pt-4 border-t border-slate-800/60 flex items-center justify-between">
              <button
                disabled={activeStep === 0}
                onClick={() => setActiveStep(prev => prev - 1)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-700/60 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-800 text-xs font-semibold transition"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <div className="text-xs text-slate-500 font-mono">
                {steps[activeStep].title}
              </div>

              <button
                disabled={activeStep === steps.length - 1}
                onClick={() => setActiveStep(prev => prev + 1)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-30 disabled:pointer-events-none text-xs font-bold transition"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        </div>

        {/* Right Side: Charts Display Area */}
        <div className="flex-1 lg:flex-[0.9] bg-slate-900/40 p-6 flex flex-col justify-between overflow-y-auto">
          
          {/* Charts Container */}
          <div className="flex-1 flex flex-col justify-center min-h-[450px] space-y-6">
            
            {/* Step-conditional charts */}
            {activeStep < 4 ? (
              // Show Composite Curves chart for steps 1-4
              <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 flex flex-col flex-1">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-sm text-slate-200">Composite Curves (T-H Diagram)</h3>
                    <p className="text-[10px] text-slate-500">Plot of temperature vs cumulative enthalpy</p>
                  </div>
                  <div className="flex items-center space-x-3 text-[10px] font-mono">
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-0.5 bg-red-500 inline-block"></span>
                      <span className="text-slate-400">Hot Composite</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-0.5 bg-blue-500 inline-block"></span>
                      <span className="text-slate-400">Cold Composite</span>
                    </span>
                  </div>
                </div>

                <div className="flex-1 w-full relative min-h-[350px]">
                  {streams.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
                      No streams entered. Go back to Step 1 to add process streams.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={compositeChartData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis 
                          type="number" 
                          dataKey="h" 
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          stroke="#334155"
                          unit=" kW"
                        />
                        <YAxis 
                          type="number" 
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          stroke="#334155"
                          unit="°C"
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px' }}
                          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                          itemStyle={{ color: '#f8fafc', fontSize: 12 }}
                          formatter={(value) => [`${value}°C`, 'Temp']}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="Hot Composite" 
                          stroke="#ef4444" 
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls
                        />
                        <Line 
                          type="monotone" 
                          dataKey="Cold Composite" 
                          stroke="#3b82f6" 
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls
                        />
                        
                        {/* Reference lines for the Pinch temperature */}
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
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            ) : (
              // Show Grand Composite Curve for Step 5
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
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          stroke="#334155"
                          unit=" kW"
                        />
                        <YAxis 
                          type="number" 
                          dataKey="tShifted"
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
                          type="monotone" 
                          dataKey="tShifted" 
                          stroke="#f59e0b" 
                          strokeWidth={2.5}
                          dot={{ r: 3, stroke: '#d97706', strokeWidth: 1 }}
                          activeDot={{ r: 5 }}
                        />
                        
                        {/* Reference lines for the Pinch temperature */}
                        <ReferenceLine 
                          y={results.pinchTempShifted} 
                          stroke="#f59e0b" 
                          strokeDasharray="4 4" 
                          strokeWidth={1.5}
                        />
                        {/* Highlight hot and cold utility points */}
                        <ReferenceDot 
                          x={results.qhMin} 
                          y={results.shiftedTemps[0]} 
                          r={5} 
                          fill="#ef4444" 
                          stroke="white" 
                        />
                        <ReferenceDot 
                          x={results.qcMin} 
                          y={results.shiftedTemps[results.shiftedTemps.length - 1]} 
                          r={5} 
                          fill="#3b82f6" 
                          stroke="white" 
                        />
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
