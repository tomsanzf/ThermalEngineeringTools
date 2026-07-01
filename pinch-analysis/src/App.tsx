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

const interpolateT = (
  points: { h: number; t: number }[],
  h: number,
  preferMax: boolean = false
): number | undefined => {
  if (points.length === 0) return undefined;
  if (points.length === 1) return points[0].t;

  const EPSILON = 1e-9;
  const candidates: number[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    
    const minH = Math.min(p1.h, p2.h);
    const maxH = Math.max(p1.h, p2.h);

    if (h >= minH - EPSILON && h <= maxH + EPSILON) {
      if (Math.abs(p2.h - p1.h) < EPSILON) {
        candidates.push(p1.t);
        candidates.push(p2.t);
      } else {
        const ratio = (h - p1.h) / (p2.h - p1.h);
        candidates.push(p1.t + ratio * (p2.t - p1.t));
      }
    }
  }

  if (candidates.length === 0) {
    // If h is outside the range of any segment, return the temperature of the closest endpoint in terms of h
    let closestPt = points[0];
    let minDiff = Math.abs(h - points[0].h);
    for (let i = 1; i < points.length; i++) {
      const diff = Math.abs(h - points[i].h);
      if (diff < minDiff) {
        minDiff = diff;
        closestPt = points[i];
      }
    }
    return closestPt.t;
  }

  return preferMax ? Math.max(...candidates) : Math.min(...candidates);
};

