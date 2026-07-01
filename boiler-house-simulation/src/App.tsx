import React, { useState, useMemo } from 'react';
import { BoilerhouseSVG } from './components/BoilerhouseSVG';

interface ClampedNumericInputProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: string | number;
  defaultValue?: number;
}

const ClampedNumericInput: React.FC<ClampedNumericInputProps> = ({
  value,
  onChange,
  min,
  max,
  step = "any",
  defaultValue = 0
}) => {
  const [localVal, setLocalVal] = React.useState<string>(value.toString());

  React.useEffect(() => {
    // Sync local state if parent value changes (not active typing)
    if (document.activeElement !== inputRef.current) {
      setLocalVal(value.toString());
    }
  }, [value]);

  const inputRef = React.useRef<HTMLInputElement>(null);

  const commitValue = () => {
    let num = parseFloat(localVal);
    
    if (isNaN(num)) {
      num = defaultValue !== undefined ? defaultValue : (min !== undefined ? min : 0);
    }
    
    if (min !== undefined && num < min) num = min;
    if (max !== undefined && num > max) num = max;
    
    onChange(num);
    setLocalVal(num.toString());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitValue();
      inputRef.current?.blur();
    }
  };

  return (
    <input
      ref={inputRef}
      type="number"
      step={step}
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={commitValue}
      onKeyDown={handleKeyDown}
    />
  );
};


// Antoine equation for water saturation temperature (valid up to critical point)
function satTempFromP(barg: number): number {
  const bara = barg + 1.013;
  const lnP = Math.log(bara);
  const T_kelvin = 3816.44 / (11.6834 - lnP) + 46.13;
  return T_kelvin - 273.15;
}

function satEnthalpyLiquid(tsat: number): number {
  return 4.187 * tsat;
}

function latentHeat(tsat: number): number {
  return 2501 - 2.37 * tsat;
}

function satEnthalpyVapour(tsat: number): number {
  return satEnthalpyLiquid(tsat) + latentHeat(tsat);
}

function enthalpyLiquid(T: number): number {
  return 4.187 * T;
}

function excessAirFromO2(o2pct: number): number {
  return (o2pct / (20.9 - o2pct)) * 100 * 1.11;
}

function flueGasLossPct(tFlue: number, tAir: number, o2pct: number): number {
  const A1 = 0.37;
  const B = -0.009;
  return (A1 / (21 - o2pct) + B) * (tFlue - tAir);
}

interface SimulationState {
  // Fuel & Combustion
  gasFlowRate: number;       // Nm³/h
  gasInputMode: 'volume' | 'lhv' | 'hhv';
  gasInputValue: number;     // value in LHV or HHV depending on mode
  gasLHV: number;            // kWh/Nm³
  gasHHV: number;            // kWh/Nm³
  airTempIn: number;         // °C
  o2Flue: number;            // % dry
  flueGasTemp: number;       // °C boiler exit

  // Boiler drum
  drumPressure: number;      // bar(g)
  boilerConductivity: number; // µS/cm limit
  bdMode: 'manual' | 'auto';
  bdFlowManual: number;      // % steam flow
  radLossPct: number;        // % fuel LHV

  // Economizer
  ecoEnabled: boolean;
  ecoFlueTempOut: number;    // °C eco exit

  // Deaerator
  daeaPressure: number;      // bar(g)
  daeaConductivity: number;   // µS/cm limit (or reference)

  // External network
  steamFlowUsers: number;    // kg/h net steam
  condFlowAuto: boolean;     // if auto, condFlow = steamFlow * condPct
  condPctManual: number;     // % cond return
  condReturnFlowManual: number; // kg/h manual
  condReturnTemp: number;    // °C
  condConductivity: number;  // µS/cm

  // Makeup
  makeupTemp: number;        // °C
  makeupConductivity: number; // µS/cm
}

const DEFAULT_STATE: SimulationState = {
  gasFlowRate: 100,
  gasInputMode: 'volume',
  gasInputValue: 100,
  gasLHV: 10.35,
  gasHHV: 11.63,
  airTempIn: 20,
  o2Flue: 3.5,
  flueGasTemp: 180,
  drumPressure: 10.0,
  boilerConductivity: 2000,
  bdMode: 'auto',
  bdFlowManual: 0.5,
  radLossPct: 1.5,
  ecoEnabled: false,
  ecoFlueTempOut: 130,
  daeaPressure: 0.2,
  daeaConductivity: 20,
  steamFlowUsers: 1000,
  condFlowAuto: true,
  condPctManual: 70,
  condReturnFlowManual: 700,
  condReturnTemp: 80,
  condConductivity: 20,
  makeupTemp: 15,
  makeupConductivity: 300,
};



