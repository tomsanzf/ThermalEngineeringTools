import React, { useState } from 'react';
import { Scenario, Flow } from '../types';
import { Settings, Zap, ArrowRight, Droplets, ThermometerSnowflake, Wind, Activity } from 'lucide-react';

interface GuidedSetupProps {
  onGenerate: (before: Flow[], after: Flow[]) => void;
}

export function GuidedSetup({ onGenerate }: GuidedSetupProps) {
  // 1. Core Process
  const [generatorType, setGeneratorType] = useState('Gas Boiler');
  const [fluid, setFluid] = useState('Steam');
  const [efficiency, setEfficiency] = useState(80);
  const [processDemand, setProcessDemand] = useState(1000);
  const [supplyTemp, setSupplyTemp] = useState(150);
  const [returnTemp, setReturnTemp] = useState(60);

  // 2. Waste Heat Sources
  const [hasChiller, setHasChiller] = useState(true);
  const [chillerLoad, setChillerLoad] = useState(500);
  const [chillerEER, setChillerEER] = useState(3.0);
  const [chillerCoolingTemp, setChillerCoolingTemp] = useState(5);
  const [chillerRejectionTemp, setChillerRejectionTemp] = useState(30);

  const [hasCompressor, setHasCompressor] = useState(false);
  const [compressorPower, setCompressorPower] = useState(100);
  const [compressorHeatRecovery, setCompressorHeatRecovery] = useState(80);
  const [compressorRejectionTemp, setCompressorRejectionTemp] = useState(80);

  // 3. Heat Recovery
  const [hrTech, setHrTech] = useState('Heat Pump');
  const [copMethod, setCopMethod] = useState<'direct' | 'carnot'>('carnot');
  const [directCop, setDirectCop] = useState(3.5);
  const [carnotSourceTemp, setCarnotSourceTemp] = useState(30);
  const [carnotSinkTemp, setCarnotSinkTemp] = useState(90);
  const [carnotEfficiency, setCarnotEfficiency] = useState(50);

  const generateFlows = () => {
    let before: Flow[] = [];
    let after: Flow[] = [];

    // Calculations
    const mainFuelInput = processDemand / (efficiency / 100);
    const mainFuelSource = generatorType === 'Electric Boiler' ? 'Grid' : 'Natural Gas';
    const mainFuelColor = generatorType === 'Electric Boiler' ? 'elec' : '#000000';

    // Before Arrays Baseline
    before.push({ Source: mainFuelSource, Target: generatorType, Value: mainFuelInput.toFixed(1), Color: mainFuelColor });
    before.push({ Source: generatorType, Target: 'Process', Value: processDemand.toFixed(1), Color: String(supplyTemp) });
    before.push({ Source: generatorType, Target: 'Boiler Losses', Value: (mainFuelInput - processDemand).toFixed(1), Color: String(supplyTemp) });

    let wasteSources: Array<{ name: string, heat: number, temp: number }> = [];

    if (hasChiller) {
      const elecInput = chillerLoad / chillerEER;
      const rejectedHeat = chillerLoad + elecInput;
      before.push({ Source: 'Grid', Target: 'Chiller', Value: elecInput.toFixed(1), Color: 'elec' });
      before.push({ Source: 'Cooling Load', Target: 'Chiller', Value: chillerLoad.toFixed(1), Color: String(chillerCoolingTemp) });
      before.push({ Source: 'Chiller', Target: 'Cooling Tower', Value: rejectedHeat.toFixed(1), Color: String(chillerRejectionTemp) });
      wasteSources.push({ name: 'Chiller', heat: rejectedHeat, temp: chillerRejectionTemp });
    }

    if (hasCompressor) {
      const recoverable = compressorPower * (compressorHeatRecovery / 100);
      const losses = compressorPower - recoverable;
      before.push({ Source: 'Grid', Target: 'Air Compressor', Value: compressorPower.toFixed(1), Color: 'elec' });
      before.push({ Source: 'Air Compressor', Target: 'Waste Heat', Value: recoverable.toFixed(1), Color: String(compressorRejectionTemp) });
      before.push({ Source: 'Air Compressor', Target: 'Ambient Losses', Value: losses.toFixed(1), Color: '20' });
      wasteSources.push({ name: 'Air Compressor', heat: recoverable, temp: compressorRejectionTemp });
    }

    // After Arrays
    after = JSON.parse(JSON.stringify(before));

    // Calculate COP
    let cop = 0;
    if (copMethod === 'direct') {
      cop = directCop;
    } else {
      const Th = carnotSinkTemp + 273.15;
      const Tc = carnotSourceTemp + 273.15;
      const carnotLimit = Th / (Th - Tc);
      cop = carnotLimit * (carnotEfficiency / 100);
    }

    // Determine how much heat we can upgrade (up to processDemand limit)
    // hpOutput = Qc + W. COP = hpOutput / W => W = hpOutput / COP. Qc = hpOutput - W = hpOutput * (COP - 1) / COP
    const maxHpOutput = processDemand;
    const maxQc = maxHpOutput * ((cop - 1) / cop);

    let totalAvailableWaste = wasteSources.reduce((sum, s) => sum + s.heat, 0);
    let usedQc = Math.min(totalAvailableWaste, maxQc);
    
    let hpOutput = 0;
    let hpWork = 0;

    if (usedQc > 0) {
      hpOutput = usedQc * (cop / (cop - 1));
      hpWork = hpOutput - usedQc;

      // Filter out old waste rejection from "after" array, replace with HP
      // Find all old waste routes and remove/modify them
      wasteSources.forEach(source => {
        const oldTarget = source.name === 'Chiller' ? 'Cooling Tower' : 'Waste Heat';
        const flowIndex = after.findIndex(f => f.Source === source.name && f.Target === oldTarget);
        if (flowIndex !== -1) {
          after.splice(flowIndex, 1);
        }
      });

      // Route waste to HP
      let remainingQc = usedQc;
      wasteSources.forEach(source => {
        let amt = Math.min(source.heat, remainingQc);
        if (amt > 0) {
          after.push({ Source: source.name, Target: hrTech, Value: amt.toFixed(1), Color: String(source.temp) });
          remainingQc -= amt;
        }
        let excess = source.heat - amt;
        if (excess > 0) {
          const oldTarget = source.name === 'Chiller' ? 'Cooling Tower' : 'Waste Heat';
          after.push({ Source: source.name, Target: oldTarget, Value: excess.toFixed(1), Color: String(source.temp) });
        }
      });

      // Add HP electrical input
      after.push({ Source: 'Grid', Target: hrTech, Value: hpWork.toFixed(1), Color: 'elec' });
      // Add HP heat to process
      after.push({ Source: hrTech, Target: 'Process', Value: hpOutput.toFixed(1), Color: String(supplyTemp) });

      // Reduce Main Generator
      const newProcessDemandFromGen = processDemand - hpOutput;
      const newFuelInput = newProcessDemandFromGen > 0 ? newProcessDemandFromGen / (efficiency / 100) : 0;
      
      // Update Generator nodes in after
      const genFuelFlow = after.find(f => f.Source === mainFuelSource && f.Target === generatorType);
      if (genFuelFlow) genFuelFlow.Value = newFuelInput.toFixed(1);

      const genProcessFlow = after.find(f => f.Source === generatorType && f.Target === 'Process');
      if (genProcessFlow) genProcessFlow.Value = newProcessDemandFromGen.toFixed(1);
      
      const genLossFlow = after.find(f => f.Source === generatorType && f.Target === 'Boiler Losses');
      if (genLossFlow) genLossFlow.Value = Math.max(0, newFuelInput - newProcessDemandFromGen).toFixed(1);
    }

    onGenerate(before, after);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface)] p-4 text-[var(--text)] overflow-y-auto custom-scrollbar text-sm">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
        <h3 className="font-semibold text-base flex items-center gap-2"><Settings size={18} /> Guided Setup</h3>
        <button onClick={generateFlows} className="btn px-4 py-2 bg-[var(--accent)] text-white hover:opacity-90 flex items-center gap-2 rounded-md shadow-sm">
          <Activity size={16} /> Generate Flow Table
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Core Process */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[var(--accent)] font-medium mb-2 border-b border-[var(--border)] pb-1">
            <Zap size={16} /> Core Process
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text2)] mb-1">Generator Type</label>
              <select className="input w-full text-xs" value={generatorType} onChange={e => setGeneratorType(e.target.value)}>
                <option>Gas Boiler</option>
                <option>Electric Boiler</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text2)] mb-1">Heat Transfer Fluid</label>
              <select className="input w-full text-xs" value={fluid} onChange={e => setFluid(e.target.value)}>
                <option>Steam</option>
                <option>Hot Water</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text2)] mb-1">Efficiency (%)</label>
              <input type="number" className="input w-full text-xs" value={efficiency} onChange={e => setEfficiency(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--text2)] mb-1">Process Demand (kW)</label>
              <input type="number" className="input w-full text-xs" value={processDemand} onChange={e => setProcessDemand(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--text2)] mb-1">Supply Temp (°C)</label>
              <input type="number" className="input w-full text-xs" value={supplyTemp} onChange={e => setSupplyTemp(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--text2)] mb-1">Return Temp (°C)</label>
              <input type="number" className="input w-full text-xs" value={returnTemp} onChange={e => setReturnTemp(Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* 2. Waste Heat Sources */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[var(--accent)] font-medium mb-2 border-b border-[var(--border)] pb-1">
            <ThermometerSnowflake size={16} /> Waste Heat Sources
          </div>

          {/* Chiller */}
          <div className="p-3 bg-[var(--surface2)] rounded-md border border-[var(--border)]">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer mb-3">
              <input type="checkbox" checked={hasChiller} onChange={e => setHasChiller(e.target.checked)} className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]" />
              Chiller
            </label>
            {hasChiller && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <label className="block text-xs text-[var(--text2)] mb-1">Cooling Load (kW)</label>
                  <input type="number" className="input w-full text-xs" value={chillerLoad} onChange={e => setChillerLoad(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text2)] mb-1">EER (kW_c / kW_e)</label>
                  <input type="number" className="input w-full text-xs" value={chillerEER} onChange={e => setChillerEER(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text2)] mb-1">Cooling Temp (°C)</label>
                  <input type="number" className="input w-full text-xs" value={chillerCoolingTemp} onChange={e => setChillerCoolingTemp(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text2)] mb-1">Rejection Temp (°C)</label>
                  <input type="number" className="input w-full text-xs" value={chillerRejectionTemp} onChange={e => setChillerRejectionTemp(Number(e.target.value))} />
                </div>
              </div>
            )}
          </div>

          {/* Compressor */}
          <div className="p-3 bg-[var(--surface2)] rounded-md border border-[var(--border)]">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer mb-3">
              <input type="checkbox" checked={hasCompressor} onChange={e => setHasCompressor(e.target.checked)} className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]" />
              Air Compressor
            </label>
            {hasCompressor && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <label className="block text-xs text-[var(--text2)] mb-1">Electric Power (kW)</label>
                  <input type="number" className="input w-full text-xs" value={compressorPower} onChange={e => setCompressorPower(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text2)] mb-1">Heat Recoverable (%)</label>
                  <input type="number" className="input w-full text-xs" value={compressorHeatRecovery} onChange={e => setCompressorHeatRecovery(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text2)] mb-1">Rejection Temp (°C)</label>
                  <input type="number" className="input w-full text-xs" value={compressorRejectionTemp} onChange={e => setCompressorRejectionTemp(Number(e.target.value))} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. Heat Recovery */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[var(--accent)] font-medium mb-2 border-b border-[var(--border)] pb-1">
            <Droplets size={16} /> Heat Recovery / After View
          </div>
          
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs text-[var(--text2)] mb-1">Technology</label>
              <select className="input w-full text-xs" value={hrTech} onChange={e => setHrTech(e.target.value)}>
                <option>Heat Pump</option>
                <option>Adsorption Chiller</option>
              </select>
            </div>
            
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-1.5 text-xs text-[var(--text)]">
                <input type="radio" value="direct" checked={copMethod === 'direct'} onChange={() => setCopMethod('direct')} className="text-[var(--accent)] focus:ring-[var(--accent)]" />
                Direct Input COP
              </label>
              <label className="flex items-center gap-1.5 text-xs text-[var(--text)]">
                <input type="radio" value="carnot" checked={copMethod === 'carnot'} onChange={() => setCopMethod('carnot')} className="text-[var(--accent)] focus:ring-[var(--accent)]" />
                Carnot COP
              </label>
            </div>

            {copMethod === 'direct' ? (
              <div>
                <label className="block text-xs text-[var(--text2)] mb-1">Coefficient of Performance (COP) (kW_h / kW_e)</label>
                <input type="number" step="0.1" className="input w-full text-xs" value={directCop} onChange={e => setDirectCop(Number(e.target.value))} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 mt-1">
                <div>
                  <label className="block text-xs text-[var(--text2)] mb-1">Source Temp (°C)</label>
                  <input type="number" className="input w-full text-xs" value={carnotSourceTemp} onChange={e => setCarnotSourceTemp(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text2)] mb-1">Sink Temp (°C)</label>
                  <input type="number" className="input w-full text-xs" value={carnotSinkTemp} onChange={e => setCarnotSinkTemp(Number(e.target.value))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-[var(--text2)] mb-1">% of Carnot Efficiency</label>
                  <input type="number" className="input w-full text-xs" value={carnotEfficiency} onChange={e => setCarnotEfficiency(Number(e.target.value))} />
                </div>
              </div>
            )}
          </div>

          {copMethod === 'carnot' && (
            <div className="p-3 bg-[var(--surface2)] rounded-md border border-[var(--border)] mt-4">
               <div className="text-xs text-[var(--text2)]">Calculated COP (Carnot)</div>
               <div className="font-semibold text-[var(--accent)] text-lg">
                 {(() => {
                   const Th = carnotSinkTemp + 273.15;
                   const Tc = carnotSourceTemp + 273.15;
                   if (Th <= Tc) return 'Invalid Temps';
                   const c = (Th / (Th - Tc)) * (carnotEfficiency / 100);
                   return c.toFixed(2);
                 })()}
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
