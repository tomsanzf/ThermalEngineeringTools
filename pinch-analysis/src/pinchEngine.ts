export interface ProcessStream {
  id: string;
  name: string;
  type: 'hot' | 'cold'; // hot needs cooling, cold needs heating
  tempIn: number; // °C
  tempOut: number; // °C
  cp: number; // kW/K (Heat capacity flow rate)
  q: number; // kW (Heat load, calculated: cp * |tempIn - tempOut|)
}

export interface PinchResults {
  dTmin: number;
  streams: ProcessStream[];
  shiftedTemps: number[];
  intervals: {
    t_start: number;
    t_end: number;
    dT: number;
    sumCP_hot: number;
    sumCP_cold: number;
    dH: number;
  }[];
  rawCascade: number[];
  adjustedCascade: number[];
  qhMin: number; // Hot utility target (kW)
  qcMin: number; // Cold utility target (kW)
  pinchTempShifted: number; // Pinch temperature in shifted scale (°C)
  pinchTempHot: number; // Hot stream pinch temperature (°C)
  pinchTempCold: number; // Cold stream pinch temperature (°C)
  
  // Plottable points
  hotComposite: { h: number; t: number }[];
  coldComposite: { h: number; t: number }[];
  grandComposite: { h: number; t: number }[]; // Shifted T vs Enthalpy
}

export const createDefaultStreams = (): ProcessStream[] => {
  return [
    { id: '1', name: 'Reactor Feed Preheater', type: 'cold', tempIn: 20, tempOut: 135, cp: 2.0, q: 230 },
    { id: '2', name: 'Distillation Column Condenser', type: 'hot', tempIn: 170, tempOut: 60, cp: 3.0, q: 330 },
    { id: '3', name: 'Evaporator Feed Heater', type: 'cold', tempIn: 80, tempOut: 140, cp: 4.0, q: 240 },
    { id: '4', name: 'Reactor Product Cooler', type: 'hot', tempIn: 150, tempOut: 30, cp: 1.5, q: 180 }
  ];
};