export default function App() {
  const [S, setS] = useState<SimulationState>(DEFAULT_STATE);
  const [popupKey, setPopupKey] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isAnimationEnabled, setIsAnimationEnabled] = useState<boolean>(true);
  const [leadingVariable, setLeadingVariable] = useState<'gas' | 'steam'>('steam');
  

  // Calculation Engine
  const R = useMemo(() => {
    // 1. Drum saturated states
    const tSat = satTempFromP(S.drumPressure);
    const hSteam = satEnthalpyVapour(tSat);
    const hLiqSat = satEnthalpyLiquid(tSat);

    // 2. Deaerator saturated states
    const tDaea = satTempFromP(S.daeaPressure);
    const hFW_daea = enthalpyLiquid(tDaea);
    const hPeggingSteam = hSteam;

    // 3. Enthalpies of incoming streams
    const hCond = enthalpyLiquid(S.condReturnTemp);
    const hMakeup = enthalpyLiquid(S.makeupTemp);

    const H_A = hFW_daea - hMakeup;
    const H_B = hPeggingSteam - hMakeup;
    const H_D = hSteam - hFW_daea;
    const H_E = hLiqSat - hFW_daea;

    // 4. Combustion & stack efficiency (independent of causal direction)
    const ecoFlueTempOutClamped = S.ecoEnabled ? Math.max(tDaea, S.ecoFlueTempOut) : S.flueGasTemp;
    const flueTempEff = ecoFlueTempOutClamped;
    const flueLossPct = flueGasLossPct(flueTempEff, S.airTempIn, S.o2Flue);
    const radLossPct = S.radLossPct;
    const combustEff = Math.max(0, 100 - flueLossPct - radLossPct);

    // Declare variables to solve
    let usersSteamFlow = 0;
    let peggingSteamFlow = 0;
    let boilerSteamFlow = 0;
    let mBlowdown = 0;
    let fwFlow = 0;
    let condFlow = 0;
    let makeupFlow = 0;
    let x_bd = 0;

    let gasFlowRate = S.gasFlowRate;
    let gasPowerLHV = S.gasInputValue;
    let gasPowerHHV = S.gasInputValue;

    if (leadingVariable === 'steam') {
      // -----------------------------------------------------------------
      // Demand-Driven: Steam is leading, calculate required fuel power
      // -----------------------------------------------------------------
      usersSteamFlow = S.steamFlowUsers;

      // Condensate flow
      condFlow = S.condFlowAuto 
        ? (usersSteamFlow * S.condPctManual / 100)
        : Math.min(S.condReturnFlowManual, usersSteamFlow);

      // Solve pegging and blowdown
      if (S.bdMode === 'auto') {
        const num = condFlow * S.condConductivity + (usersSteamFlow - condFlow) * S.makeupConductivity;
        const den = S.boilerConductivity - S.makeupConductivity;
        const maxBD = usersSteamFlow * 0.25; // Cap at 25% of steam flow
        mBlowdown = den > 0 ? Math.min(maxBD, Math.max(0, num / den)) : maxBD;

        const numPeg = (usersSteamFlow + mBlowdown) * H_A - condFlow * (hCond - hMakeup);
        const denPeg = hPeggingSteam - hFW_daea;
        peggingSteamFlow = denPeg > 0 ? Math.max(0, numPeg / denPeg) : 0;
        boilerSteamFlow = usersSteamFlow + peggingSteamFlow;
        fwFlow = boilerSteamFlow + mBlowdown;
        x_bd = boilerSteamFlow > 0 ? (mBlowdown / boilerSteamFlow * 100) : 0;
      } else {
        x_bd = S.bdFlowManual;
        const B = 1 + x_bd / 100;
        const C = B * H_A;
        const D = condFlow * (hCond - hMakeup);
        const E = hPeggingSteam - hMakeup;
        peggingSteamFlow = (E - C) > 0 ? Math.max(0, (usersSteamFlow * C - D) / (E - C)) : 0;
        boilerSteamFlow = usersSteamFlow + peggingSteamFlow;
        mBlowdown = boilerSteamFlow * (x_bd / 100);
        fwFlow = boilerSteamFlow + mBlowdown;
      }

      // Makeup water flow
      makeupFlow = Math.max(0, fwFlow - condFlow - peggingSteamFlow);

      // Solve required fuel power
      const Q_transferred_daea = (boilerSteamFlow / 3600) * (hSteam - hFW_daea) + (mBlowdown / 3600) * (hLiqSat - hFW_daea);
      gasPowerLHV = combustEff > 0 ? (Q_transferred_daea * 100 / combustEff) : 0;
      gasPowerHHV = gasPowerLHV * (S.gasHHV / S.gasLHV);
      gasFlowRate = S.gasLHV > 0 ? (gasPowerLHV / S.gasLHV) : 0;

    } else {
      // -----------------------------------------------------------------
      // Fuel-Driven: Gas is leading, calculate resulting steam output
      // -----------------------------------------------------------------
      // Solve fuel LHV power from inputs
      if (S.gasInputMode === 'volume') {
        gasFlowRate = S.gasFlowRate;
        gasPowerLHV = gasFlowRate * S.gasLHV;
        gasPowerHHV = gasFlowRate * S.gasHHV;
      } else if (S.gasInputMode === 'lhv') {
        gasPowerLHV = S.gasInputValue;
        gasPowerHHV = S.gasInputValue * (S.gasHHV / S.gasLHV);
        gasFlowRate = S.gasLHV > 0 ? (S.gasInputValue / S.gasLHV) : 0;
      } else {
        gasPowerHHV = S.gasInputValue;
        gasPowerLHV = S.gasHHV > 0 ? (S.gasInputValue * S.gasLHV / S.gasHHV) : 0;
        gasFlowRate = S.gasHHV > 0 ? (S.gasInputValue / S.gasHHV) : 0;
      }

      // Total heat transferred from DA state (kW)
      const Q_transferred_daea = gasPowerLHV * combustEff / 100;

      // Linear coefficients for condensate
      let r_cond = 0;
      let Q_cond_coeff = 0;
      let Q_cond_const = 0;

      if (S.condFlowAuto) {
        r_cond = S.condPctManual / 100;
        Q_cond_coeff = r_cond * (hCond - hMakeup);
        Q_cond_const = 0;
      } else {
        r_cond = 0;
        Q_cond_coeff = 0;
        Q_cond_const = S.condReturnFlowManual * (hCond - hMakeup);
      }

      // Solve deaerator pegging and blowdown coefficients
      let K1 = 0;
      let K2 = 0;
      let P1 = 0;
      let P2 = 0;

      if (S.bdMode === 'auto') {
        const denom = S.boilerConductivity - S.makeupConductivity;
        let K1_raw = 0;
        let K2_raw = 0;

        if (S.condFlowAuto) {
          K1_raw = denom > 0 ? (r_cond * S.condConductivity + (1 - r_cond) * S.makeupConductivity) / denom : 0.25;
          K2_raw = 0;
        } else {
          K1_raw = denom > 0 ? S.makeupConductivity / denom : 0.25;
          K2_raw = denom > 0 ? S.condReturnFlowManual * (S.condConductivity - S.makeupConductivity) / denom : 0;
        }

        if (K1_raw > 0.25 || denom <= 0) {
          K1 = 0.25;
          K2 = 0;
        } else {
          K1 = K1_raw;
          K2 = K2_raw;
        }

        const X_coeff = (1 + K1) * H_A - Q_cond_coeff;
        const Y_const = K2 * H_A - Q_cond_const;
        const denPeg = H_B - H_A;

        P1 = denPeg > 0 ? (X_coeff / denPeg) : 0;
        P2 = denPeg > 0 ? (Y_const / denPeg) : 0;
      } else {
        x_bd = S.bdFlowManual;
        const B = 1 + x_bd / 100;
        const denPeg = H_B - B * H_A;

        if (S.condFlowAuto) {
          P1 = denPeg > 0 ? (B * H_A - Q_cond_coeff) / denPeg : 0;
          P2 = 0;
        } else {
          P1 = denPeg > 0 ? (B * H_A) / denPeg : 0;
          P2 = denPeg > 0 ? (-Q_cond_const) / denPeg : 0;
        }

        K1 = (1 + P1) * (x_bd / 100);
        K2 = P2 * (x_bd / 100);
      }

      // Solve final equation for usersSteamFlow
      const A_final = (1 + P1) * H_D + K1 * H_E;
      const B_final = P2 * H_D + K2 * H_E;

      usersSteamFlow = A_final > 0 ? Math.max(0, (Q_transferred_daea * 3600 - B_final) / A_final) : 0;
      peggingSteamFlow = P1 * usersSteamFlow + P2;
      boilerSteamFlow = usersSteamFlow + peggingSteamFlow;
      mBlowdown = K1 * usersSteamFlow + K2;
      fwFlow = boilerSteamFlow + mBlowdown;
      condFlow = S.condFlowAuto 
        ? (usersSteamFlow * S.condPctManual / 100)
        : Math.min(S.condReturnFlowManual, usersSteamFlow);
      makeupFlow = Math.max(0, fwFlow - condFlow - peggingSteamFlow);
      x_bd = boilerSteamFlow > 0 ? (mBlowdown / boilerSteamFlow * 100) : 0;
    }

    // -----------------------------------------------------------------
    // Common Calculations
    // -----------------------------------------------------------------
    // Feed water conductivity leaving deaerator
    const fwConductivity = fwFlow > 0 
      ? (condFlow * S.condConductivity + makeupFlow * S.makeupConductivity) / fwFlow 
      : 0;

    // Heat loss values
    const flueLossKW = gasPowerLHV * flueLossPct / 100;
    const radLossKW = gasPowerLHV * S.radLossPct / 100;

    // Economizer heat recovery
    let ecoHeat = 0;
    let ecoDt = 0;
    let ecoLMTD = 0;
    if (S.ecoEnabled) {
      const lossBefore = flueGasLossPct(S.flueGasTemp, S.airTempIn, S.o2Flue);
      const lossAfter = flueGasLossPct(ecoFlueTempOutClamped, S.airTempIn, S.o2Flue);
      ecoHeat = Math.max(0, gasPowerLHV * (lossBefore - lossAfter) / 100);
      if (fwFlow > 0) {
        ecoDt = ecoHeat * 3600 / (fwFlow * 4.187);
      }

      // LMTD calculation
      const tFW_out = tDaea + ecoDt;
      const dT1 = S.flueGasTemp - tFW_out;
      const dT2 = ecoFlueTempOutClamped - tDaea;
      if (dT1 > 0 && dT2 > 0) {
        if (Math.abs(dT1 - dT2) < 0.1) {
          ecoLMTD = dT1;
        } else {
          ecoLMTD = (dT1 - dT2) / Math.log(dT1 / dT2);
        }
      }
    }

    const tFW = tDaea + ecoDt;
    const hFW = enthalpyLiquid(tFW);

    // Boiler Heat transfer & efficiency
    const steamHeatTransferred = (boilerSteamFlow / 3600) * (hSteam - hFW); // kW
    const blowdownHeatLoss = (mBlowdown / 3600) * (hLiqSat - hFW); // kW
    const totalBoilerHeat = steamHeatTransferred + blowdownHeatLoss; // kW
    
    const boilerEff = gasPowerLHV > 0 
      ? Math.max(0, (steamHeatTransferred / gasPowerLHV) * 100) 
      : 0;

    // Overall Boilerhouse Efficiency
    const Q_export_net = (usersSteamFlow / 3600) * (hSteam - hMakeup) - (condFlow / 3600) * (hCond - hMakeup);
    const bhEff = gasPowerHHV > 0 
      ? Math.max(0, (Q_export_net / gasPowerHHV) * 100) 
      : 0;

    const excessAir = excessAirFromO2(S.o2Flue);

    const condPct = usersSteamFlow > 0 ? (condFlow / usersSteamFlow * 100) : 0;

    // Solve resulting drum conductivity
    let boilerConductivity = S.boilerConductivity;
    const isBlowdownCapped = S.bdMode === 'auto' && (mBlowdown >= usersSteamFlow * 0.249 || (S.boilerConductivity - S.makeupConductivity) <= 0);

    if (S.bdMode === 'manual' || isBlowdownCapped) {
      boilerConductivity = mBlowdown > 0 
        ? (condFlow * S.condConductivity + makeupFlow * S.makeupConductivity) / mBlowdown 
        : 9999;
    }

    return {
      tSat,
      boilerConductivity,
      hSteam,
      hLiqSat,
      tDaea,
      hFW_daea,
      condFlow,
      condPct,
      peggingSteamFlow,
      boilerSteamFlow,
      mBlowdown,
      fwFlow,
      makeupFlow,
      fwConductivity,
      gasFlowRate,
      gasPowerLHV,
      gasPowerHHV,
      flueTempEff,
      flueLossPct,
      flueLossKW,
      radLossKW,
      combustEff,
      ecoHeat,
      ecoDt,
      ecoLMTD,
      ecoFlueTempOutClamped,
      tFW,
      hFW,
      steamHeatTransferred,
      blowdownHeatLoss,
      totalBoilerHeat,
      boilerEff,
      Q_export_net,
      bhEff,
      excessAir,
      x_bd,
      usersSteamFlow
    };
  }, [S, leadingVariable]);

  // Click handlers
  const handleOpenPopup = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPopupKey(key);
    
    const pw = 280; // Popup width
    const ph = 260; // Popup height
    
    const container = document.querySelector('.diagram-card');
    const containerRect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
    
    let x = e.clientX - containerRect.left + 12;
    let y = e.clientY - containerRect.top + 12;
    
    if (key === 'boilerChemistry') {
      const containerWidth = container ? container.clientWidth : 845;
      const containerHeight = container ? container.clientHeight : 451;
      const scaleX = containerWidth / 845;
      const scaleY = containerHeight / 451;
      
      x = 362 * scaleX;
      y = 230 * scaleY;
      
      if (x + pw > containerWidth) {
        x = 229 * scaleX - pw;
      }
    } else if (key === 'economizerFlue') {
      const containerWidth = container ? container.clientWidth : 845;
      const containerHeight = container ? container.clientHeight : 451;
      const scaleX = containerWidth / 845;
      const scaleY = containerHeight / 451;
      
      x = 297 * scaleX;
      y = 100 * scaleY;
      
      if (x + pw > containerWidth) {
        x = 167 * scaleX - pw - 12;
      }
    }
    
    // Bounds checking relative to container
    const containerWidth = container ? container.clientWidth : window.innerWidth;
    const containerHeight = container ? container.clientHeight : window.innerHeight;
    
    if (x + pw > containerWidth) {
      if (key === 'boilerChemistry') {
        const condNode = document.querySelector('[data-cell-id="lbl-cond-drum"]');
        if (condNode) {
          const nodeRect = condNode.getBoundingClientRect();
          x = nodeRect.left - containerRect.left - pw - 12;
        } else {
          x = containerWidth - pw - 12;
        }
      } else {
        x = containerWidth - pw - 12;
      }
    }
    if (y + ph > containerHeight) {
      y = containerHeight - ph - 12;
    }
    if (x < 12) x = 12;
    if (y < 12) y = 12;
    
    setPopupPos({ x, y });
  };



  const handleGasModeChange = (newMode: 'volume' | 'lhv' | 'hhv') => {
    setLeadingVariable('gas');
    setS(prev => {
      let newInputValue = prev.gasInputValue;
      let newFlowRate = prev.gasFlowRate;

      if (prev.gasInputMode === 'volume') {
        if (newMode === 'lhv') {
          newInputValue = prev.gasFlowRate * prev.gasLHV;
        } else if (newMode === 'hhv') {
          newInputValue = prev.gasFlowRate * prev.gasHHV;
        }
      } else if (prev.gasInputMode === 'lhv') {
        if (newMode === 'volume') {
          newFlowRate = prev.gasInputValue / prev.gasLHV;
          newInputValue = newFlowRate;
        } else if (newMode === 'hhv') {
          newInputValue = prev.gasInputValue * (prev.gasHHV / prev.gasLHV);
        }
      } else if (prev.gasInputMode === 'hhv') {
        if (newMode === 'volume') {
          newFlowRate = prev.gasInputValue / prev.gasHHV;
          newInputValue = newFlowRate;
        } else if (newMode === 'lhv') {
          newInputValue = prev.gasInputValue * (prev.gasLHV / prev.gasHHV);
        }
      }

      return {
        ...prev,
        gasInputMode: newMode,
        gasInputValue: newInputValue,
        gasFlowRate: newFlowRate
      };
    });
  };




  

  const renderPopupContent = (key: string) => {
    switch (key) {
      case 'settings':
        return (
          <>
            <div className="form-row">
              <label>Theme</label>
              <div className="toggle-group">
                <button 
                  className={`toggle-btn ${isDarkMode ? 'active' : ''}`}
                  onClick={() => setIsDarkMode(true)}
                >
                  Dark
                </button>
                <button 
                  className={`toggle-btn ${!isDarkMode ? 'active' : ''}`}
                  onClick={() => setIsDarkMode(false)}
                >
                  Light
                </button>
              </div>
            </div>
            <div className="form-row">
              <label>Flow Animation</label>
              <div className="toggle-group">
                <button 
                  className={`toggle-btn ${isAnimationEnabled ? 'active' : ''}`}
                  onClick={() => setIsAnimationEnabled(true)}
                >
                  On
                </button>
                <button 
                  className={`toggle-btn ${!isAnimationEnabled ? 'active' : ''}`}
                  onClick={() => setIsAnimationEnabled(false)}
                >
                  Off (Solid)
                </button>
              </div>
            </div>
          </>
        );
      case 'gasInput':
        return (
          <>
            <div className="form-row">
              <label>Input Mode</label>
              <select 
                value={S.gasInputMode} 
                onChange={(e) => handleGasModeChange(e.target.value as any)}
              >
                <option value="volume">Volume flow</option>
                <option value="lhv">Power (LHV)</option>
                <option value="hhv">Power (HHV)</option>
              </select>
            </div>
            <div className="form-row">
              <label>
                {S.gasInputMode === 'volume' ? 'Volume Flow' : S.gasInputMode === 'lhv' ? 'LHV Power' : 'HHV Power'}
              </label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  min={0}
                  defaultValue={100}
                  value={leadingVariable === 'gas' ? (S.gasInputMode === 'volume' ? S.gasFlowRate : S.gasInputValue) : (S.gasInputMode === 'volume' ? Math.round(R.gasFlowRate) : Math.round(R.gasPowerLHV))}
                  onChange={(v) => {
                    setLeadingVariable('gas');
                    setS(prev => ({
                      ...prev,
                      gasInputValue: v,
                      gasFlowRate: prev.gasInputMode === 'volume' ? v : prev.gasFlowRate
                    }));
                  }}
                />
                <span className="form-unit">{S.gasInputMode === 'volume' ? 'Nm³/h' : 'kW'}</span>
              </div>
            </div>
            <div className="form-row">
              <label>Gas LHV</label>
              <div className="input-with-unit">
                <input 
                  type="number" 
                  step="0.05"
                  value={S.gasLHV}
                  onChange={(e) => setS(prev => ({ ...prev, gasLHV: parseFloat(e.target.value) || 10.35 }))}
                />
                <span className="form-unit">kWh/Nm³</span>
              </div>
            </div>
            <div className="form-row">
              <label>Gas HHV</label>
              <div className="input-with-unit">
                <input 
                  type="number" 
                  step="0.05"
                  value={S.gasHHV}
                  onChange={(e) => setS(prev => ({ ...prev, gasHHV: parseFloat(e.target.value) || 11.63 }))}
                />
                <span className="form-unit">kWh/Nm³</span>
              </div>
            </div>
          </>
        );
      case 'airTempIn':
        return (
          <div className="form-row">
            <label>Fresh Air Temperature</label>
            <div className="input-with-unit">
              <input 
                type="number" 
                value={S.airTempIn}
                onChange={(e) => setS(prev => ({ ...prev, airTempIn: parseFloat(e.target.value) || 20 }))}
              />
              <span className="form-unit">°C</span>
            </div>
          </div>
        );
      case 'economizerFlue':
        return (
          <>
            <div className="form-row">
              <label>Economizer State</label>
              <div className="toggle-group">
                <button 
                  className={`toggle-btn ${S.ecoEnabled ? 'active' : ''}`}
                  onClick={() => setS(prev => ({ ...prev, ecoEnabled: true }))}
                >
                  Active
                </button>
                <button 
                  className={`toggle-btn ${!S.ecoEnabled ? 'active' : ''}`}
                  onClick={() => setS(prev => ({ ...prev, ecoEnabled: false }))}
                >
                  Disabled
                </button>
              </div>
            </div>

            <div className="form-row">
              <label>Flue Gas Boiler Outlet</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  step="5"
                  min={100}
                  max={400}
                  defaultValue={180}
                  value={S.flueGasTemp}
                  onChange={(v) => {
                    setLeadingVariable('gas');
                    setS(prev => ({ ...prev, flueGasTemp: v }));
                  }}
                />
                <span className="form-unit">°C</span>
              </div>
            </div>

            <div className="form-row">
              <label>Flue Gas O₂</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  step="0.1"
                  min={0.5}
                  max={15}
                  defaultValue={3.5}
                  value={S.o2Flue}
                  onChange={(v) => {
                    setLeadingVariable('gas');
                    setS(prev => ({ ...prev, o2Flue: v }));
                  }}
                />
                <span className="form-unit">% vol</span>
              </div>
            </div>

            {S.ecoEnabled && (
              <>
                <div className="form-row">
                  <label>Flue Temp after Eco</label>
                  <div className="input-with-unit">
                    <ClampedNumericInput 
                      step="5"
                      min={Math.ceil(R.tDaea)}
                      max={300}
                      defaultValue={130}
                      value={S.ecoFlueTempOut}
                      onChange={(v) => {
                        setLeadingVariable('gas');
                        setS(prev => ({ ...prev, ecoFlueTempOut: v }));
                      }}
                    />
                    <span className="form-unit">°C</span>
                  </div>
                </div>
                <div className="form-row">
                  <label>Economizer LMTD</label>
                  <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text)', padding: '0.2rem 0' }}>
                    {R.ecoLMTD > 0 ? `${fmtVal(R.ecoLMTD, 1)} °C` : 'N/A (dT ≤ 0)'}
                  </div>
                </div>
              </>
            )}
          </>
        );
      case 'drumPressure':
        return (
          <div className="form-row">
            <label>Steam Drum Pressure</label>
            <div className="input-with-unit">
              <input 
                type="number" 
                step="0.2"
                min="0.2"
                max="40"
                value={S.drumPressure}
                onChange={(e) => setS(prev => ({ ...prev, drumPressure: parseFloat(e.target.value) || 10 }))}
              />
              <span className="form-unit">bar(g)</span>
            </div>
          </div>
        );
      case 'boilerChemistry':
        return (
          <>
            <div className="form-row">
              <label>Control Mode</label>
              <div className="toggle-group">
                <button 
                  className={`toggle-btn ${S.bdMode === 'auto' ? 'active' : ''}`}
                  onClick={() => {
                    setLeadingVariable('steam');
                    setS(prev => ({ ...prev, bdMode: 'auto' }));
                  }}
                >
                  Auto
                </button>
                <button 
                  className={`toggle-btn ${S.bdMode === 'manual' ? 'active' : ''}`}
                  onClick={() => {
                    setLeadingVariable('steam');
                    setS(prev => ({ ...prev, bdMode: 'manual' }));
                  }}
                >
                  Manual
                </button>
              </div>
            </div>

            {S.bdMode === 'auto' ? (
              <>
                <div className="form-row">
                  <label>Conductivity Setpoint</label>
                  <div className="input-with-unit">
                    <ClampedNumericInput 
                      step={100}
                      min={500}
                      max={5000}
                      defaultValue={2000}
                      value={S.boilerConductivity}
                      onChange={(v) => {
                        setLeadingVariable('steam');
                        setS(prev => ({ ...prev, boilerConductivity: v }));
                      }}
                    />
                    <span className="form-unit">µS/cm</span>
                  </div>
                </div>
                <div className="form-row">
                  <label>Calculated Blowdown</label>
                  <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text)', padding: '0.2rem 0' }}>
                    {R.mBlowdown >= R.usersSteamFlow * 0.249 ? (
                      <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                        25.0% (CAPPED)
                      </span>
                    ) : (
                      `${fmtVal(R.x_bd, 1)}% (${fmtVal(R.mBlowdown, 0)} kg/h)`
                    )}
                  </div>
                </div>
                {R.mBlowdown >= R.usersSteamFlow * 0.249 && (
                  <div className="form-row">
                    <label>Actual Conductivity</label>
                    <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#ef4444', fontWeight: 'bold', padding: '0.2rem 0' }}>
                      {fmtVal(R.boilerConductivity, 0)} µS/cm
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="form-row">
                  <label>Blowdown Rate</label>
                  <div className="input-with-unit">
                    <ClampedNumericInput 
                      step={0.1}
                      min={0.1}
                      max={25}
                      defaultValue={0.5}
                      value={S.bdFlowManual}
                      onChange={(v) => {
                        setLeadingVariable('steam');
                        setS(prev => ({ ...prev, bdFlowManual: v }));
                      }}
                    />
                    <span className="form-unit">% steam</span>
                  </div>
                </div>
                <div className="form-row">
                  <label>Calculated Conductivity</label>
                  <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text)', padding: '0.2rem 0' }}>
                    {R.boilerConductivity > 9000 ? '∞ (Accumulating)' : `${fmtVal(R.boilerConductivity, 0)} µS/cm`}
                  </div>
                </div>
              </>
            )}
          </>
        );
      case 'makeupFlow':
        return (
          <>
            <div className="form-row">
              <label>Makeup Water Temp</label>
              <div className="input-with-unit">
                <input 
                  type="number" 
                  value={S.makeupTemp}
                  onChange={(e) => setS(prev => ({ ...prev, makeupTemp: parseFloat(e.target.value) || 15 }))}
                />
                <span className="form-unit">°C</span>
              </div>
            </div>
            <div className="form-row">
              <label>Makeup Water Conductivity</label>
              <div className="input-with-unit">
                <input 
                  type="number" 
                  step="10"
                  value={S.makeupConductivity}
                  onChange={(e) => setS(prev => ({ ...prev, makeupConductivity: parseFloat(e.target.value) || 300 }))}
                />
                <span className="form-unit">µS/cm</span>
              </div>
            </div>
          </>
        );
      case 'steamFlow':
        return (
          <div className="form-row">
            <label>Steam Demand to Users</label>
            <div className="input-with-unit">
              <input 
                type="number" 
                step="50"
                min="100"
                max="10000"
                value={leadingVariable === 'steam' ? S.steamFlowUsers : Math.round(R.usersSteamFlow)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setLeadingVariable('steam');
                  setS(prev => ({ ...prev, steamFlowUsers: v }));
                }}
              />
              <span className="form-unit">kg/h</span>
            </div>
          </div>
        );
      case 'condReturnFlow':
        return (
          <>
            <div className="form-row">
              <label>Condensate Flow Mode</label>
              <div className="toggle-group">
                <button 
                  className={`toggle-btn ${S.condFlowAuto ? 'active' : ''}`}
                  onClick={() => setS(prev => ({ ...prev, condFlowAuto: true }))}
                >
                  Auto (%)
                </button>
                <button 
                  className={`toggle-btn ${!S.condFlowAuto ? 'active' : ''}`}
                  onClick={() => setS(prev => ({ ...prev, condFlowAuto: false }))}
                >
                  Manual (kg/h)
                </button>
              </div>
            </div>
            {S.condFlowAuto ? (
              <div className="form-row">
                <label>Condensate Return Rate</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    min="0"
                    max="100"
                    value={S.condPctManual}
                    onChange={(e) => setS(prev => ({ ...prev, condPctManual: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="form-unit">% steam</span>
                </div>
              </div>
            ) : (
              <div className="form-row">
                <label>Condensate Return Flow</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="50"
                    min="0"
                    value={S.condReturnFlowManual}
                    onChange={(e) => setS(prev => ({ ...prev, condReturnFlowManual: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="form-unit">kg/h</span>
                </div>
              </div>
            )}
            <div className="form-row">
              <label>Condensate Return Temp</label>
              <div className="input-with-unit">
                <input 
                  type="number" 
                  value={S.condReturnTemp}
                  onChange={(e) => setS(prev => ({ ...prev, condReturnTemp: parseFloat(e.target.value) || 80 }))}
                />
                <span className="form-unit">°C</span>
              </div>
            </div>
            <div className="form-row">
              <label>Condensate Conductivity</label>
              <div className="input-with-unit">
                <input 
                  type="number" 
                  step="5"
                  value={S.condConductivity}
                  onChange={(e) => setS(prev => ({ ...prev, condConductivity: parseFloat(e.target.value) || 20 }))}
                />
                <span className="form-unit">µS/cm</span>
              </div>
            </div>
          </>
        );
      case 'deaerator':
        return (
          <>
            <div className="form-row">
              <label>Deaerator Pressure</label>
              <div className="input-with-unit">
                <input 
                  type="number" 
                  step="0.05"
                  min="0"
                  max="1.5"
                  value={S.daeaPressure}
                  onChange={(e) => setS(prev => ({ ...prev, daeaPressure: parseFloat(e.target.value) || 0.2 }))}
                />
                <span className="form-unit">bar(g)</span>
              </div>
            </div>
            <div className="form-row">
              <label>Deaerator Target Conductivity</label>
              <div className="input-with-unit">
                <input 
                  type="number" 
                  value={S.daeaConductivity}
                  onChange={(e) => setS(prev => ({ ...prev, daeaConductivity: parseFloat(e.target.value) || 20 }))}
                />
                <span className="form-unit">µS/cm</span>
              </div>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  // Helper formatting functions
  const fmtVal = (val: number, dec: number = 1) => val !== undefined && !isNaN(val) ? val.toFixed(dec) : '—';
  
  

  return (
    <div className={`app-container ${isDarkMode ? '' : 'light-theme'}`}>
      {/* Header bar */}
      <header className="dashboard-header">
        <div className="logo-area">
          <span className="logo-tag">THERMAL SYSTEMS</span>
          <h1 className="logo-title">Boiler<span>house</span> · Simulation Studio</h1>
        </div>

        <div className="header-controls">
          <button 
            className="control-btn" 
            onClick={(e) => handleOpenPopup('settings', e)}
            title="Open Settings"
          >
            ⚙️ Settings
          </button>
        </div>

        <div className="efficiency-badges">
          <div className="eff-badge-card">
            <span className="eff-badge-label">Combustion η</span>
            <span className="eff-badge-value">{fmtVal(R.combustEff, 1)}%</span>
          </div>
          <div className="eff-badge-card">
            <span className="eff-badge-label">Boiler η (LHV)</span>
            <span className="eff-badge-value">{fmtVal(R.boilerEff, 1)}%</span>
          </div>
          <div className="eff-badge-card">
            <span className="eff-badge-label">Boilerhouse η (HHV)</span>
            <span className={`eff-badge-value ${R.bhEff < 75 ? 'danger' : R.bhEff < 82 ? 'warn' : ''}`}>
              {fmtVal(R.bhEff, 1)}%
            </span>
          </div>
        </div>
      </header>

      {/* Main dashboard content */}
      <div className="main-layout">
        {/* Left side SVG area */}
        <section className="diagram-area">
          <div className="diagram-card">
            <BoilerhouseSVG 
              isDarkMode={isDarkMode}
              isAnimationEnabled={isAnimationEnabled}
              gasFlowRate={R.gasFlowRate}
              gasInputMode={S.gasInputMode}
                                          gasPowerLHV={R.gasPowerLHV}
              gasPowerHHV={R.gasPowerHHV}
              airTempIn={S.airTempIn}
              o2Flue={S.o2Flue}
              flueTempEff={R.flueTempEff}
              drumPressure={S.drumPressure}
              boilerConductivity={R.boilerConductivity}
              bdFlow={R.x_bd}
              bdFlowKgH={R.mBlowdown}
              makeupFlow={R.makeupFlow}
              makeupConductivity={S.makeupConductivity}
              fwFlow={R.fwFlow}
              tFW={R.tFW}
              steamFlow={R.usersSteamFlow}
              condFlow={R.condFlow}
              condPct={R.condPct}
              condReturnTemp={S.condReturnTemp}
              condConductivity={S.condConductivity}
              peggingSteamFlow={R.peggingSteamFlow}
              ecoEnabled={S.ecoEnabled}
              ecoHeat={R.ecoHeat}
              ecoFlueTempOut={R.ecoFlueTempOutClamped}
              daeaPressure={S.daeaPressure}
              daeaConductivity={S.daeaConductivity}
              tSat={R.tSat}
              tDaea={R.tDaea}
                            onOpenPopup={handleOpenPopup}
              
            />

            

            {/* Floating input popup */}
            {popupKey && <div className="popup-backdrop" onClick={() => setPopupKey(null)} />}
            {popupKey && popupPos && (
              <div 
                className="param-popup-card" 
                style={{ left: popupPos.x, top: popupPos.y }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="popup-header">
                  <h4>{popupKey.replace(/([A-Z])/g, ' $1')}</h4>
                  <button className="popup-close-btn" onClick={() => setPopupKey(null)}>×</button>
                </div>
                <div className="popup-body">
                  {renderPopupContent(popupKey)}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right side balance sheets */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <h3>Mass &amp; Heat Balance</h3>
          </div>
          
          <div className="sidebar-content">
            {/* Fuel & Combustion group */}
            <div className="balance-group">
              <span className="balance-group-title">Fuel Input (LHV/HHV)</span>
              <div className="balance-row">
                <span className="balance-label">Gas Volume Flow</span>
                <span className="balance-value gas">{fmtVal(R.gasFlowRate, 1)} Nm³/h</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">Gas Power (LHV)</span>
                <span className="balance-value gas">{fmtVal(R.gasPowerLHV, 0)} kW</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">Gas Power (HHV)</span>
                <span className="balance-value gas">{fmtVal(R.gasPowerHHV, 0)} kW</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">Excess Air Ratio</span>
                <span className="balance-value">{fmtVal(R.excessAir, 0)}%</span>
              </div>
            </div>

            {/* Steam Output group */}
            <div className="balance-group">
              <span className="balance-group-title">Steam Generation</span>
              <div className="balance-row">
                <span className="balance-label">Export Steam to Users</span>
                <span className="balance-value steam">{fmtVal(R.usersSteamFlow, 0)} kg/h</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">Pegging Steam to DA</span>
                <span className="balance-value steam">{fmtVal(R.peggingSteamFlow, 0)} kg/h</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">Total Drum Steam</span>
                <span className="balance-value steam">{fmtVal(R.boilerSteamFlow, 0)} kg/h</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">Saturated Steam Temp</span>
                <span className="balance-value steam">{fmtVal(R.tSat, 1)} °C</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">Saturated Enthalpy</span>
                <span className="balance-value">{fmtVal(R.hSteam, 0)} kJ/kg</span>
              </div>
            </div>

            {/* Feed Water group */}
            <div className="balance-group">
              <span className="balance-group-title">Feedwater Loop</span>
              <div className="balance-row">
                <span className="balance-label">Feedwater Mass Flow</span>
                <span className="balance-value water">{fmtVal(R.fwFlow, 0)} kg/h</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">DA Temperature</span>
                <span className="balance-value water">{fmtVal(R.tDaea, 1)} °C</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">ECO Temperature Gain</span>
                <span className="balance-value water">{S.ecoEnabled ? `+${fmtVal(R.ecoDt, 1)} °C` : '(no ECO)'}</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">FW Boiler Inlet Temp</span>
                <span className="balance-value water">{fmtVal(R.tFW, 1)} °C</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">FW Conductivity</span>
                <span className="balance-value">{fmtVal(R.fwConductivity, 0)} µS/cm</span>
              </div>
            </div>

            {/* Water Chemistry & Blowdown group */}
            <div className="balance-group">
              <span className="balance-group-title">Water Chemistry &amp; BD</span>
              <div className="balance-row">
                <span className="balance-label">Condensate Return Flow</span>
                <span className="balance-value condensate">{fmtVal(R.condFlow, 0)} kg/h</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">Makeup Water Demand</span>
                <span className="balance-value water">{fmtVal(R.makeupFlow, 0)} kg/h</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">Continuous Blowdown</span>
                <span className="balance-value blowdown">{fmtVal(R.mBlowdown, 0)} kg/h{R.mBlowdown >= R.usersSteamFlow * 0.249 && <span style={{color: '#ef4444', fontWeight: 'bold'}} title="Capped at 25% max due to low conductivity setpoint relative to makeup quality"> (CAPPED)</span>}</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">Blowdown Rate %</span>
                <span className="balance-value blowdown">{fmtVal(R.x_bd, 1)}%</span>
              </div>
            </div>

            {/* Heat Losses group */}
            <div className="balance-group">
              <span className="balance-group-title">System Heat Losses</span>
              <div className="balance-row">
                <span className="balance-label">Flue Stack Loss</span>
                <span className="balance-value loss">{fmtVal(R.flueLossKW, 0)} kW ({fmtVal(R.flueLossPct, 1)}%)</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">Continuous Blowdown Loss</span>
                <span className="balance-value loss">{fmtVal(R.blowdownHeatLoss, 0)} kW</span>
              </div>
              <div className="balance-row">
                <span className="balance-label">Radiation &amp; Conv. Loss</span>
                <span className="balance-value loss">{fmtVal(R.radLossKW, 0)} kW ({fmtVal(S.radLossPct, 1)}%)</span>
              </div>
            </div>

            {/* Economizer group */}
            <div className="balance-group">
              <span className="balance-group-title">Economizer Recovery</span>
              <div className="balance-row">
                <span className="balance-label">Economizer State</span>
                <span className={`balance-value ${S.ecoEnabled ? 'efficiency' : 'loss'}`}>
                  {S.ecoEnabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
              <div className="balance-row">
                <span className="balance-label">Heat Recovered</span>
                <span className="balance-value efficiency">{fmtVal(R.ecoHeat, 0)} kW</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Footer bar */}
      <footer className="dashboard-footer">
        <span>
          Click on any value block or component on the diagram to modify parameters.
        </span>
        <span>
          All calculations are based on <span className="footer-highlight">ASME PTC 4</span> / <span className="footer-highlight">EN 12952</span>
        </span>
      </footer>
    </div>
  );
}