function App() {
  // State
  const [streams, setStreams] = useState<ProcessStream[]>(() => createDefaultStreams());
  const [dTmin, setDTmin] = useState<number>(10);
  const [activeStep, setActiveStep] = useState<number>(0);
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Heat Pump State (Step 7)
  const [hpCapacity, setHpCapacity] = useState<number>(50); // kW
  const [hpCondGlide, setHpCondGlide] = useState<number>(10); // °C
  const [hpEvapGlide, setHpEvapGlide] = useState<number>(10); // °C
  const [gasPrice, setGasPrice] = useState<number>(60); // €/MWh
  const [electricityPrice, setElectricityPrice] = useState<number>(150); // €/MWh
  const [carnotEfficiency, setCarnotEfficiency] = useState<number>(0.55); // fraction

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

  // Keep HP capacity within the target heating utility limits
  React.useEffect(() => {
    if (hpCapacity > results.qhMin) {
      setHpCapacity(Math.round(results.qhMin * 10) / 10);
    }
  }, [results.qhMin]);

  const hpData = useMemo(() => {
    // 1. Shifted GCC above and below pinch (actual temperatures from utility perspective)
    // Plotted arrays are kept in temperature-sorted order so Recharts draws the curve correctly.
    const plottedGccAbove = results.grandComposite
      .filter(pt => pt.t >= results.pinchTempShifted)
      .map(pt => ({
        h: Math.round(pt.h * 10) / 10,
        t: Math.round((pt.t + dTmin / 2) * 10) / 10
      }));

    const plottedGccBelow = results.grandComposite
      .filter(pt => pt.t <= results.pinchTempShifted)
      .map(pt => ({
        h: Math.round(pt.h * 10) / 10,
        t: Math.round((pt.t - dTmin / 2) * 10) / 10
      }));

    if (plottedGccAbove.length === 0 || plottedGccBelow.length === 0) {
      return {
        plottedGccAbove: [],
        plottedGccBelow: [],
        tCondIn: 0,
        tCondOut: 0,
        tEvapIn: 0,
        tEvapOut: 0,
        qEvap: 0,
        cop: 1.0,
        carnotCop: 1.0,
        compressorPower: 0,
        hourlySavings: 0,
        annualSavings: 0
      };
    }

    // 2. Condenser Inlet/Outlet Temperatures
    const condCandidates = [0, hpCapacity];
    plottedGccAbove.forEach(pt => {
      if (pt.h > 1e-5 && pt.h < hpCapacity - 1e-5) {
        condCandidates.push(pt.h);
      }
    });

    let minF = Infinity;
    condCandidates.forEach(h => {
      const tGcc = interpolateT(plottedGccAbove, h, true);
      if (tGcc !== undefined) {
        const fraction = hpCapacity > 1e-5 ? h / hpCapacity : 0;
        const val = fraction * hpCondGlide - tGcc;
        if (val < minF) minF = val;
      }
    });

    const tCondIn = dTmin - minF;
    const tCondOut = tCondIn + hpCondGlide;

    // 3. Solve for COP and Evaporator Temperatures (coupled since Q_evap depends on COP)
    // Slope is negative (T_evap_out < T_evap_in) as evaporator cools process streams below pinch.
    let cop = 4.0;
    let tEvapIn = 0;
    let tEvapOut = 0;
    let qEvap = 0;

    for (let iter = 0; iter < 50; iter++) {
      qEvap = hpCapacity * (1 - 1 / cop);

      const evapCandidates = [0, qEvap];
      plottedGccBelow.forEach(pt => {
        if (pt.h > 1e-5 && pt.h < qEvap - 1e-5) {
          evapCandidates.push(pt.h);
        }
      });

      let minG = Infinity;
      evapCandidates.forEach(h => {
        const tGcc = interpolateT(plottedGccBelow, h, false);
        if (tGcc !== undefined) {
          const fraction = qEvap > 1e-5 ? h / qEvap : 0;
          const val = tGcc - dTmin + fraction * hpEvapGlide;
          if (val < minG) minG = val;
        }
      });

      tEvapIn = minG;
      tEvapOut = tEvapIn - hpEvapGlide;

      const delta = tCondOut - tEvapOut;
      const carnotCop = delta > 0.1 ? (tCondOut + 273.15) / delta : 1.0;
      const newCop = carnotCop * carnotEfficiency;

      if (Math.abs(newCop - cop) < 1e-4) {
        cop = newCop;
        break;
      }
      cop = newCop;
    }

    const compressorPower = cop > 1e-5 ? hpCapacity / cop : 0;

    // 4. Economics
    // Gas savings (boiler efficiency = 90%): HP replaces gas boiler
    const gasSavingsCost = (hpCapacity / 0.90) * (gasPrice / 1000); // €/h
    const electricityCost = compressorPower * (electricityPrice / 1000); // €/h
    const hourlySavings = gasSavingsCost - electricityCost;
    const annualSavings = hourlySavings * 8000;

    return {
      plottedGccAbove,
      plottedGccBelow,
      tCondIn: Math.round(tCondIn * 10) / 10,
      tCondOut: Math.round(tCondOut * 10) / 10,
      tEvapIn: Math.round(tEvapIn * 10) / 10,
      tEvapOut: Math.round(tEvapOut * 10) / 10,
      qEvap: Math.round(qEvap * 10) / 10,
      cop: Math.round(cop * 100) / 100,
      carnotCop: Math.round(((tCondOut + 273.15) / Math.max(tCondOut - tEvapOut, 0.1)) * 100) / 100,
      compressorPower: Math.round(compressorPower * 10) / 10,
      hourlySavings: Math.round(hourlySavings * 100) / 100,
      annualSavings: Math.round(annualSavings)
    };
  }, [results, dTmin, hpCapacity, hpCondGlide, hpEvapGlide, gasPrice, electricityPrice, carnotEfficiency]);

  // Helper to calculate savings for any arbitrary capacity Q_cond (used in tooltip and savings curve)
  const calculateSavingsForCapacity = useMemo(() => {
    return (Q_cond: number) => {
      if (Q_cond < 1e-3 || hpData.plottedGccAbove.length === 0 || hpData.plottedGccBelow.length === 0) {
        return { savings: 0, cop: 1.0, W_comp: 0, qEvap: 0 };
      }

      // 1. Condenser Inlet/Outlet Temperatures for Q_cond
      const condCandidates = [0, Q_cond];
      hpData.plottedGccAbove.forEach(pt => {
        if (pt.h > 1e-5 && pt.h < Q_cond - 1e-5) {
          condCandidates.push(pt.h);
        }
      });

      let minF = Infinity;
      condCandidates.forEach(h => {
        const tGcc = interpolateT(hpData.plottedGccAbove, h, true);
        if (tGcc !== undefined) {
          const fraction = Q_cond > 1e-5 ? h / Q_cond : 0;
          const val = fraction * hpCondGlide - tGcc;
          if (val < minF) minF = val;
        }
      });

      const tCondIn = dTmin - minF;
      const tCondOut = tCondIn + hpCondGlide;

      // 2. Solver for Evaporator & COP
      let cop = 4.0;
      let tEvapIn = 0;
      let tEvapOut = 0;
      let qEvap = 0;

      for (let iter = 0; iter < 50; iter++) {
        qEvap = Q_cond * (1 - 1 / cop);

        const evapCandidates = [0, qEvap];
        hpData.plottedGccBelow.forEach(pt => {
          if (pt.h > 1e-5 && pt.h < qEvap - 1e-5) {
            evapCandidates.push(pt.h);
          }
        });

        let minG = Infinity;
        evapCandidates.forEach(h => {
          const tGcc = interpolateT(hpData.plottedGccBelow, h, false);
          if (tGcc !== undefined) {
            const fraction = qEvap > 1e-5 ? h / qEvap : 0;
            const val = tGcc - dTmin + fraction * hpEvapGlide;
            if (val < minG) minG = val;
          }
        });

        tEvapIn = minG;
        tEvapOut = tEvapIn - hpEvapGlide;

        const delta = tCondOut - tEvapOut;
        const carnotCop = delta > 0.1 ? (tCondOut + 273.15) / delta : 1.0;
        const newCop = carnotCop * carnotEfficiency;

        if (Math.abs(newCop - cop) < 1e-4) {
          cop = newCop;
          break;
        }
        cop = newCop;
      }

      const W_comp = cop > 1e-5 ? Q_cond / cop : 0;
      const gasSavingsCost = (Q_cond / 0.90) * (gasPrice / 1000); // €/h
      const electricityCost = W_comp * (electricityPrice / 1000); // €/h
      const savings = gasSavingsCost - electricityCost;

      return { savings, cop, W_comp, qEvap };
    };
  }, [hpData, hpCondGlide, hpEvapGlide, gasPrice, electricityPrice, carnotEfficiency, dTmin]);

  const savingsCurveData = useMemo(() => {
    if (activeStep !== 6 || results.qhMin < 1e-2) return [];
    const pts: { h: number; savings: number }[] = [];
    const stepsCount = 20;
    for (let i = 0; i <= stepsCount; i++) {
      const q = (i / stepsCount) * results.qhMin;
      const res = calculateSavingsForCapacity(q);
      pts.push({
        h: Math.round(q * 10) / 10,
        savings: Math.round(res.savings * 100) / 100
      });
    }
    return pts;
  }, [activeStep, results.qhMin, calculateSavingsForCapacity]);

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

  // GCC Animation State (transition to Step 5)
  const [gccTransitionProgress, setGccTransitionProgress] = useState<number>(activeStep === 4 ? 1 : 0);

  React.useEffect(() => {
    let animationFrameId: number;
    const startTime = performance.now();
    const duration = 1200; // 1.2 seconds transition
    const startVal = gccTransitionProgress;
    const targetVal = activeStep === 4 ? 1 : 0;

    if (startVal === targetVal) return;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeInOutCubic
      const ease = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      
      const currentVal = startVal + (targetVal - startVal) * ease;
      setGccTransitionProgress(currentVal);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setGccTransitionProgress(targetVal);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [activeStep]);

  // Temperature Shift Animation State (transition to Step 4)
  const [tempShiftProgress, setTempShiftProgress] = useState<number>((activeStep >= 3 && activeStep !== 5) ? 1 : 0);

  React.useEffect(() => {
    let animationFrameId: number;
    const startTime = performance.now();
    const duration = 1200; // 1.2 seconds transition
    const startVal = tempShiftProgress;
    const targetVal = (activeStep >= 3 && activeStep !== 5) ? 1 : 0;

    if (startVal === targetVal) return;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeInOutCubic
      const ease = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      
      const currentVal = startVal + (targetVal - startVal) * ease;
      setTempShiftProgress(currentVal);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setTempShiftProgress(targetVal);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [activeStep]);

  // Horizontal Shift Animation State (transition to Step 3)
  const [hShiftProgress, setHShiftProgress] = useState<number>(activeStep >= 2 ? 1 : 0);

  React.useEffect(() => {
    let animationFrameId: number;
    const startTime = performance.now();
    const duration = 1200; // 1.2 seconds transition
    const startVal = hShiftProgress;
    const targetVal = activeStep >= 2 ? 1 : 0;

    if (startVal === targetVal) return;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeInOutCubic
      const ease = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      
      const currentVal = startVal + (targetVal - startVal) * ease;
      setHShiftProgress(currentVal);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setHShiftProgress(targetVal);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [activeStep]);

  // Step 6 transition progress:
  // 0.0 -> 0.4: Vertical shift (unshifting temperature by dTmin/2)
  // 0.4 -> 0.6: Gaps fade in (opacity goes 0 -> 1)
  // 0.6 -> 1.0: Horizontal shift (opening gaps)
  const [step6Transition, setStep6Transition] = useState<number>(activeStep === 5 ? 1 : 0);

  React.useEffect(() => {
    let animationFrameId: number;
    const startTime = performance.now();
    const duration = 1600; // 1.6 seconds transition
    const startVal = step6Transition;
    const targetVal = activeStep === 5 ? 1 : 0;

    if (startVal === targetVal) return;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeInOutCubic
      const ease = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      
      const currentVal = startVal + (targetVal - startVal) * ease;
      setStep6Transition(currentVal);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setStep6Transition(targetVal);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [activeStep]);

  // Step 6 transition factors
  const step6TransitionFactors = useMemo(() => {
    const p = step6Transition;
    const fVert = Math.min(p / 0.4, 1);
    const fOpacity = p < 0.4 ? 0 : Math.min((p - 0.4) / 0.2, 1);
    const fHoriz = p < 0.6 ? 0 : Math.min((p - 0.6) / 0.4, 1);
    return { fVert, fOpacity, fHoriz };
  }, [step6Transition]);

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

  // Enthalpy shift for Cold Composite curve: 0 in step 1/2, qcMin in steps 3-5
  const coldShift = activeStep >= 2 ? results.qcMin : 0;

  // Find pinch enthalpy by interpolating hot composite at hot pinch temperature
  const hPinch = useMemo(() => {
    return interpolateH(results.hotComposite, results.pinchTempHot);
  }, [results.hotComposite, results.pinchTempHot]);

  // Calculate actual closest approach in the overlapping enthalpy region
  const closestApproach = useMemo(() => {
    const hotPoints = results.hotComposite;
    const coldPoints = results.coldCompositeRaw.map(pt => ({
      h: pt.h + coldShift,
      t: pt.t
    }));

    if (hotPoints.length === 0 || coldPoints.length === 0) {
      return { actualDTmin: undefined, hClosest: undefined, tHotClosest: undefined, tColdClosest: undefined };
    }

    const hStart = coldShift; // Start of shifted cold curve
    const hEnd = hotPoints[hotPoints.length - 1].h; // End of hot curve

    // If there is no overlap range, return undefined
    if (hStart >= hEnd) {
      return { actualDTmin: undefined, hClosest: undefined, tHotClosest: undefined, tColdClosest: undefined };
    }

    // Gather all unique enthalpy points within the overlap region to test as candidate closest approach points
    const candidates = new Set<number>();
    candidates.add(hStart);
    candidates.add(hEnd);

    hotPoints.forEach(pt => {
      if (pt.h >= hStart && pt.h <= hEnd) {
        candidates.add(pt.h);
      }
    });

    coldPoints.forEach(pt => {
      if (pt.h >= hStart && pt.h <= hEnd) {
        candidates.add(pt.h);
      }
    });

    let minDT = Infinity;
    let hClosest = hStart;
    let tHotClosest = 0;
    let tColdClosest = 0;

    candidates.forEach(h => {
      const tHot = interpolateT(hotPoints, h, false);
      const tCold = interpolateT(coldPoints, h, true);
      if (tHot !== undefined && tCold !== undefined) {
        const dT = tHot - tCold;
        if (dT < minDT) {
          minDT = dT;
          hClosest = h;
          tHotClosest = tHot;
          tColdClosest = tCold;
        }
      }
    });

    if (minDT === Infinity) {
      return { actualDTmin: undefined, hClosest: undefined, tHotClosest: undefined, tColdClosest: undefined };
    }

    return {
      actualDTmin: Math.round(minDT * 10) / 10,
      hClosest,
      tHotClosest: Math.round(tHotClosest * 10) / 10,
      tColdClosest: Math.round(tColdClosest * 10) / 10
    };
  }, [results.hotComposite, results.coldCompositeRaw, coldShift]);

  // Prepare separate datasets for Hot and Cold composite curves to keep Hot Composite completely static
  const hotCompositeData = useMemo(() => {
    const tShift = -tempShiftProgress * (dTmin / 2);
    return results.hotComposite.map(pt => ({
      h: Math.round(pt.h * 10) / 10,
      t: pt.t + tShift
    }));
  }, [results.hotComposite, tempShiftProgress, dTmin]);

  const coldCompositeData = useMemo(() => {
    const tShift = activeStep === 3 ? dTmin / 2 : 0;
    return results.coldCompositeRaw.map(pt => ({
      h: Math.round((pt.h + coldShift) * 10) / 10,
      t: pt.t + tShift
    }));
  }, [results.coldCompositeRaw, coldShift, activeStep, dTmin]);

  // Helper coordinates for utility target lines in Step 3
  const tColdMin = coldCompositeData[0]?.t;
  const tColdMax = coldCompositeData[coldCompositeData.length - 1]?.t;
  const tHotMax = hotCompositeData[hotCompositeData.length - 1]?.t;
  const hHotMax = hotCompositeData[hotCompositeData.length - 1]?.h;
  const hColdMax = coldCompositeData[coldCompositeData.length - 1]?.h;


  // Grand Composite Curve Chart Data
  const gccChartData = useMemo(() => {
    return results.grandComposite.map(pt => ({
      h: Math.round(pt.h * 10) / 10,
      tShifted: Math.round(pt.t * 10) / 10
    }));
  }, [results]);

  const gccAbovePinch = useMemo(() => {
    return results.grandComposite.filter(pt => pt.t >= results.pinchTempShifted).map(pt => ({
      h: Math.round(pt.h * 10) / 10,
      tShifted: Math.round(pt.t * 10) / 10
    }));
  }, [results]);

  const gccBelowPinch = useMemo(() => {
    return results.grandComposite.filter(pt => pt.t <= results.pinchTempShifted).map(pt => ({
      h: Math.round(pt.h * 10) / 10,
      tShifted: Math.round(pt.t * 10) / 10
    }));
  }, [results]);

  const unifiedColdData = useMemo(() => {
    return results.grandComposite.map(pt => {
      const tShifted = pt.t; // Shifted temperature Y coordinate
      
      // Interpolate the hot composite curve at the shifted hot temperature
      // tShifted = T_hot - dTmin/2 => T_hot = tShifted + dTmin/2
      const x1 = interpolateH(results.hotComposite, tShifted + dTmin / 2);
      
      // Enthalpy values for each step (smoothly shifts horizontally and transitions to GCC)
      const hVal = pt.h + (1 - gccTransitionProgress) * x1 - (1 - hShiftProgress) * results.qcMin;

      // Y-axis temperature values for each step (smoothly shifted by tempShiftProgress)
      const tVal = tShifted - (1 - tempShiftProgress) * (dTmin / 2);

      return {
        h: Math.round(hVal * 10) / 10,
        t: Math.round(tVal * 10) / 10
      };
    });
  }, [activeStep, results, gccTransitionProgress, tempShiftProgress, hShiftProgress, dTmin]);

  const step6Data = useMemo(() => {
    const raw = results.coldCompositeRaw;
    const aligned = results.coldComposite;
    const hot = results.hotComposite;
    const temps = results.shiftedTemps;
    const cascade = results.adjustedCascade;
    
    if (raw.length === 0 || hot.length === 0 || temps.length === 0) {
      return {
        hotSegmentsAbove: [],
        coldSegmentsBelow: [],
        coldAbovePinchSteady: [],
        hotBelowPinchSteady: [],
        heatingGaps: [],
        coolingGaps: [],
        offset: 0,
        pinchH: 0
      };
    }

    const { fVert, fOpacity, fHoriz } = step6TransitionFactors;
    const hPinchCold = hPinch;
    const hPinchHot = hPinch;

    // 1. Find pinch index
    let pinchIdx = 0;
    for (let i = 0; i < cascade.length; i++) {
      if (Math.abs(cascade[i]) < 1e-5) {
        pinchIdx = i;
        break;
      }
    }
    const pinchTempShifted = temps[pinchIdx];
    const pinchTempHot = pinchTempShifted + dTmin / 2;
    const pinchTempCold = pinchTempShifted - dTmin / 2;

    // 2. Compute running-minimum shifts
    const shiftsAbove: number[] = [];
    for (let j = 0; j <= pinchIdx; j++) {
      let minVal = Infinity;
      for (let i = 0; i <= j; i++) {
        if (cascade[i] < minVal) minVal = cascade[i];
      }
      shiftsAbove.push(minVal);
    }

    const shiftsBelow: number[] = [];
    for (let j = pinchIdx; j < cascade.length; j++) {
      let minVal = Infinity;
      for (let i = j; i < cascade.length; i++) {
        if (cascade[i] < minVal) minVal = cascade[i];
      }
      shiftsBelow.push(minVal);
    }

    // 3. Hot Segments (Above the Pinch)
    const hotSegmentsAbove: { key: string; name: string; points: { h: number; t: number }[]; shift: number }[] = [];
    for (let k = 0; k < pinchIdx; k++) {
      const t_start = temps[k];
      const t_end = temps[k + 1];
      const t_hot_low = t_end + dTmin / 2;
      const t_hot_high = t_start + dTmin / 2;
      
      if (t_hot_high - t_hot_low <= 1e-3) continue;
      
      const h_low = interpolateH(hot, t_hot_low);
      const h_high = interpolateH(hot, t_hot_high);
      
      if (h_high - h_low <= 1e-3) continue;
      
      const points: { h: number; t: number }[] = [{ h: h_low, t: t_hot_low }];
      hot.forEach(pt => {
        if (pt.t > t_hot_low + 1e-5 && pt.t < t_hot_high - 1e-5) {
          points.push(pt);
        }
      });
      points.push({ h: h_high, t: t_hot_high });
      
      const shift = shiftsAbove[k];
      hotSegmentsAbove.push({
        key: `hot-seg-above-${k}`,
        name: `Hot Segment (${Math.round(t_hot_low * 10) / 10}°C - ${Math.round(t_hot_high * 10) / 10}°C)`,
        points,
        shift
      });
    }

    // 4. Cold Segments (Below the Pinch)
    const coldSegmentsBelow: { key: string; name: string; points: { h: number; t: number }[]; shift: number }[] = [];
    for (let k = pinchIdx; k < temps.length - 1; k++) {
      const t_start = temps[k];
      const t_end = temps[k + 1];
      const t_cold_low = t_end - dTmin / 2;
      const t_cold_high = t_start - dTmin / 2;
      
      if (t_cold_high - t_cold_low <= 1e-3) continue;
      
      const h_low = interpolateH(aligned, t_cold_low);
      const h_high = interpolateH(aligned, t_cold_high);
      
      if (h_high - h_low <= 1e-3) continue;
      
      const points: { h: number; t: number }[] = [{ h: h_low, t: t_cold_low }];
      aligned.forEach(pt => {
        if (pt.t > t_cold_low + 1e-5 && pt.t < t_cold_high - 1e-5) {
          points.push(pt);
        }
      });
      points.push({ h: h_high, t: t_cold_high });
      
      const shift = shiftsBelow[k - pinchIdx];
      coldSegmentsBelow.push({
        key: `cold-seg-below-${k}`,
        name: `Cold Segment (${Math.round(t_cold_low * 10) / 10}°C - ${Math.round(t_cold_high * 10) / 10}°C)`,
        points,
        shift
      });
    }

    // 5. Steady Cold Curve Above the Pinch
    const coldAbovePinchSteadyRaw: { h: number; t: number }[] = [];
    const hPinchColdAligned = interpolateH(aligned, pinchTempCold);
    coldAbovePinchSteadyRaw.push({ h: hPinchColdAligned, t: pinchTempCold });
    aligned.forEach(pt => {
      if (pt.t > pinchTempCold + 1e-5) {
        coldAbovePinchSteadyRaw.push(pt);
      }
    });

    // 6. Steady Hot Curve Below the Pinch
    const hotBelowPinchSteadyRaw: { h: number; t: number }[] = [];
    hot.forEach(pt => {
      if (pt.t < pinchTempHot - 1e-5) {
        hotBelowPinchSteadyRaw.push(pt);
      }
    });
    const hPinchHotAligned = interpolateH(hot, pinchTempHot);
    hotBelowPinchSteadyRaw.push({ h: hPinchHotAligned, t: pinchTempHot });

    // 7. Calculate offset based on final positions to keep minimum enthalpy at 0
    let minH = 0;
    coldSegmentsBelow.forEach(seg => {
      seg.points.forEach(pt => {
        const h_final = pt.h - seg.shift;
        if (h_final < minH) minH = h_final;
      });
    });
    hotSegmentsAbove.forEach(seg => {
      seg.points.forEach(pt => {
        const h_final = pt.h + seg.shift;
        if (h_final < minH) minH = h_final;
      });
    });
    coldAbovePinchSteadyRaw.forEach(pt => {
      if (pt.h < minH) minH = pt.h;
    });
    hotBelowPinchSteadyRaw.forEach(pt => {
      if (pt.h < minH) minH = pt.h;
    });

    const offset = minH < 0 ? -minH : 0;

    // Apply animation interpolation
    const animatedColdAbovePinchSteady = coldAbovePinchSteadyRaw.map(pt => {
      const h_final = pt.h + offset;
      const t_final = pt.t;
      const h_gcc = pt.h - hPinchCold;
      const t_gcc = pt.t + dTmin / 2;
      return {
        h: Math.round((h_gcc + fHoriz * (h_final - h_gcc)) * 10) / 10,
        t: Math.round((t_gcc - fVert * (dTmin / 2)) * 10) / 10
      };
    });

    const animatedHotBelowPinchSteady = hotBelowPinchSteadyRaw.map(pt => {
      const h_final = pt.h + offset;
      const t_final = pt.t;
      const h_gcc = pt.h - hPinchHot;
      const t_gcc = pt.t - dTmin / 2;
      return {
        h: Math.round((h_gcc + fHoriz * (h_final - h_gcc)) * 10) / 10,
        t: Math.round((t_gcc + fVert * (dTmin / 2)) * 10) / 10
      };
    });

    const animatedHotSegmentsAbove = hotSegmentsAbove.map(seg => ({
      key: seg.key,
      name: seg.name,
      data: seg.points.map(pt => {
        const h_final = pt.h + seg.shift + offset;
        const t_final = pt.t;
        const h_gcc = pt.h - hPinchCold;
        const t_gcc = pt.t + dTmin / 2;
        return {
          h: Math.round((h_gcc + fHoriz * (h_final - h_gcc)) * 10) / 10,
          t: Math.round((t_gcc - fVert * (dTmin / 2)) * 10) / 10
        };
      })
    }));

    const animatedColdSegmentsBelow = coldSegmentsBelow.map(seg => ({
      key: seg.key,
      name: seg.name,
      data: seg.points.map(pt => {
        const h_final = pt.h - seg.shift + offset;
        const t_final = pt.t;
        const h_gcc = pt.h - hPinchHot;
        const t_gcc = pt.t - dTmin / 2;
        return {
          h: Math.round((h_gcc + fHoriz * (h_final - h_gcc)) * 10) / 10,
          t: Math.round((t_gcc + fVert * (dTmin / 2)) * 10) / 10
        };
      })
    }));

    // 8. Compute Gaps (Animate their horizontal bounds and temperatures)
    const heatingGaps: { t: number; q: number; hStart: number; hEnd: number; opacity: number }[] = [];
    for (let j = 0; j < pinchIdx; j++) {
      const q = shiftsAbove[j] - shiftsAbove[j + 1];
      if (q > 0.05) {
        const t_hot = temps[j] + dTmin / 2;
        const h_aligned = interpolateH(hot, t_hot);
        const hStart_final = h_aligned + shiftsAbove[j + 1] + offset;
        const hEnd_final = h_aligned + shiftsAbove[j] + offset;
        
        const hStart_gcc = h_aligned - hPinchCold;
        const hEnd_gcc = h_aligned - hPinchCold;
        const t_gcc = t_hot;

        heatingGaps.push({
          t: Math.round((t_gcc - fVert * (dTmin / 2)) * 10) / 10,
          q: Math.round(q * 10) / 10,
          hStart: Math.round((hStart_gcc + fHoriz * (hStart_final - hStart_gcc)) * 10) / 10,
          hEnd: Math.round((hEnd_gcc + fHoriz * (hEnd_final - hEnd_gcc)) * 10) / 10,
          opacity: fOpacity
        });
      }
    }

    const coolingGaps: { t: number; q: number; hStart: number; hEnd: number; opacity: number }[] = [];
    for (let j = pinchIdx + 1; j < temps.length; j++) {
      const q = shiftsBelow[j - pinchIdx] - shiftsBelow[j - 1 - pinchIdx];
      if (q > 0.05) {
        const t_cold = temps[j] - dTmin / 2;
        const h_aligned = interpolateH(aligned, t_cold);
        const hStart_final = h_aligned - shiftsBelow[j - pinchIdx] + offset;
        const hEnd_final = h_aligned - shiftsBelow[j - 1 - pinchIdx] + offset;
        
        const hStart_gcc = h_aligned - hPinchHot;
        const hEnd_gcc = h_aligned - hPinchHot;
        const t_gcc = t_cold;

        coolingGaps.push({
          t: Math.round((t_gcc + fVert * (dTmin / 2)) * 10) / 10,
          q: Math.round(q * 10) / 10,
          hStart: Math.round((hStart_gcc + fHoriz * (hStart_final - hStart_gcc)) * 10) / 10,
          hEnd: Math.round((hEnd_gcc + fHoriz * (hEnd_final - hEnd_gcc)) * 10) / 10,
          opacity: fOpacity
        });
      }
    }

    const pinchH = fHoriz * (hPinchHot + offset);

    return {
      hotSegmentsAbove: animatedHotSegmentsAbove,
      coldSegmentsBelow: animatedColdSegmentsBelow,
      coldAbovePinchSteady: animatedColdAbovePinchSteady,
      hotBelowPinchSteady: animatedHotBelowPinchSteady,
      heatingGaps,
      coolingGaps,
      offset,
      pinchH: Math.round(pinchH * 10) / 10
    };
  }, [results, dTmin, hPinch, step6TransitionFactors]);

  const step6FaintHot = useMemo(() => {
    return results.hotComposite.map(pt => ({
      h: Math.round((pt.h + step6Data.offset) * 10) / 10,
      t: pt.t
    }));
  }, [results.hotComposite, step6Data.offset]);

  const step6FaintCold = useMemo(() => {
    return results.coldComposite.map(pt => ({
      h: Math.round((pt.h + step6Data.offset) * 10) / 10,
      t: pt.t
    }));
  }, [results.coldComposite, step6Data.offset]);

  const steps = [
    { title: 'Stream Database', desc: 'Input your process streams' },
    { title: 'Unshifted Composite Curves', desc: 'Combine hot and cold streams starting from 0 kW' },
    { title: 'Pinch Alignment', desc: 'Shift the cold curve to satisfy the minimum approach temperature (ΔTmin)' },
    { title: 'Interval Shifts & Heat Cascade', desc: 'Shift temperatures by ΔTmin/2 to calculate interval heat balances' },
    { title: 'Grand Composite Curve', desc: 'Map utility placements against the GCC' },
    { title: 'Balanced Composite Curves', desc: 'Keep cold curve above pinch steady and hot curve below pinch steady, leaving utility gaps' },
    { title: 'Heat Pump Integration', desc: 'Integrate a heat pump onto the Grand Composite Curve' }
  ];

  // Find min/max temperature for stable Y domain
  const tempDomain = useMemo(() => {
    if (streams.length === 0) return [0, 200];
    const temps = streams.flatMap(s => [s.tempIn, s.tempOut]);
    let minT = Math.min(...temps);
    let maxT = Math.max(...temps);
    if (activeStep === 6) {
      minT = Math.min(minT, hpData.tEvapIn);
      maxT = Math.max(maxT, hpData.tCondOut);
    }
    const pad = Math.max((maxT - minT) * 0.1, 10);
    return [Math.max(0, Math.floor(minT - pad)), Math.ceil(maxT + pad)];
  }, [streams, activeStep, hpData.tEvapIn, hpData.tCondOut]);

  // Find max enthalpy for stable X domain
  const enthalpyDomain = useMemo(() => {
    if (activeStep === 6) {
      const maxVal = Math.max(results.qhMin, results.qcMin);
      return [0, Math.max(maxVal, 10)];
    }
    let maxH = Math.max(stats.totalHotLoad, stats.totalColdLoad + results.qhMin, 100);
    if (activeStep === 5 && gccTransitionProgress === 0) {
      maxH += step6Data.offset;
    }
    return [0, Math.ceil(maxH * 1.05)];
  }, [stats.totalHotLoad, stats.totalColdLoad, results.qhMin, results.qcMin, activeStep, gccTransitionProgress, step6Data.offset]);

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

              {/* STEP 3: Pinch Alignment & ΔTmin */}
              {activeStep === 2 && (
                <div className="space-y-6">
                  <div className="text-xs text-slate-400 space-y-3">
                    <p>
                      To transfer heat from the hot streams to the cold streams, the Hot Composite curve must always be hotter than the Cold Composite curve (T_hot &gt; T_cold).
                    </p>
                    <p>
                      At 0 kW shift (Step 2), the curves cross over, which violates the Second Law of Thermodynamics (heat cannot flow spontaneously from cold to hot).
                    </p>
                    <p>
                      We slide the Cold Composite curve to the right until there is no crossover and the minimum temperature difference between the curves is exactly <span className="font-semibold text-cyan-400">ΔTmin</span>. The point where they are closest is the <span className="text-amber-400 font-semibold">Pinch Point</span>.
                    </p>
                  </div>

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
                    <p className="text-[10px] text-slate-500 mt-1.5">
                      Adjust the slider to see how changing ΔTmin shifts the blue Cold Composite curve. A larger ΔTmin increases safety but requires more utility energy (larger horizontal gaps at the ends).
                    </p>
                  </div>

                  {/* Real-time Targets Metrics */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Required Shift</span>
                      <span className="text-base font-bold text-white block">
                        {Math.round(results.qhMin * 10) / 10} <span className="text-xs font-light text-slate-500">kW (Hot Utility)</span>
                      </span>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Pinch Temperature</span>
                      <span className="text-base font-bold text-amber-400 block">
                        {Math.round(results.pinchTempHot * 10) / 10}°C <span className="text-xs font-light text-slate-500">Hot</span> / {Math.round(results.pinchTempCold * 10) / 10}°C <span className="text-xs font-light text-slate-500">Cold</span>
                      </span>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Actual Min Approach</span>
                      <span className="text-base font-bold text-cyan-400 block">
                        {closestApproach.actualDTmin !== undefined ? `${closestApproach.actualDTmin}°C` : '-'}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Target: {dTmin}°C {closestApproach.actualDTmin !== undefined && closestApproach.actualDTmin > dTmin && (
                          <span className="text-emerald-400 font-semibold block sm:inline sm:ml-1">(Actual &gt; Target)</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: Interval Shifts & Heat Cascade */}
              {activeStep === 3 && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-400 space-y-2">
                    <p>
                      To calculate the exact Pinch Point and utility targets, we shift temperatures by <span className="font-semibold text-cyan-400">ΔTmin / 2 ({dTmin/2}°C)</span>:
                      Hot streams are shifted <span className="text-red-400 font-semibold">downward</span>, and cold streams are shifted <span className="text-blue-400 font-semibold">upward</span>.
                    </p>
                    <p>
                      This alignment allows us to partition the temperature range into intervals and calculate the net heat balance (dH) in each interval. We then construct the Heat Cascade, adjusting it so that the minimum heat flow is exactly zero.
                    </p>
                  </div>

                  {/* Individual Stream Shifts (Collapsible) */}
                  <details className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-3 group">
                    <summary className="font-semibold text-xs text-slate-300 cursor-pointer select-none flex items-center justify-between">
                      <span>View Individual Stream Temperature Shifts (T' = T ± ΔTmin/2)</span>
                      <span className="text-slate-500 group-open:rotate-180 transition-transform duration-200">▼</span>
                    </summary>
                    <div className="mt-3 overflow-x-auto border-t border-slate-800 pt-2">
                      <table className="w-full border-collapse text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-500 font-medium">
                            <th className="py-2 px-3">Stream</th>
                            <th className="py-2 px-3">Type</th>
                            <th className="py-2 px-3 text-center">Supply Tin</th>
                            <th className="py-2 px-3 text-center">Shifted Tin'</th>
                            <th className="py-2 px-3 text-center">Target Tout</th>
                            <th className="py-2 px-3 text-center">Shifted Tout'</th>
                          </tr>
                        </thead>
                        <tbody>
                          {streams.map((s) => {
                            const shift = s.type === 'hot' ? -dTmin/2 : dTmin/2;
                            return (
                              <tr 
                                key={s.id} 
                                className={`border-b border-slate-800/40 ${
                                  s.type === 'hot' ? 'text-red-300' : 'text-blue-300'
                                }`}
                              >
                                <td className="py-2 px-3 font-medium text-slate-200">{s.name}</td>
                                <td className="py-2 px-3 font-semibold capitalize">{s.type}</td>
                                <td className="py-2 px-3 text-center font-mono">{s.tempIn}°C</td>
                                <td className="py-2 px-3 text-center font-mono font-bold">{s.tempIn + shift}°C</td>
                                <td className="py-2 px-3 text-center font-mono">{s.tempOut}°C</td>
                                <td className="py-2 px-3 text-center font-mono font-bold">{s.tempOut + shift}°C</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>

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

              {/* STEP 5: Grand Composite Curve Summary */}
              {activeStep === 4 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">
                    The Grand Composite Curve (GCC) is constructed by taking the horizontal intervals between the shifted composite curves and aligning them to start at 0 kW enthalpy.
                    The line follows the rightmost tips of these horizontal segments.
                  </p>
                  
                  <div className="bg-slate-900/30 border border-slate-850 p-4 rounded-xl space-y-2.5 text-xs text-slate-400">
                    <h4 className="font-semibold text-slate-200">Curve Interpretation & Colors:</h4>
                    <ul className="list-disc list-inside space-y-1.5">
                      <li><strong>Above the Pinch (Blue)</strong>: Represents the net heat deficit of the process at higher temperatures. Hot utilities (heaters, steam) are placed here to supply heat.</li>
                      <li><strong>Below the Pinch (Red)</strong>: Represents the net heat surplus of the process at lower temperatures. Cold utilities (cooling water, air) are placed here to reject heat.</li>
                      <li><strong>Pinch Point (Orange dashed line)</strong>: The neck of the curve where the net heat flow is exactly zero, separating the heating and cooling zones.</li>
                    </ul>
                  </div>

                  {/* Real-time Targets Metrics */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-red-950/10 border border-red-500/10 p-3.5 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Heating Utility Target (Q_H)</span>
                      <span className="text-sm font-bold text-red-400 block">
                        {Math.round(results.qhMin * 10) / 10} kW
                      </span>
                    </div>
                    <div className="bg-blue-950/10 border border-blue-500/10 p-3.5 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Cooling Utility Target (Q_C)</span>
                      <span className="text-sm font-bold text-blue-400 block">
                        {Math.round(results.qcMin * 10) / 10} kW
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 6: Heat Exchanger Matching */}
              {/* STEP 6: Heat Exchanger Matching & Utility Optimization */}
              {activeStep === 5 && (
                <div className="space-y-5">
                  <div className="bg-slate-900/30 border border-slate-855 p-4 rounded-xl space-y-3 text-xs text-slate-350">
                    <h4 className="font-bold text-sm text-cyan-400 flex items-center space-x-1.5">
                      <span>💡 Utility Level Optimization</span>
                    </h4>
                    <p className="text-slate-400 leading-relaxed">
                      Seeing these horizontal gaps indicates that we do not have to satisfy all utility requirements using high-cost utilities (like refrigeration or high-pressure steam). Instead, we can select optimal utility levels based on the gap temperatures:
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-slate-400 pl-1">
                      <li>
                        <strong className="text-red-400 font-semibold">Colder Heating Utilities</strong>: For heating gaps at lower temperatures, we can use cheaper hot water loops or low-pressure steam instead of high-temperature steam.
                      </li>
                      <li>
                        <strong className="text-blue-400 font-semibold">Hotter Cooling Utilities</strong>: For cooling gaps at higher temperatures, we can use a cooling tower or air cooling instead of chilled water, saving significant refrigeration power.
                      </li>
                    </ul>
                  </div>

                  {/* Gaps Breakdown Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Heating Gaps Breakdown */}
                    <div className="bg-slate-900/20 border border-slate-850 rounded-xl p-4 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2">
                          <h4 className="font-semibold text-xs text-red-400 uppercase tracking-wider">Heating Gaps (Q_H)</h4>
                          <span className="text-[10px] font-bold text-slate-400 font-mono">
                            Target: {Math.round(results.qhMin * 10) / 10} kW
                          </span>
                        </div>
                        {step6Data.heatingGaps.length === 0 ? (
                          <p className="text-[11px] text-slate-500 italic py-2">No heating utility gaps required.</p>
                        ) : (
                          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                            {step6Data.heatingGaps.map((gap, idx) => (
                              <div key={idx} className="flex justify-between items-center bg-slate-950/40 border border-slate-900 rounded-lg p-2 text-xs font-mono">
                                <div className="flex flex-col">
                                  <span className="text-[9px] text-slate-500 uppercase">Temp</span>
                                  <span className="text-slate-200 font-semibold">{gap.t}°C</span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-[9px] text-slate-500 uppercase">Power</span>
                                  <span className="text-red-400 font-bold">{gap.q} kW</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {step6Data.heatingGaps.length > 0 && (
                        <div className="flex justify-between items-center border-t border-slate-800/50 pt-2 text-xs font-bold text-red-400">
                          <span>Sum of Gaps:</span>
                          <span className="font-mono">
                            {Math.round(step6Data.heatingGaps.reduce((acc, curr) => acc + curr.q, 0) * 10) / 10} kW
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Cooling Gaps Breakdown */}
                    <div className="bg-slate-900/20 border border-slate-850 rounded-xl p-4 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2">
                          <h4 className="font-semibold text-xs text-blue-400 uppercase tracking-wider">Cooling Gaps (Q_C)</h4>
                          <span className="text-[10px] font-bold text-slate-400 font-mono">
                            Target: {Math.round(results.qcMin * 10) / 10} kW
                          </span>
                        </div>
                        {step6Data.coolingGaps.length === 0 ? (
                          <p className="text-[11px] text-slate-500 italic py-2">No cooling utility gaps required.</p>
                        ) : (
                          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                            {step6Data.coolingGaps.map((gap, idx) => (
                              <div key={idx} className="flex justify-between items-center bg-slate-950/40 border border-slate-900 rounded-lg p-2 text-xs font-mono">
                                <div className="flex flex-col">
                                  <span className="text-[9px] text-slate-500 uppercase">Temp</span>
                                  <span className="text-slate-200 font-semibold">{gap.t}°C</span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-[9px] text-slate-500 uppercase">Power</span>
                                  <span className="text-blue-400 font-bold">{gap.q} kW</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {step6Data.coolingGaps.length > 0 && (
                        <div className="flex justify-between items-center border-t border-slate-800/50 pt-2 text-xs font-bold text-blue-400">
                          <span>Sum of Gaps:</span>
                          <span className="font-mono">
                            {Math.round(step6Data.coolingGaps.reduce((acc, curr) => acc + curr.q, 0) * 10) / 10} kW
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 7: Heat Pump Integration */}
              {activeStep === 6 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">
                    Integrate a closed-cycle heat pump onto the Grand Composite Curve. 
                    The heat pump evaporator absorbs heat from the process hot streams (below the pinch), and the condenser releases heat to the cold streams (above the pinch).
                  </p>

                  {/* HP Sliders Card */}
                  <div className="bg-slate-900/30 border border-slate-850 p-4 rounded-xl space-y-4">
                    <h4 className="font-bold text-xs text-cyan-400 uppercase tracking-wider flex items-center space-x-1">
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Heat Pump Design Parameters</span>
                    </h4>

                    {/* Heating Capacity */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">HP Heating Capacity (Q_cond)</span>
                        <span className="text-white font-mono font-bold">{hpCapacity} kW</span>
                      </div>
                      <input 
                        type="range"
                        min="0"
                        max={Math.max(Math.round(results.qhMin * 10) / 10, 10)}
                        step="1"
                        value={hpCapacity}
                        onChange={(e) => setHpCapacity(Number(e.target.value))}
                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                      <span className="text-[10px] text-slate-500 block font-medium">Maximum capacity capped at target heating utility target ({Math.round(results.qhMin * 10) / 10} kW).</span>
                    </div>

                    {/* Condenser Glide */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Condenser Delta T (Glide)</span>
                        <span className="text-white font-mono font-bold">{hpCondGlide}°C</span>
                      </div>
                      <input 
                        type="range"
                        min="5"
                        max="30"
                        step="1"
                        value={hpCondGlide}
                        onChange={(e) => setHpCondGlide(Number(e.target.value))}
                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Evaporator Glide */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Evaporator Delta T (Glide)</span>
                        <span className="text-white font-mono font-bold">{hpEvapGlide}°C</span>
                      </div>
                      <input 
                        type="range"
                        min="5"
                        max="30"
                        step="1"
                        value={hpEvapGlide}
                        onChange={(e) => setHpEvapGlide(Number(e.target.value))}
                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>
                  </div>

                  {/* HP Input Boxes (Economic & Carnot Parameters) */}
                  <div className="bg-slate-900/30 border border-slate-850 p-4 rounded-xl space-y-3">
                    <h4 className="font-bold text-xs text-cyan-400 uppercase tracking-wider flex items-center space-x-1.5">
                      <span>💰 Economic & Efficiency Inputs</span>
                    </h4>
                    <div className="grid grid-cols-3 gap-3 text-[11px]">
                      <div>
                        <label className="block text-slate-500 mb-1">Gas Price (€/MWh)</label>
                        <input 
                          type="number"
                          value={gasPrice}
                          min="0"
                          step="5"
                          onChange={(e) => setGasPrice(Math.max(0, Number(e.target.value)))}
                          className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white w-full focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 mb-1">Electricity Price (€/MWh)</label>
                        <input 
                          type="number"
                          value={electricityPrice}
                          min="0"
                          step="10"
                          onChange={(e) => setElectricityPrice(Math.max(0, Number(e.target.value)))}
                          className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white w-full focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 mb-1">Carnot Efficiency (%)</label>
                        <input 
                          type="number"
                          value={Math.round(carnotEfficiency * 100)}
                          min="10"
                          max="95"
                          step="5"
                          onChange={(e) => setCarnotEfficiency(Math.min(95, Math.max(10, Number(e.target.value))) / 100)}
                          className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white w-full focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
                        />
                      </div>
                    </div>
                  </div>

                  {/* HP Summary Cards */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-900/20 border border-slate-800 rounded-xl p-3 space-y-1 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider block">Heat Pump Performance</span>
                        <div className="space-y-0.5 font-mono text-[11px] text-slate-350 mt-1">
                          <div className="flex justify-between">
                            <span>COP:</span>
                            <span className="font-bold text-cyan-400">{hpData.cop}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span>Carnot COP:</span>
                            <span>{hpData.carnotCop}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Compressor Power:</span>
                            <span className="text-white font-bold">{hpData.compressorPower} kW</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Evaporator Cooling:</span>
                            <span className="text-blue-400 font-bold">{hpData.qEvap} kW</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900/20 border border-slate-800 rounded-xl p-3 space-y-1 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider block">Operating Cost Savings</span>
                        <div className="space-y-0.5 font-mono text-[11px] text-slate-350 mt-1">
                          <div className="flex justify-between">
                            <span>Hourly Savings:</span>
                            <span className={`font-bold ${hpData.hourlySavings >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {hpData.hourlySavings >= 0 ? '+' : ''}{hpData.hourlySavings} €/h
                            </span>
                          </div>
                          <div className="flex justify-between mt-1 pt-1 border-t border-slate-800/60">
                            <span>Annual Savings:</span>
                            <span className={`font-bold text-sm ${hpData.annualSavings >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {hpData.annualSavings >= 0 ? '+' : ''}{hpData.annualSavings.toLocaleString()} €/yr
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[9px] text-slate-500 block text-right mt-1">(Assuming 8,000 h/yr)</span>
                    </div>
                  </div>

                  {/* Glide Temperature Info */}
                  <div className="bg-slate-950 border border-slate-900 rounded-xl p-3 text-[11px] font-mono text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>Condenser Temp:</span>
                      <span className="text-slate-200">{hpData.tCondIn}°C → {hpData.tCondOut}°C</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Evaporator Temp:</span>
                      <span className="text-slate-200">{hpData.tEvapIn}°C → {hpData.tEvapOut}°C</span>
                    </div>
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
            
            {/* Unified Chart for All Steps: Stable frame with transition animations */}
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 flex flex-col flex-1">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-sm text-slate-200">
                    {activeStep === 0 
                      ? "Individual Process Streams" 
                      : activeStep === 1 
                        ? "Unshifted Composite Curves" 
                        : activeStep === 2
                          ? "Composite Curves (T-H Diagram)"
                          : activeStep === 3
                            ? "Interval Shifts (Shifted T-H Diagram)"
                            : activeStep === 5
                              ? gccTransitionProgress === 0
                                ? "Balanced Composite Curves (T-H Diagram)"
                                : "Returning to Composite Curves"
                              : activeStep === 6
                                ? "Heat Pump Integration (Shifted GCC)"
                                : gccTransitionProgress === 1
                                  ? "Grand Composite Curve (Shifted T vs H)"
                                  : "Transitioning to Grand Composite Curve"
                    }
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    {activeStep === 0 
                      ? "Plot of each stream starting at 0 kW enthalpy" 
                      : activeStep === 1 
                        ? "Hot and Cold composite profiles starting at 0 kW" 
                        : activeStep === 2
                          ? "Plot of temperature vs cumulative enthalpy"
                          : activeStep === 3
                            ? "Hot shifted down and cold shifted up by ΔTmin/2"
                            : activeStep === 5
                              ? gccTransitionProgress === 0
                                ? "Hot/Cold composites with horizontal gaps representing heat deficits/surpluses"
                                : "Transitioning back to composite view..."
                              : activeStep === 6
                                ? "Utility-side temperatures (shifted by ±ΔTmin/2) showing HP placement"
                                : gccTransitionProgress === 1
                                  ? "Net heat flow cascade profile. Zero point is the Pinch."
                                  : "Aligning horizontal intervals to zero enthalpy..."
                    }
                  </p>
                </div>
                <div className="flex items-center space-x-3 text-[10px] font-mono">
                  {activeStep === 6 ? (
                    <div className="flex items-center space-x-3 flex-wrap gap-y-1 justify-end">
                      <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono px-2 py-0.5 rounded">
                        Pinch: {results.pinchTempShifted}°C
                      </span>
                      <span className="flex items-center space-x-1">
                        <span className="w-2.5 h-0.5 bg-blue-500 inline-block"></span>
                        <span className="text-slate-400">Cold GCC (+ΔTmin/2)</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <span className="w-2.5 h-0.5 bg-red-500 inline-block"></span>
                        <span className="text-slate-400">Hot GCC (-ΔTmin/2)</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <span className="w-2.5 h-1 bg-red-500 inline-block"></span>
                        <span className="text-red-400 font-bold">Condenser</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <span className="w-2.5 h-1 bg-blue-500 inline-block"></span>
                        <span className="text-blue-400 font-bold">Evaporator</span>
                      </span>
                    </div>
                  ) : activeStep === 4 && gccTransitionProgress === 1 ? (
                    <div className="flex items-center space-x-3">
                      <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono px-2 py-0.5 rounded">
                        Pinch: {results.pinchTempShifted}°C
                      </span>
                      <span className="flex items-center space-x-1">
                        <span className="w-2.5 h-0.5 bg-blue-500 inline-block"></span>
                        <span className="text-slate-400">Above Pinch</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <span className="w-2.5 h-0.5 bg-red-500 inline-block"></span>
                        <span className="text-slate-400">Below Pinch</span>
                      </span>
                    </div>
                  ) : activeStep === 5 && gccTransitionProgress === 0 ? (
                    <div className="flex items-center space-x-3">
                      <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono px-2 py-0.5 rounded">
                        Pinch: {results.pinchTempShifted}°C
                      </span>
                      <span className="flex items-center space-x-1">
                        <span className="w-2.5 h-0.5 bg-red-500 inline-block"></span>
                        <span className="text-slate-400">Hot Composite</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <span className="w-2.5 h-0.5 bg-blue-500 inline-block"></span>
                        <span className="text-slate-400">Cold Streams (Sliced)</span>
                      </span>
                    </div>
                  ) : activeStep === 0 ? (
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
                      margin={{ top: 10, right: activeStep === 6 ? 15 : 10, left: -20, bottom: 5 }}
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
                        yAxisId="left"
                        type="number" 
                        domain={tempDomain}
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        stroke="#334155"
                        unit="°C"
                      />
                      {activeStep === 6 && (
                        <YAxis 
                          yAxisId="right"
                          orientation="right"
                          type="number" 
                          domain={['auto', 'auto']}
                          tick={{ fill: '#4ade80', fontSize: 10 }}
                          stroke="#22c55e"
                          unit=" €/h"
                        />
                      )}
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || label === undefined || label === null) return null;
                          
                          // Custom tooltip for Step 7 showing all interpolated curve values
                          if (activeStep === 6) {
                            const hVal = Number(label);
                            const tColdGcc = interpolateT(hpData.plottedGccAbove, hVal, true);
                            const tHotGcc = interpolateT(hpData.plottedGccBelow, hVal, false);
                            
                            const showCondenser = hVal >= -1e-5 && hVal <= hpCapacity + 1e-5;
                            const tCondenser = showCondenser 
                              ? hpData.tCondIn + (hpCapacity > 1e-5 ? (hVal / hpCapacity) * hpCondGlide : 0)
                              : null;
                              
                            const showEvaporator = hVal >= -1e-5 && hVal <= hpData.qEvap + 1e-5;
                            const tEvaporator = showEvaporator
                              ? hpData.tEvapIn - (hpData.qEvap > 1e-5 ? (hVal / hpData.qEvap) * hpEvapGlide : 0)
                              : null;

                            const res = calculateSavingsForCapacity(hVal);
                            
                            return (
                              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 shadow-2xl text-xs font-mono space-y-2">
                                <div className="text-slate-500 font-bold border-b border-slate-900 pb-1 flex justify-between items-center">
                                  <span>Enthalpy (H):</span>
                                  <span className="text-white">{Math.round(hVal * 10) / 10} kW</span>
                                </div>
                                <div className="space-y-1">
                                  {tColdGcc !== undefined && (
                                    <div className="flex justify-between space-x-6">
                                      <span className="text-blue-400">Cold GCC (+ΔTmin/2):</span>
                                      <span className="text-white font-bold">{Math.round(tColdGcc * 10) / 10}°C</span>
                                    </div>
                                  )}
                                  {tHotGcc !== undefined && (
                                    <div className="flex justify-between space-x-6">
                                      <span className="text-red-400">Hot GCC (-ΔTmin/2):</span>
                                      <span className="text-white font-bold">{Math.round(tHotGcc * 10) / 10}°C</span>
                                    </div>
                                  )}
                                  {tCondenser !== null && (
                                    <div className="flex justify-between space-x-6">
                                      <span className="text-red-500 font-semibold">Condenser:</span>
                                      <span className="text-white font-bold">{Math.round(tCondenser * 10) / 10}°C</span>
                                    </div>
                                  )}
                                  {tEvaporator !== null && (
                                    <div className="flex justify-between space-x-6">
                                      <span className="text-blue-500 font-semibold">Evaporator:</span>
                                      <span className="text-white font-bold">{Math.round(tEvaporator * 10) / 10}°C</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between space-x-6 border-t border-slate-900 pt-1 mt-1">
                                    <span className="text-green-400">Savings at this capacity:</span>
                                    <span className="text-white font-bold">{res.savings.toFixed(2)} €/h</span>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          
                          // Default tooltip layout for other steps
                          return (
                            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 shadow-2xl text-xs space-y-1.5">
                              <div className="text-slate-500 font-mono font-semibold border-b border-slate-900 pb-1">
                                Enthalpy: {Math.round(Number(label) * 10) / 10} kW
                              </div>
                              {payload && payload.map((p: any, idx: number) => {
                                let name = p.name;
                                let val = p.value;
                                if (activeStep === 0) {
                                  const stream = streams.find(s => s.name === name || s.id === p.dataKey);
                                  name = stream ? `${stream.name} (${stream.type === 'hot' ? 'Hot' : 'Cold'})` : String(name);
                                }
                                return (
                                  <div key={idx} className="flex justify-between space-x-6 text-slate-200">
                                    <span style={{ color: p.stroke }}>{name}:</span>
                                    <span className="font-mono font-bold">{val}°C</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }}
                      />
                      
                      {/* Hot Composite Curve (Fades out when transitioning to GCC, or hidden in Step 6 & 7) */}
                      {activeStep >= 1 && activeStep <= 4 && !(activeStep === 5 && gccTransitionProgress === 0) && (
                        <Line 
                          yAxisId="left"
                          data={hotCompositeData}
                          type="linear" 
                          dataKey="t" 
                          name="Hot Composite"
                          stroke="#ef4444" 
                          strokeWidth={3}
                          strokeOpacity={
                            activeStep >= 3 
                              ? (1 - gccTransitionProgress) 
                              : transitionProgress
                          }
                          dot={false}
                          activeDot={activeStep >= 1 && activeStep <= 3 ? { r: 4 } : false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      )}

                      {/* Cold Composite Curve / Transitioning GCC (Blue curve, hidden when split GCC is shown, and in Step 6 & 7) */}
                      {activeStep < 6 && !(activeStep === 4 && gccTransitionProgress === 1) && !(activeStep === 5 && gccTransitionProgress === 0) && (
                        <Line 
                          yAxisId="left"
                          data={unifiedColdData}
                          type="linear" 
                          dataKey="t" 
                          name="Cold Composite"
                          stroke="#3b82f6" 
                          strokeWidth={3}
                          strokeOpacity={activeStep >= 1 ? transitionProgress : 0}
                          dot={false}
                          activeDot={activeStep >= 1 && activeStep <= 3 ? { r: 4 } : false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      )}

                      {/* Step 6: Faint Hot Composite Reference Line */}
                      {activeStep === 5 && gccTransitionProgress === 0 && (
                        <Line 
                          yAxisId="left"
                          data={step6FaintHot}
                          type="linear" 
                          dataKey="t" 
                          name="Hot Composite Reference"
                          stroke="#ef4444" 
                          strokeWidth={3}
                          strokeOpacity={0.15}
                          dot={false}
                          activeDot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      )}

                      {/* Step 6: Faint Cold Composite Reference Line */}
                      {activeStep === 5 && gccTransitionProgress === 0 && (
                        <Line 
                          yAxisId="left"
                          data={step6FaintCold}
                          type="linear" 
                          dataKey="t" 
                          name="Cold Composite Reference"
                          stroke="#3b82f6" 
                          strokeWidth={3}
                          strokeOpacity={0.15}
                          dot={false}
                          activeDot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      )}

                      {/* Step 6: Steady Cold Curve (Above Pinch) */}
                      {activeStep === 5 && gccTransitionProgress === 0 && (
                        <Line 
                          yAxisId="left"
                          data={step6Data.coldAbovePinchSteady}
                          type="linear" 
                          dataKey="t" 
                          name="Cold Composite (Above Pinch)"
                          stroke="#3b82f6" 
                          strokeWidth={3}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls
                          isAnimationActive={false}
                        />
                      )}

                      {/* Step 6: Steady Hot Curve (Below Pinch) */}
                      {activeStep === 5 && gccTransitionProgress === 0 && (
                        <Line 
                          yAxisId="left"
                          data={step6Data.hotBelowPinchSteady}
                          type="linear" 
                          dataKey="t" 
                          name="Hot Composite (Below Pinch)"
                          stroke="#ef4444" 
                          strokeWidth={3}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls
                          isAnimationActive={false}
                        />
                      )}

                      {/* Step 6: Sliced & Shifted Hot Composite segments (Above Pinch) */}
                      {activeStep === 5 && gccTransitionProgress === 0 && step6Data.hotSegmentsAbove.map((seg) => (
                        <Line 
                          key={seg.key}
                          yAxisId="left"
                          data={seg.data}
                          type="linear" 
                          dataKey="t" 
                          name="Hot Composite"
                          stroke="#ef4444" 
                          strokeWidth={3.5}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls
                          isAnimationActive={false}
                        />
                      ))}

                      {/* Step 6: Sliced & Shifted Cold Composite segments (Below Pinch) */}
                      {activeStep === 5 && gccTransitionProgress === 0 && step6Data.coldSegmentsBelow.map((seg) => (
                        <Line 
                          key={seg.key}
                          yAxisId="left"
                          data={seg.data}
                          type="linear" 
                          dataKey="t" 
                          name="Cold Composite"
                          stroke="#3b82f6" 
                          strokeWidth={3.5}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls
                          isAnimationActive={false}
                        />
                      ))}

                      {/* Split GCC Curves: Blue above Pinch, Red below Pinch (Shown only when transition is complete) */}
                      {activeStep === 4 && gccTransitionProgress === 1 && (
                        <>
                          <Line 
                            yAxisId="left"
                            data={gccAbovePinch}
                            type="linear" 
                            dataKey="tShifted" 
                            name="GCC (Above Pinch)"
                            stroke="#3b82f6" 
                            strokeWidth={2.5}
                            dot={{ r: 3, stroke: '#1d4ed8', strokeWidth: 1 }}
                            activeDot={{ r: 5 }}
                            connectNulls
                            isAnimationActive={false}
                          />
                          <Line 
                            yAxisId="left"
                            data={gccBelowPinch}
                            type="linear" 
                            dataKey="tShifted" 
                            name="GCC (Below Pinch)"
                            stroke="#ef4444" 
                            strokeWidth={2.5}
                            dot={{ r: 3, stroke: '#b91c1c', strokeWidth: 1 }}
                            activeDot={{ r: 5 }}
                            connectNulls
                            isAnimationActive={false}
                          />
                        </>
                      )}

                      {/* Step 7 Heat Pump Integration curves */}
                      {activeStep === 6 && (
                        <>
                          {/* Shifted GCC Above Pinch (Utility Cold Boundary, Blue) */}
                          <Line 
                            yAxisId="left"
                            data={hpData.plottedGccAbove}
                            type="linear" 
                            dataKey="t" 
                            name="Cold GCC (Utility boundary)"
                            stroke="#3b82f6" 
                            strokeWidth={2.5}
                            dot={{ r: 3, stroke: '#1d4ed8', strokeWidth: 1 }}
                            activeDot={{ r: 5 }}
                            connectNulls
                            isAnimationActive={false}
                          />

                          {/* Shifted GCC Below Pinch (Utility Hot Boundary, Red) */}
                          <Line 
                            yAxisId="left"
                            data={hpData.plottedGccBelow}
                            type="linear" 
                            dataKey="t" 
                            name="Hot GCC (Utility boundary)"
                            stroke="#ef4444" 
                            strokeWidth={2.5}
                            dot={{ r: 3, stroke: '#b91c1c', strokeWidth: 1 }}
                            activeDot={{ r: 5 }}
                            connectNulls
                            isAnimationActive={false}
                          />

                          {/* HP Condenser Heating Line (Red, thick) */}
                          <Line 
                            yAxisId="left"
                            data={[
                              { h: 0, t: hpData.tCondIn },
                              { h: hpCapacity, t: hpData.tCondOut }
                            ]}
                            type="linear" 
                            dataKey="t" 
                            name="Condenser (Heating)"
                            stroke="#dc2626" 
                            strokeWidth={4.5}
                            dot={{ r: 4, stroke: '#991b1b', strokeWidth: 1.5 }}
                            activeDot={{ r: 6 }}
                            connectNulls
                            isAnimationActive={false}
                          />

                          {/* HP Evaporator Cooling Line (Blue, thick) */}
                          <Line 
                            yAxisId="left"
                            data={[
                              { h: 0, t: hpData.tEvapIn },
                              { h: hpData.qEvap, t: hpData.tEvapOut }
                            ]}
                            type="linear" 
                            dataKey="t" 
                            name="Evaporator (Cooling)"
                            stroke="#2563eb" 
                            strokeWidth={4.5}
                            dot={{ r: 4, stroke: '#1e40af', strokeWidth: 1.5 }}
                            activeDot={{ r: 6 }}
                            connectNulls
                            isAnimationActive={false}
                          />

                          {/* Hourly Savings Curve (Green, plotted on right axis) */}
                          <Line 
                            yAxisId="right"
                            data={savingsCurveData}
                            type="monotone" 
                            dataKey="savings" 
                            name="Hourly Savings"
                            stroke="#22c55e" 
                            strokeWidth={2.5}
                            dot={false}
                            activeDot={{ r: 4 }}
                            connectNulls
                            isAnimationActive={false}
                          />
                        </>
                      )}

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
                            yAxisId="left"
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
                      
                      {/* Step 3 Horizontal Utility Lines (only in Step 3, not in Step 6 as gaps represent utilities) */}
                      {activeStep === 2 && tColdMin !== undefined && results.qcMin > 0 && (
                        <ReferenceLine 
                          yAxisId="left"
                          segment={[{ x: 0, y: tColdMin }, { x: results.qcMin, y: tColdMin }]}
                          stroke="#3b82f6" 
                          strokeDasharray="4 4"
                          strokeWidth={2}
                          label={{ 
                            value: `Q_C = ${Math.round(results.qcMin * 10) / 10} kW`, 
                            fill: '#3b82f6', 
                            fontSize: 10, 
                            position: 'top',
                            offset: 4
                          }}
                        />
                      )}
                      {activeStep === 2 && tColdMax !== undefined && hHotMax !== undefined && hColdMax !== undefined && results.qhMin > 0 && (
                        <ReferenceLine 
                          yAxisId="left"
                          segment={[{ x: hHotMax, y: tColdMax }, { x: hColdMax, y: tColdMax }]}
                          stroke="#ef4444" 
                          strokeDasharray="4 4"
                          strokeWidth={2}
                          label={{ 
                            value: `Q_H = ${Math.round(results.qhMin * 10) / 10} kW`, 
                            fill: '#ef4444', 
                            fontSize: 10, 
                            position: 'top',
                            offset: 4
                          }}
                        />
                      )}

                      {/* Step 4 & 5 Transitioning Horizontal Interval Lines (hidden in Step 6) */}
                      {(activeStep === 3 || activeStep === 4) && results.shiftedTemps.map((tVal, idx) => {
                        const tHotUnshifted = tVal + dTmin / 2;
                        const tColdUnshifted = tVal - dTmin / 2;
                        const x1 = interpolateH(results.hotComposite, tHotUnshifted);
                        const x2 = interpolateH(results.coldCompositeRaw, tColdUnshifted) + results.qcMin;
                        
                        // Slide starting coordinate from x1 (at p=0) to 0 (at p=1)
                        const xStart = (1 - gccTransitionProgress) * x1;
                        // Slide ending coordinate from x2 (at p=0) to x2 - x1 (at p=1)
                        const xEnd = x2 - gccTransitionProgress * x1;

                        const isUppermost = idx === 0;
                        const isBottommost = idx === results.shiftedTemps.length - 1;
                        const isTransitionComplete = activeStep === 4 && gccTransitionProgress === 1;

                        let strokeColor = "#f59e0b"; // orange
                        let labelObj = undefined;

                        if (isTransitionComplete) {
                          if (isUppermost && results.qhMin > 0) {
                            strokeColor = "#ef4444"; // red
                            labelObj = {
                              value: `${Math.round(results.qhMin * 10) / 10} kW`,
                              fill: "#ef4444",
                              fontSize: 10,
                              position: "top",
                              offset: 4
                            };
                          } else if (isBottommost && results.qcMin > 0) {
                            strokeColor = "#3b82f6"; // blue
                            labelObj = {
                              value: `${Math.round(results.qcMin * 10) / 10} kW`,
                              fill: "#3b82f6",
                              fontSize: 10,
                              position: "top",
                              offset: 4
                            };
                          }
                        }

                        return (
                          <ReferenceLine 
                            key={`interval-line-${idx}`}
                            yAxisId="left"
                            segment={[
                              { x: xStart, y: tVal + (1 - tempShiftProgress) * (dTmin / 2) },
                              { x: xEnd, y: tVal - (1 - tempShiftProgress) * (dTmin / 2) }
                            ]}
                            stroke={strokeColor}
                            strokeDasharray="3 3"
                            strokeWidth={2} // thicker
                            opacity={tempShiftProgress * 0.6}
                            label={labelObj}
                          />
                        );
                      })}

                      {/* Step 6 Heating Gaps (Horizontal Gaps in Chart) */}
                      {activeStep === 5 && gccTransitionProgress === 0 && step6Data.heatingGaps.map((gap, idx) => (
                        <ReferenceLine 
                          key={`heating-gap-line-${idx}`}
                          yAxisId="left"
                          segment={[
                            { x: gap.hStart, y: gap.t },
                            { x: gap.hEnd, y: gap.t }
                          ]}
                          stroke="#ef4444"
                          strokeDasharray="4 4"
                          strokeWidth={2}
                          opacity={gap.opacity}
                          label={{ 
                            value: `${gap.q} kW @ ${gap.t}°C`, 
                            fill: '#ef4444', 
                            fontSize: 10, 
                            position: 'top',
                            offset: 4
                          }}
                        />
                      ))}

                      {/* Step 6 Cooling Gaps (Horizontal Gaps in Chart) */}
                      {activeStep === 5 && gccTransitionProgress === 0 && step6Data.coolingGaps.map((gap, idx) => (
                        <ReferenceLine 
                          key={`cooling-gap-line-${idx}`}
                          yAxisId="left"
                          segment={[
                            { x: gap.hStart, y: gap.t },
                            { x: gap.hEnd, y: gap.t }
                          ]}
                          stroke="#3b82f6"
                          strokeDasharray="4 4"
                          strokeWidth={2}
                          opacity={gap.opacity}
                          label={{ 
                            value: `${gap.q} kW @ ${gap.t}°C`, 
                            fill: '#3b82f6', 
                            fontSize: 10, 
                            position: 'top',
                            offset: 4
                          }}
                        />
                      ))}

                      {/* Reference line and dots at closest approach (Step 3 & Step 6 only, shifted appropriately in Step 6) */}
                      {(activeStep === 2 || (activeStep === 5 && gccTransitionProgress === 0)) && closestApproach.hClosest !== undefined && (
                        <>
                          <ReferenceLine 
                            yAxisId="left"
                            segment={
                              activeStep === 5 && gccTransitionProgress === 0
                                ? [
                                    { x: step6Data.pinchH, y: results.pinchTempShifted - step6TransitionFactors.fVert * (dTmin / 2) },
                                    { x: step6Data.pinchH, y: results.pinchTempShifted + step6TransitionFactors.fVert * (dTmin / 2) }
                                  ]
                                : [
                                    { x: closestApproach.hClosest, y: closestApproach.tColdClosest },
                                    { x: closestApproach.hClosest, y: closestApproach.tHotClosest }
                                  ]
                            }
                            stroke="#f59e0b" 
                            strokeDasharray="4 4" 
                            strokeWidth={2}
                            label={{ 
                              value: `Actual ΔTmin = ${closestApproach.actualDTmin}°C`, 
                              fill: '#f59e0b', 
                              fontSize: 10, 
                              position: 'insideRight',
                              offset: 8
                            }}
                          />
                          <ReferenceDot 
                            yAxisId="left"
                            x={activeStep === 5 && gccTransitionProgress === 0 ? step6Data.pinchH : closestApproach.hClosest} 
                            y={activeStep === 5 && gccTransitionProgress === 0 ? results.pinchTempShifted + step6TransitionFactors.fVert * (dTmin / 2) : closestApproach.tHotClosest} 
                            r={4.5} 
                            fill="#ef4444" 
                            stroke="#f59e0b" 
                            strokeWidth={1.5}
                          />
                          <ReferenceDot 
                            yAxisId="left"
                            x={activeStep === 5 && gccTransitionProgress === 0 ? step6Data.pinchH : closestApproach.hClosest} 
                            y={activeStep === 5 && gccTransitionProgress === 0 ? results.pinchTempShifted - step6TransitionFactors.fVert * (dTmin / 2) : closestApproach.tColdClosest} 
                            r={4.5} 
                            fill="#3b82f6" 
                            stroke="#f59e0b" 
                            strokeWidth={1.5}
                          />
                        </>
                      )}

                      {/* Reference lines for the Pinch temperature (Step 5 only, fades in) */}
                      {activeStep === 4 && !isNaN(results.pinchTempShifted) && (
                        <ReferenceLine 
                          yAxisId="left"
                          y={results.pinchTempShifted} 
                          stroke="#f59e0b" 
                          strokeDasharray="4 4" 
                          strokeWidth={1.5}
                          opacity={gccTransitionProgress}
                        />
                      )}

                      {/* Highlight hot and cold utility points (Step 5 only, fades in) */}
                      {activeStep === 4 && results.shiftedTemps.length > 0 && !isNaN(results.shiftedTemps[0]) && (
                        <ReferenceDot 
                          yAxisId="left"
                          x={results.qhMin} 
                          y={results.shiftedTemps[0]} 
                          r={5} 
                          fill="#ef4444" 
                          stroke="white" 
                          opacity={gccTransitionProgress}
                        />
                      )}
                      {activeStep === 4 && results.shiftedTemps.length > 0 && !isNaN(results.shiftedTemps[results.shiftedTemps.length - 1]) && (
                        <ReferenceDot 
                          yAxisId="left"
                          x={results.qcMin} 
                          y={results.shiftedTemps[results.shiftedTemps.length - 1]} 
                          r={5} 
                          fill="#3b82f6" 
                          stroke="white" 
                          opacity={gccTransitionProgress}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