export const calculatePinch = (streams: ProcessStream[], dTmin: number): PinchResults => {
  const N = streams.length;
  
  // 1. Shift Temperatures
  // Hot: -dTmin/2
  // Cold: +dTmin/2
  const shiftedStreams = streams.map(s => {
    const shift = s.type === 'hot' ? -dTmin / 2 : dTmin / 2;
    return {
      ...s,
      tInShifted: s.tempIn + shift,
      tOutShifted: s.tempOut + shift
    };
  });

  // 2. Gather unique shifted temperatures and sort descending
  const tempSet = new Set<number>();
  shiftedStreams.forEach(s => {
    tempSet.add(s.tInShifted);
    tempSet.add(s.tOutShifted);
  });
  const sortedShiftedTemps = Array.from(tempSet).sort((a, b) => b - a);
  const M = sortedShiftedTemps.length;

  // 3. Build intervals and calculate heat balances
  const intervals: PinchResults['intervals'] = [];
  for (let k = 0; k < M - 1; k++) {
    const t_start = sortedShiftedTemps[k];
    const t_end = sortedShiftedTemps[k + 1];
    const dT = t_start - t_end;
    const t_mid = (t_start + t_end) / 2;
    
    // Find active streams in this interval
    let sumCP_hot = 0;
    let sumCP_cold = 0;
    
    shiftedStreams.forEach(s => {
      const minTemp = Math.min(s.tInShifted, s.tOutShifted);
      const maxTemp = Math.max(s.tInShifted, s.tOutShifted);
      
      // If stream spans across the midpoint of this interval
      if (minTemp <= t_mid && maxTemp >= t_mid) {
        if (s.type === 'hot') {
          sumCP_hot += s.cp;
        } else {
          sumCP_cold += s.cp;
        }
      }
    });

    const dH = dT * (sumCP_hot - sumCP_cold);
    intervals.push({ t_start, t_end, dT, sumCP_hot, sumCP_cold, dH });
  }

  // 4. Heat Cascade
  const rawCascade = [0];
  for (let k = 0; k < intervals.length; k++) {
    rawCascade.push(rawCascade[k] + intervals[k].dH);
  }

  const minCascade = Math.min(...rawCascade);
  const qhMin = minCascade < 0 ? -minCascade : 0;
  
  const adjustedCascade = rawCascade.map(h => h + qhMin);
  const qcMin = adjustedCascade[adjustedCascade.length - 1];

  // Find Pinch Temperature
  // It is the shifted temperature where the adjusted cascade is 0
  let pinchIdx = 0;
  for (let i = 0; i < adjustedCascade.length; i++) {
    if (Math.abs(adjustedCascade[i]) < 1e-5) {
      pinchIdx = i;
      break;
    }
  }
  const pinchTempShifted = sortedShiftedTemps[pinchIdx];
  const pinchTempHot = pinchTempShifted + dTmin / 2;
  const pinchTempCold = pinchTempShifted - dTmin / 2;

  // 5. Build Composite Curves
  // To construct the hot composite curve, we collect actual hot stream temperatures, sort them, 
  // calculate the intervals, and accumulate Enthalpy.
  const hotStreams = streams.filter(s => s.type === 'hot');
  const hotTemps = Array.from(new Set(hotStreams.flatMap(s => [s.tempIn, s.tempOut]))).sort((a, b) => a - b); // ascending
  
  const hotComposite: { h: number; t: number }[] = [];
  if (hotTemps.length > 0) {
    let cumulativeH = 0;
    hotComposite.push({ h: 0, t: hotTemps[0] });
    
    for (let i = 0; i < hotTemps.length - 1; i++) {
      const t_low = hotTemps[i];
      const t_high = hotTemps[i + 1];
      const t_mid = (t_low + t_high) / 2;
      
      let sumCP = 0;
      hotStreams.forEach(s => {
        const min = Math.min(s.tempIn, s.tempOut);
        const max = Math.max(s.tempIn, s.tempOut);
        if (min <= t_mid && max >= t_mid) {
          sumCP += s.cp;
        }
      });
      
      const dH = sumCP * (t_high - t_low);
      cumulativeH += dH;
      hotComposite.push({ h: cumulativeH, t: t_high });
    }
  }

  // Cold Composite Curve
  const coldStreams = streams.filter(s => s.type === 'cold');
  const coldTemps = Array.from(new Set(coldStreams.flatMap(s => [s.tempIn, s.tempOut]))).sort((a, b) => a - b); // ascending
  
  const coldCompositeRaw: { h: number; t: number }[] = [];
  if (coldTemps.length > 0) {
    let cumulativeH = 0;
    coldCompositeRaw.push({ h: 0, t: coldTemps[0] });
    
    for (let i = 0; i < coldTemps.length - 1; i++) {
      const t_low = coldTemps[i];
      const t_high = coldTemps[i + 1];
      const t_mid = (t_low + t_high) / 2;
      
      let sumCP = 0;
      coldStreams.forEach(s => {
        const min = Math.min(s.tempIn, s.tempOut);
        const max = Math.max(s.tempIn, s.tempOut);
        if (min <= t_mid && max >= t_mid) {
          sumCP += s.cp;
        }
      });
      
      const dH = sumCP * (t_high - t_low);
      cumulativeH += dH;
      coldCompositeRaw.push({ h: cumulativeH, t: t_high });
    }
  }

  // To display them correctly relative to each other, we shift the Cold Composite curve by qhMin (hot utility).
  const coldComposite = coldCompositeRaw.map(pt => ({
    h: pt.h + qhMin,
    t: pt.t
  }));

  // 6. Grand Composite Curve (GCC)
  // Shifted temperature vs Adjusted Heat Cascade
  const grandComposite: { h: number; t: number }[] = [];
  for (let i = 0; i < adjustedCascade.length; i++) {
    grandComposite.push({
      h: adjustedCascade[i],
      t: sortedShiftedTemps[i]
    });
  }

  return {
    dTmin,
    streams,
    shiftedTemps: sortedShiftedTemps,
    intervals,
    rawCascade,
    adjustedCascade,
    qhMin,
    qcMin,
    pinchTempShifted,
    pinchTempHot,
    pinchTempCold,
    hotComposite,
    coldComposite,
    grandComposite
  };
};
