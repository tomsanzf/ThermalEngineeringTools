import React, { useState, useMemo } from 'react';
import { BoilerhouseSVG } from './components/BoilerhouseSVG';
interface ClampedNumericInputProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: string | number;
  defaultValue?: number;
  disabled?: boolean;
}
const ClampedNumericInput: React.FC<ClampedNumericInputProps> = ({
  value,
  onChange,
  min,
  max,
  step = "any",
  defaultValue = 0,
  disabled
}) => {
  const [localVal, setLocalVal] = React.useState<string>(value.toString());
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isKeyboardTyping = React.useRef<boolean>(false);
  React.useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setLocalVal(value.toString());
      isKeyboardTyping.current = false;
    }
  }, [value]);
  const commitValue = (valStr: string) => {
    let num = parseFloat(valStr);
    if (isNaN(num)) {
      num = defaultValue !== undefined ? defaultValue : (min !== undefined ? min : 0);
    }
    if (min !== undefined && num < min) num = min;
    if (max !== undefined && num > max) num = max;
    onChange(num);
    setLocalVal(num.toString());
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    isKeyboardTyping.current = true;
    if (e.key === 'Enter') {
      commitValue(localVal);
      inputRef.current?.blur();
    }
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalVal(val);
    if (!isKeyboardTyping.current) {
      commitValue(val);
    }
  };
  const handleBlur = () => {
    commitValue(localVal);
    isKeyboardTyping.current = false;
  };
  const handleMouseDown = () => {
    isKeyboardTyping.current = false;
  };
  return (
    <input
      ref={inputRef}
      type="number"
      step={step}
      value={localVal}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      disabled={disabled}
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
  ecoFlueTempOut: number;
  pinchEnabled: boolean;    // °C eco exit
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
  waterInputMode: 'condensate' | 'makeup';
  makeupFlowManual: number;
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
  pinchEnabled: false,
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
  waterInputMode: 'condensate',
  makeupFlowManual: 305,
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
    const radLossPct = S.radLossPct;

    const solveBoilerHouse = (pinchActive: boolean, fixedUA?: number) => {
      const tMakeupEffective_local = (pinchActive && S.ecoEnabled)
        ? (S.makeupTemp + 0.70 * (tDaea - S.makeupTemp))
        : S.makeupTemp;
      const hMakeup_local = enthalpyLiquid(tMakeupEffective_local);
      const H_A_local = hFW_daea - hMakeup_local;
      const H_B_local = hPeggingSteam - hMakeup_local;
      const H_D_local = hSteam - hFW_daea;
      const H_E_local = hLiqSat - hFW_daea;

      let ecoFlueTempOutClamped_local = S.ecoEnabled ? Math.max(tDaea, S.ecoFlueTempOut) : S.flueGasTemp;
      let flueTempEff_local = ecoFlueTempOutClamped_local;
      let flueLossPct_local = flueGasLossPct(flueTempEff_local, S.airTempIn, S.o2Flue);
      let combustEff_local = Math.max(0, 100 - flueLossPct_local - radLossPct);

      let usersSteamFlow_local = 0;
      let peggingSteamFlow_local = 0;
      let boilerSteamFlow_local = 0;
      let mBlowdown_local = 0;
      let fwFlow_local = 0;
      let condFlow_local = 0;
      let makeupFlow_local = 0;
      let x_bd_local = 0;
      let gasFlowRate_local = S.gasFlowRate;
      let gasPowerLHV_local = S.gasInputValue;
      let gasPowerHHV_local = S.gasInputValue;

      let fwConductivity_local = 0;
      let flueLossKW_local = 0;
      let radLossKW_local = 0;
      let pinchHeat_local = 0;
      let tFWEffective_local = tDaea;

      let ecoHeat_local = 0;
      let ecoDt_local = 0;
      let ecoLMTD_local = 0;
      let ecoUA_local = 0;
      let tFW_out_local = tDaea;
      let tWaterIn_local = tDaea;

      // Run 4 iterations to solve the coupled efficiency, fuel, and flow feedback loops
      for (let iter = 0; iter < 4; iter++) {
        flueTempEff_local = ecoFlueTempOutClamped_local;
        flueLossPct_local = flueGasLossPct(flueTempEff_local, S.airTempIn, S.o2Flue);
        combustEff_local = Math.max(0, 100 - flueLossPct_local - radLossPct);

        if (leadingVariable === 'steam') {
          // -----------------------------------------------------------------
          // Demand-Driven: Steam is leading, calculate required fuel power
          // -----------------------------------------------------------------
          usersSteamFlow_local = S.steamFlowUsers;
          const d_p = hSteam - hFW_daea;
          const d_m = hFW_daea - hMakeup_local;
          const d_c = hFW_daea - hCond;

          if (S.waterInputMode === 'makeup') {
            makeupFlow_local = S.makeupFlowManual;

            if (S.bdMode === 'auto') {
              // System of equations:
              // condFlow * (d_p + d_c) - mBlowdown * d_p = usersSteamFlow * d_p - makeupFlow * (d_p + d_m)
              // condFlow * C_cond - mBlowdown * C_boiler = -makeupFlow * C_makeup
              const a1 = d_p + d_c;
              const b1 = -d_p;
              const c1 = usersSteamFlow_local * d_p - makeupFlow_local * (d_p + d_m);
              const a2 = S.condConductivity;
              const b2 = -S.boilerConductivity;
              const c2 = -makeupFlow_local * S.makeupConductivity;
              const det = a1 * b2 - a2 * b1;
              if (det !== 0) {
                condFlow_local = (c1 * b2 - c2 * b1) / det;
                mBlowdown_local = (a1 * c2 - a2 * c1) / det;
              }
              // Clamp blowdown rate to max 25% of steam flow
              const maxBD = usersSteamFlow_local * 0.25;
              if (mBlowdown_local > maxBD) {
                mBlowdown_local = maxBD;
                condFlow_local = (d_p + d_c) > 0 ? ((usersSteamFlow_local + mBlowdown_local) * d_p - makeupFlow_local * (d_p + d_m)) / (d_p + d_c) : 0;
              }
              if (condFlow_local < 0) {
                condFlow_local = 0;
                const factor = d_p + d_m - d_p * S.makeupConductivity / S.boilerConductivity;
                makeupFlow_local = factor > 0 ? (usersSteamFlow_local * d_p) / factor : usersSteamFlow_local;
                mBlowdown_local = makeupFlow_local * S.makeupConductivity / S.boilerConductivity;
                if (mBlowdown_local > makeupFlow_local * 0.25) {
                  mBlowdown_local = makeupFlow_local * 0.25;
                  makeupFlow_local = (d_p + d_m) > 0 ? (usersSteamFlow_local + mBlowdown_local) * d_p / (d_p + d_m) : usersSteamFlow_local;
                }
              }
              peggingSteamFlow_local = (makeupFlow_local * d_m + condFlow_local * d_c) / d_p;
              boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
              fwFlow_local = boilerSteamFlow_local + mBlowdown_local;
              x_bd_local = boilerSteamFlow_local > 0 ? (mBlowdown_local / boilerSteamFlow_local * 100) : 0;
            } else {
              // Manual blowdown mode
              x_bd_local = S.bdFlowManual;
              const f_bd = x_bd_local / 100;
              const den = d_p - f_bd * d_c;
              condFlow_local = den > 0 ? (usersSteamFlow_local * (1 + f_bd) * d_p - makeupFlow_local * (d_p - f_bd * d_m)) / den : 0;
              if (condFlow_local < 0) {
                condFlow_local = 0;
                makeupFlow_local = (d_p + (1 - f_bd) * d_m) > 0 ? (1 + f_bd) * usersSteamFlow_local * d_p / (d_p + (1 - f_bd) * d_m) : usersSteamFlow_local;
                peggingSteamFlow_local = makeupFlow_local * d_m / d_p;
                mBlowdown_local = f_bd * (usersSteamFlow_local + peggingSteamFlow_local);
              } else {
                peggingSteamFlow_local = (makeupFlow_local * d_m + condFlow_local * d_c) / d_p;
                mBlowdown_local = f_bd * (usersSteamFlow_local + peggingSteamFlow_local);
              }
              fwFlow_local = usersSteamFlow_local + peggingSteamFlow_local + mBlowdown_local;
              boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
              x_bd_local = boilerSteamFlow_local > 0 ? (mBlowdown_local / boilerSteamFlow_local * 100) : 0;
            }
          } else {
            // Condensate-Led Mode
            condFlow_local = S.condFlowAuto 
              ? (usersSteamFlow_local * S.condPctManual / 100)
              : Math.min(S.condReturnFlowManual, usersSteamFlow_local);

            if (S.bdMode === 'auto') {
              const num = condFlow_local * S.condConductivity + (usersSteamFlow_local - condFlow_local) * S.makeupConductivity;
              const den = S.boilerConductivity - S.makeupConductivity;
              const maxBD = usersSteamFlow_local * 0.25;
              mBlowdown_local = den > 0 ? Math.min(maxBD, Math.max(0, num / den)) : maxBD;

              const numPeg = (usersSteamFlow_local + mBlowdown_local) * H_A_local - condFlow_local * (hCond - hMakeup_local);
              const denPeg = hPeggingSteam - hFW_daea;
              peggingSteamFlow_local = denPeg > 0 ? Math.max(0, numPeg / denPeg) : 0;
              boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
              fwFlow_local = boilerSteamFlow_local + mBlowdown_local;
              x_bd_local = boilerSteamFlow_local > 0 ? (mBlowdown_local / boilerSteamFlow_local * 100) : 0;
            } else {
              x_bd_local = S.bdFlowManual;
              const B = 1 + x_bd_local / 100;
              const C = B * H_A_local;
              const D = condFlow_local * (hCond - hMakeup_local);
              const E = hPeggingSteam - hMakeup_local;
              peggingSteamFlow_local = (E - C) > 0 ? Math.max(0, (usersSteamFlow_local * C - D) / (E - C)) : 0;
              boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
              mBlowdown_local = boilerSteamFlow_local * (x_bd_local / 100);
              fwFlow_local = boilerSteamFlow_local + mBlowdown_local;
              x_bd_local = boilerSteamFlow_local > 0 ? (mBlowdown_local / boilerSteamFlow_local * 100) : 0;
            }
            makeupFlow_local = Math.max(0, fwFlow_local - condFlow_local - peggingSteamFlow_local);
          }

          const Q_transferred_daea = (boilerSteamFlow_local / 3600) * (hSteam - hFW_daea) + (mBlowdown_local / 3600) * (hLiqSat - hFW_daea);
          gasPowerLHV_local = combustEff_local > 0 ? (Q_transferred_daea * 100 / combustEff_local) : 0;
          gasPowerHHV_local = gasPowerLHV_local * (S.gasHHV / S.gasLHV);
          gasFlowRate_local = S.gasLHV > 0 ? (gasPowerLHV_local / S.gasLHV) : 0;
        } else {
          // -----------------------------------------------------------------
          // Fuel-Driven: Gas is leading, calculate resulting steam output
          // -----------------------------------------------------------------
          if (S.gasInputMode === 'volume') {
            gasFlowRate_local = S.gasFlowRate;
            gasPowerLHV_local = gasFlowRate_local * S.gasLHV;
            gasPowerHHV_local = gasFlowRate_local * S.gasHHV;
          } else if (S.gasInputMode === 'lhv') {
            gasPowerLHV_local = S.gasInputValue;
            gasPowerHHV_local = S.gasInputValue * (S.gasHHV / S.gasLHV);
            gasFlowRate_local = S.gasLHV > 0 ? (S.gasInputValue / S.gasLHV) : 0;
          } else {
            gasPowerHHV_local = S.gasInputValue;
            gasPowerLHV_local = S.gasHHV > 0 ? (S.gasInputValue * S.gasLHV / S.gasHHV) : 0;
            gasFlowRate_local = S.gasHHV > 0 ? (S.gasInputValue / S.gasHHV) : 0;
          }

          const Q_transferred_daea = gasPowerLHV_local * combustEff_local / 100;
          const d_p = hSteam - hFW_daea;
          const d_m = hFW_daea - hMakeup_local;
          const d_c = hFW_daea - hCond;

          if (S.waterInputMode === 'makeup') {
            const makeupFlowConst = S.makeupFlowManual;

            if (S.bdMode === 'manual') {
              x_bd_local = S.bdFlowManual;
              const f_bd = x_bd_local / 100;
              const P1 = (d_p - f_bd * d_c) > 0 ? (d_c * (1 + f_bd)) / (d_p - f_bd * d_c) : 0;
              const P2 = (d_p - f_bd * d_c) > 0 ? (makeupFlowConst * (d_m - d_c)) / (d_p - f_bd * d_c) : 0;
              const K1 = f_bd * (1 + P1);
              const K2 = f_bd * P2;
              const A_final = (1 + P1) * H_D_local + K1 * H_E_local;
              const B_final = P2 * H_D_local + K2 * H_E_local;
              usersSteamFlow_local = A_final > 0 ? Math.max(0, (Q_transferred_daea * 3600 - B_final) / A_final) : 0;
              peggingSteamFlow_local = P1 * usersSteamFlow_local + P2;
              boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
              mBlowdown_local = K1 * usersSteamFlow_local + K2;
              condFlow_local = usersSteamFlow_local + mBlowdown_local - makeupFlowConst;
              makeupFlow_local = makeupFlowConst;
            } else {
              // S.bdMode === 'auto'
              const denBD = S.boilerConductivity - S.condConductivity;
              const K1 = denBD > 0 ? S.condConductivity / denBD : 0.25;
              const K2 = denBD > 0 ? makeupFlowConst * (S.makeupConductivity - S.condConductivity) / denBD : 0;
              const K1_clamped = K1 > 0.25 ? 0.25 : K1;
              const K2_clamped = K1 > 0.25 ? 0 : K2;
              const P1 = d_p > 0 ? (d_c * (1 + K1_clamped)) / d_p : 0;
              const P2 = d_p > 0 ? (K2_clamped * d_c + makeupFlowConst * (d_m - d_c)) / d_p : 0;
              const A_final = (1 + P1) * H_D_local + K1_clamped * H_E_local;
              const B_final = P2 * H_D_local + K2_clamped * H_E_local;
              usersSteamFlow_local = A_final > 0 ? Math.max(0, (Q_transferred_daea * 3600 - B_final) / A_final) : 0;
              peggingSteamFlow_local = P1 * usersSteamFlow_local + P2;
              boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
              mBlowdown_local = K1_clamped * usersSteamFlow_local + K2_clamped;
              condFlow_local = usersSteamFlow_local + mBlowdown_local - makeupFlowConst;
              makeupFlow_local = makeupFlowConst;
            }

            if (condFlow_local < 0) {
              condFlow_local = 0;
              if (S.bdMode === 'manual') {
                const f_bd = S.bdFlowManual / 100;
                const den = d_p + (1 - f_bd) * d_m;
                makeupFlow_local = den > 0 ? (1 + f_bd) * usersSteamFlow_local * d_p / den : usersSteamFlow_local;
                peggingSteamFlow_local = makeupFlow_local * d_m / d_p;
                mBlowdown_local = f_bd * (usersSteamFlow_local + peggingSteamFlow_local);
              } else {
                const factor = d_p + d_m - d_p * S.makeupConductivity / S.boilerConductivity;
                makeupFlow_local = factor > 0 ? (usersSteamFlow_local * d_p) / factor : usersSteamFlow_local;
                mBlowdown_local = makeupFlow_local * S.makeupConductivity / S.boilerConductivity;
              }
              boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
              fwFlow_local = boilerSteamFlow_local + mBlowdown_local;
            } else {
              fwFlow_local = boilerSteamFlow_local + mBlowdown_local;
            }
          } else {
            // Condensate-Led Mode
            let r_cond = 0;
            let Q_cond_coeff = 0;
            let Q_cond_const = 0;

            if (S.condFlowAuto) {
              r_cond = S.condPctManual / 100;
              Q_cond_coeff = r_cond * (hCond - hMakeup_local);
              Q_cond_const = 0;
            } else {
              r_cond = 0;
              Q_cond_coeff = 0;
              Q_cond_const = S.condReturnFlowManual * (hCond - hMakeup_local);
            }

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

              const X_coeff = (1 + K1) * H_A_local - Q_cond_coeff;
              const Y_const = K2 * H_A_local - Q_cond_const;
              const denPeg = H_B_local - H_A_local;

              P1 = denPeg > 0 ? (X_coeff / denPeg) : 0;
              P2 = denPeg > 0 ? (Y_const / denPeg) : 0;
            } else {
              x_bd_local = S.bdFlowManual;
              const B = 1 + x_bd_local / 100;
              const denPeg = H_B_local - B * H_A_local;

              if (S.condFlowAuto) {
                P1 = denPeg > 0 ? (B * H_A_local - Q_cond_coeff) / denPeg : 0;
                P2 = 0;
              } else {
                P1 = denPeg > 0 ? (B * H_A_local) / denPeg : 0;
                P2 = denPeg > 0 ? (-Q_cond_const) / denPeg : 0;
              }

              K1 = (1 + P1) * (x_bd_local / 100);
              K2 = P2 * (x_bd_local / 100);
            }

            const A_final = (1 + P1) * H_D_local + K1 * H_E_local;
            const B_final = P2 * H_D_local + K2 * H_E_local;

            usersSteamFlow_local = A_final > 0 ? Math.max(0, (Q_transferred_daea * 3600 - B_final) / A_final) : 0;
            peggingSteamFlow_local = P1 * usersSteamFlow_local + P2;
            boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
            mBlowdown_local = K1 * usersSteamFlow_local + K2;
            fwFlow_local = boilerSteamFlow_local + mBlowdown_local;
            condFlow_local = S.condFlowAuto 
              ? (usersSteamFlow_local * S.condPctManual / 100)
              : Math.min(S.condReturnFlowManual, usersSteamFlow_local);
            makeupFlow_local = Math.max(0, fwFlow_local - condFlow_local - peggingSteamFlow_local);
          }
          x_bd_local = boilerSteamFlow_local > 0 ? (mBlowdown_local / boilerSteamFlow_local * 100) : 0;
        }

        // Solve common properties
        fwConductivity_local = fwFlow_local > 0
          ? (condFlow_local * S.condConductivity + makeupFlow_local * S.makeupConductivity) / fwFlow_local
          : 0;
        flueLossKW_local = gasPowerLHV_local * flueLossPct_local / 100;
        radLossKW_local = gasPowerLHV_local * S.radLossPct / 100;

        pinchHeat_local = (pinchActive && S.ecoEnabled && makeupFlow_local > 0 && fwFlow_local > 0)
          ? (makeupFlow_local * 4.186 * (tMakeupEffective_local - S.makeupTemp) / 3600)
          : 0;
        tFWEffective_local = (pinchActive && S.ecoEnabled && makeupFlow_local > 0 && fwFlow_local > 0)
          ? (tDaea - (pinchHeat_local * 3600) / (fwFlow_local * 4.186))
          : tDaea;

        // Solve economizer performance
        if (S.ecoEnabled) {
          const lossBefore = flueGasLossPct(S.flueGasTemp, S.airTempIn, S.o2Flue);
          const lossAfter = flueGasLossPct(S.ecoFlueTempOut, S.airTempIn, S.o2Flue);
          const K_coeff = (0.37 / (21 - S.o2Flue) - 0.009);
          const C_gas = gasPowerLHV_local * K_coeff / 100;
          const C_water = fwFlow_local * 4.187 / 3600;

          // 1. Calculate design UA with Pinch HX disabled (using S.makeupTemp and tDaea)
          const ecoHeat_design = Math.max(0, gasPowerLHV_local * (lossBefore - lossAfter) / 100);
          const ecoDt_design = fwFlow_local > 0 ? (ecoHeat_design * 3600 / (fwFlow_local * 4.187)) : 0;
          const tFW_out_design = tDaea + ecoDt_design;
          const dT1_design = S.flueGasTemp - tFW_out_design;
          const dT2_design = S.ecoFlueTempOut - tDaea;
          if (dT1_design > 0 && dT2_design > 0) {
            if (Math.abs(dT1_design - dT2_design) < 0.1) {
              ecoLMTD_local = dT1_design;
            } else {
              ecoLMTD_local = (dT1_design - dT2_design) / Math.log(dT1_design / dT2_design);
            }
            ecoUA_local = ecoLMTD_local > 0 ? (ecoHeat_design / ecoLMTD_local) : 0;
          }

          if (pinchActive) {
            // Pinch HX is active: solve performance using constant fixedUA if provided, otherwise ecoUA_local
            tWaterIn_local = tFWEffective_local;
            const targetUA = fixedUA !== undefined ? fixedUA : ecoUA_local;
            
            if (C_gas > 0 && C_water > 0 && targetUA > 0) {
              const C_min_eco = Math.min(C_gas, C_water);
              const C_max_eco = Math.max(C_gas, C_water);
              const C_r_eco = C_min_eco / C_max_eco;
              const NTU = targetUA / C_min_eco;
              let epsilon = 0;
              if (Math.abs(C_r_eco - 1.0) < 0.01) {
                epsilon = NTU / (1 + NTU);
              } else {
                const expVal = Math.exp(-NTU * (1 - C_r_eco));
                epsilon = (1 - expVal) / (1 - C_r_eco * expVal);
              }
              epsilon = Math.max(0, Math.min(1.0, epsilon));
              ecoHeat_local = epsilon * C_min_eco * (S.flueGasTemp - tWaterIn_local);
              ecoFlueTempOutClamped_local = S.flueGasTemp - ecoHeat_local / C_gas;
              ecoDt_local = ecoHeat_local * 3600 / (fwFlow_local * 4.187);
              tFW_out_local = tWaterIn_local + ecoDt_local;

              // Recalculate LMTD for display
              const dT1 = S.flueGasTemp - tFW_out_local;
              const dT2 = ecoFlueTempOutClamped_local - tWaterIn_local;
              if (dT1 > 0 && dT2 > 0) {
                if (Math.abs(dT1 - dT2) < 0.1) {
                  ecoLMTD_local = dT1;
                } else {
                  ecoLMTD_local = (dT1 - dT2) / Math.log(dT1 / dT2);
                }
              }
              ecoUA_local = targetUA;
            } else {
              ecoHeat_local = ecoHeat_design;
              tFW_out_local = tFW_out_design;
            }
          } else {
            // Pinch HX is disabled: use design values
            ecoHeat_local = ecoHeat_design;
            ecoDt_local = ecoDt_design;
            tFW_out_local = tFW_out_design;
            tWaterIn_local = tDaea;
          }
        }
      }

      return {
        ecoFlueTempOutClamped: ecoFlueTempOutClamped_local,
        flueTempEff: flueTempEff_local,
        flueLossPct: flueLossPct_local,
        combustEff: combustEff_local,
        usersSteamFlow: usersSteamFlow_local,
        peggingSteamFlow: peggingSteamFlow_local,
        boilerSteamFlow: boilerSteamFlow_local,
        mBlowdown: mBlowdown_local,
        fwFlow: fwFlow_local,
        condFlow: condFlow_local,
        makeupFlow: makeupFlow_local,
        x_bd: x_bd_local,
        gasFlowRate: gasFlowRate_local,
        gasPowerLHV: gasPowerLHV_local,
        gasPowerHHV: gasPowerHHV_local,
        fwConductivity: fwConductivity_local,
        flueLossKW: flueLossKW_local,
        radLossKW: radLossKW_local,
        pinchHeat: pinchHeat_local,
        tFWEffective: tFWEffective_local,
        ecoHeat: ecoHeat_local,
        ecoDt: ecoDt_local,
        ecoLMTD: ecoLMTD_local,
        ecoUA: ecoUA_local,
        tFW_out: tFW_out_local,
      };
    };

    // Stage 1: Solve the base design case (always Pinch HX OFF)
    const design = solveBoilerHouse(false);
    const ecoUA_design = design.ecoUA;

    // Stage 2: Solve the actual operating case. If pinchEnabled is active, use Stage 1's design UA!
    const result = (S.pinchEnabled && S.ecoEnabled) ? solveBoilerHouse(true, ecoUA_design) : design;

    const ecoFlueTempOutClamped = result.ecoFlueTempOutClamped;
    const flueTempEff = result.flueTempEff;
    const flueLossPct = result.flueLossPct;
    const combustEff = result.combustEff;
    const usersSteamFlow = result.usersSteamFlow;
    const peggingSteamFlow = result.peggingSteamFlow;
    const boilerSteamFlow = result.boilerSteamFlow;
    const mBlowdown = result.mBlowdown;
    const fwFlow = result.fwFlow;
    const condFlow = result.condFlow;
    const makeupFlow = result.makeupFlow;
    const x_bd = result.x_bd;
    const gasFlowRate = result.gasFlowRate;
    const gasPowerLHV = result.gasPowerLHV;
    const gasPowerHHV = result.gasPowerHHV;
    const fwConductivity = result.fwConductivity;
    const flueLossKW = result.flueLossKW;
    const radLossKW = result.radLossKW;
    const pinchHeat = result.pinchHeat;
    const tFWEffective = result.tFWEffective;
    const ecoHeat = result.ecoHeat;
    const ecoDt = result.ecoDt;
    const ecoLMTD = result.ecoLMTD;
    const tFW_out = result.tFW_out;

    const tMakeupEffective = (S.pinchEnabled && S.ecoEnabled)
      ? (S.makeupTemp + 0.70 * (tDaea - S.makeupTemp))
      : S.makeupTemp;
    const hMakeup = enthalpyLiquid(tMakeupEffective);
const tFW = tFW_out;
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
      usersSteamFlow,
      tMakeupEffective,
      tFWEffective,
      pinchHeat,
      ecoUA_design
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
      y = 35 * scaleY;
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
                <span className="form-unit">kWh/Nm³</span>
              </div>
            </div>
            <div className="form-row">
              <label>Gas HHV</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  step="0.05"
                  min={1}
                  max={50}
                  defaultValue={10.35}
                  value={S.gasLHV}
                  onChange={(v) => {
                    setLeadingVariable('gas');
                    setS(prev => ({ ...prev, gasLHV: v }));
                  }}
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
              <ClampedNumericInput 
                min={-40}
                max={60}
                defaultValue={20}
                value={S.airTempIn}
                onChange={(v) => {
                  setLeadingVariable('gas');
                  setS(prev => ({ ...prev, airTempIn: v }));
                }}
              />
              <span className="form-unit">°C</span>
            </div>
          </div>
        );
      case 'economizerFlue': {
        // Calculate Pinch HX effectiveness, LMTD, and UA for display in the popup
        let pinchEffectivenessPct = 0;
        let pinchLMTD = 0;
        let pinchUA = 0;
        if (S.pinchEnabled && S.ecoEnabled && R.pinchHeat > 0) {
          const C_min_pinch = R.makeupFlow * 4.186 / 3600;
          const Q_max_pinch = C_min_pinch * (R.tDaea - S.makeupTemp);
          if (Q_max_pinch > 0) {
            pinchEffectivenessPct = Math.min(100, Math.max(0, (R.pinchHeat / Q_max_pinch) * 100));
          }

          const dT1 = R.tDaea - R.tMakeupEffective;
          const dT2 = R.tFWEffective - S.makeupTemp;
          if (dT1 > 0 && dT2 > 0) {
            if (Math.abs(dT1 - dT2) < 0.1) {
              pinchLMTD = dT1;
            } else {
              pinchLMTD = (dT1 - dT2) / Math.log(dT1 / dT2);
            }
            pinchUA = pinchLMTD > 0 ? (R.pinchHeat / pinchLMTD) : 0;
          }
        }

        return (
          <table className="popup-table">
            <tbody>

              <tr>
                <td style={{ width: '45%', textAlign: 'left' }}>Flue Gas O₂</td>
                <td style={{ width: '35%' }}>
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
                </td>
                <td style={{ width: '20%' }} className="display-val">%vol</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>Economizer</td>
                <td colSpan={2}>
                  <div className="toggle-group table-toggle">
                    <button 
                      className={`toggle-btn ${S.ecoEnabled ? 'active' : ''}`}
                      onClick={() => setS(prev => ({ ...prev, ecoEnabled: true }))}
                    >
                      Active
                    </button>
                    <button 
                      className={`toggle-btn ${!S.ecoEnabled ? 'active' : ''}`}
                      onClick={() => setS(prev => ({ ...prev, ecoEnabled: false, pinchEnabled: false }))}
                    >
                      Disabled
                    </button>
                  </div>
                </td>
              </tr>

              {S.ecoEnabled && (
                <>
                  {/* SECTION 2: Flue Gas Temperatures */}
                  <tr>
                    <td colSpan={3} className="section-title">Flue Gas Temperatures</td>
                  </tr>
                  <tr>
                    <td style={{ width: '50%', fontWeight: '500' }}>Boiler Outlet</td>
                    <td style={{ width: '50%', fontWeight: '500' }} colSpan={2}>After Eco</td>
                  </tr>
                  <tr>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
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
                        <span className="display-val">°C</span>
                      </div>
                    </td>
                    <td colSpan={2}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <ClampedNumericInput 
                          step="5"
                          min={Math.ceil(R.tDaea)}
                          max={300}
                          defaultValue={130}
                          value={Math.round(R.ecoFlueTempOutClamped)}
                          disabled={S.pinchEnabled}
                          onChange={(v) => {
                            setLeadingVariable('gas');
                            setS(prev => ({ ...prev, ecoFlueTempOut: v }));
                          }}
                        />
                        <span className="display-val">°C</span>
                      </div>
                    </td>
                  </tr>

                  {/* SECTION 3: FeedWater Temperature */}
                  <tr>
                    <td colSpan={3} className="section-title">FeedWater Temperature</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '500', fontSize: '0.7rem' }}>Pre-heated Makeup Water</td>
                    <td style={{ fontWeight: '500', fontSize: '0.7rem' }} colSpan={2}>Pinch HX Inlet / Deaerator Outlet</td>
                  </tr>
                  <tr>
                    <td className="display-val">{S.pinchEnabled ? `${R.tMakeupEffective.toFixed(1)} °C` : 'N/A'}</td>
                    <td colSpan={2} className="display-val">{R.tDaea.toFixed(1)} °C</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '500', fontSize: '0.7rem' }}>Pinch HX Outlet / Eco Inlet</td>
                    <td style={{ fontWeight: '500', fontSize: '0.7rem' }} colSpan={2}>Eco Outlet</td>
                  </tr>
                  <tr>
                    <td className="display-val">{S.pinchEnabled ? `${R.tFWEffective.toFixed(1)} °C` : 'N/A'}</td>
                    <td colSpan={2} className="display-val">{R.tFW.toFixed(1)} °C</td>
                  </tr>

                  {/* SECTION 4: Economizer Data */}
                  <tr>
                    <td colSpan={3} className="section-title">Economizer Data</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left' }}>Power Recovered</td>
                    <td className="display-val">{R.ecoHeat.toFixed(1)}</td>
                    <td className="display-val">kW</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '500' }}>LMTD</td>
                    <td style={{ fontWeight: '500' }} colSpan={2}>UA</td>
                  </tr>
                  <tr>
                    <td className="display-val">{R.ecoLMTD > 0 ? `${R.ecoLMTD.toFixed(1)} K` : 'N/A'}</td>
                    <td colSpan={2} className="display-val">{R.ecoUA_design > 0 ? `${R.ecoUA_design.toFixed(3)} kW/K` : 'N/A'}</td>
                  </tr>

                  {/* SECTION 5: Pinch HX Data */}
                  <tr>
                    <td colSpan={3} className="section-title">Pinch HX Data</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left' }}>Pinch HX</td>
                    <td colSpan={2}>
                      <div className="toggle-group table-toggle">
                        <button
                          className={`toggle-btn ${S.pinchEnabled ? 'active' : ''}`}
                          onClick={() => setS(prev => ({ ...prev, pinchEnabled: true }))}
                        >
                          Active
                        </button>
                        <button
                          className={`toggle-btn ${!S.pinchEnabled ? 'active' : ''}`}
                          onClick={() => setS(prev => ({ ...prev, pinchEnabled: false }))}
                        >
                          Disabled
                        </button>
                      </div>
                    </td>
                  </tr>
                  {S.pinchEnabled && (
                    <>
                      <tr>
                        <td style={{ textAlign: 'left' }}>Exchanged Power</td>
                        <td className="display-val">{R.pinchHeat.toFixed(1)}</td>
                        <td className="display-val">kW</td>
                      </tr>
                      <tr>
                        <td style={{ textAlign: 'left' }}>Effectiveness</td>
                        <td className="display-val">{pinchEffectivenessPct.toFixed(0)}</td>
                        <td className="display-val">%</td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: '500' }}>LMTD</td>
                        <td style={{ fontWeight: '500' }} colSpan={2}>UA</td>
                      </tr>
                      <tr>
                        <td className="display-val">{pinchLMTD > 0 ? `${pinchLMTD.toFixed(1)} K` : 'N/A'}</td>
                        <td colSpan={2} className="display-val">{pinchUA > 0 ? `${pinchUA.toFixed(3)} kW/K` : 'N/A'}</td>
                      </tr>
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
        );
      }
      case 'drumPressure':
        return (
          <div className="form-row">
            <label>Steam Drum Pressure</label>
            <div className="input-with-unit">
              <ClampedNumericInput 
                step="0.2"
                min={0.2}
                max={40}
                defaultValue={10}
                value={S.drumPressure}
                onChange={(v) => {
                  setLeadingVariable('steam');
                  setS(prev => ({ ...prev, drumPressure: v }));
                }}
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
              <label>Makeup Water Flow</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  min={0}
                  max={10000}
                  step={50}
                  defaultValue={300}
                  value={S.waterInputMode === 'makeup' ? S.makeupFlowManual : Math.round(R.makeupFlow)}
                  onChange={(v) => setS(prev => ({ ...prev, waterInputMode: 'makeup', makeupFlowManual: v }))}
                />
                <span className="form-unit">kg/h</span>
              </div>
            </div>
            <div className="form-row">
              <label>Makeup Water Temp</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  min={5}
                  max={40}
                  defaultValue={15}
                  value={S.makeupTemp}
                  onChange={(v) => setS(prev => ({ ...prev, makeupTemp: v }))}
                />
                <span className="form-unit">°C</span>
              </div>
            </div>
            <div className="form-row">
              <label>Makeup Water Conductivity</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  step={10}
                  min={10}
                  max={1000}
                  defaultValue={300}
                  value={S.makeupConductivity}
                  onChange={(v) => setS(prev => ({ ...prev, makeupConductivity: v }))}
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
              <ClampedNumericInput 
                step={50}
                min={100}
                max={10000}
                defaultValue={1000}
                value={leadingVariable === 'steam' ? S.steamFlowUsers : Math.round(R.usersSteamFlow)}
                onChange={(v) => {
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
                  onClick={() => setS(prev => ({ ...prev, condFlowAuto: true, waterInputMode: 'condensate' }))}
                >
                  Auto (%)
                </button>
                <button 
                  className={`toggle-btn ${!S.condFlowAuto ? 'active' : ''}`}
                  onClick={() => setS(prev => ({ ...prev, condFlowAuto: false, waterInputMode: 'condensate' }))}
                >
                  Manual (kg/h)
                </button>
              </div>
            </div>
            {S.condFlowAuto ? (
              <div className="form-row">
                <label>Condensate Return Rate</label>
                <div className="input-with-unit">
                  <ClampedNumericInput 
                    min={0}
                    max={100}
                    defaultValue={70}
                    value={S.condPctManual}
                    onChange={(v) => setS(prev => ({ ...prev, condPctManual: v, waterInputMode: 'condensate' }))}
                  />
                  <span className="form-unit">% steam</span>
                </div>
              </div>
            ) : (
              <div className="form-row">
                <label>Condensate Return Flow</label>
                <div className="input-with-unit">
                  <ClampedNumericInput 
                    step={50}
                    min={0}
                    defaultValue={700}
                    value={S.condReturnFlowManual}
                    onChange={(v) => setS(prev => ({ ...prev, condReturnFlowManual: v, waterInputMode: 'condensate' }))}
                  />
                  <span className="form-unit">kg/h</span>
                </div>
              </div>
            )}
            <div className="form-row">
              <label>Condensate Return Temp</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  min={20}
                  max={100}
                  defaultValue={80}
                  value={S.condReturnTemp}
                  onChange={(v) => setS(prev => ({ ...prev, condReturnTemp: v }))}
                />
                <span className="form-unit">°C</span>
              </div>
            </div>
            <div className="form-row">
              <label>Condensate Conductivity</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  step={5}
                  min={0}
                  max={500}
                  defaultValue={20}
                  value={S.condConductivity}
                  onChange={(v) => setS(prev => ({ ...prev, condConductivity: v }))}
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
                <ClampedNumericInput 
                  step={0.05}
                  min={0}
                  max={1.5}
                  defaultValue={0.2}
                  value={S.daeaPressure}
                  onChange={(v) => setS(prev => ({ ...prev, daeaPressure: v }))}
                />
                <span className="form-unit">bar(g)</span>
              </div>
            </div>
            <div className="form-row">
              <label>Deaerator Target Conductivity</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  min={0}
                  max={500}
                  defaultValue={20}
                  value={S.daeaConductivity}
                  onChange={(v) => setS(prev => ({ ...prev, daeaConductivity: v }))}
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
              gasLHV={S.gasLHV}
              gasHHV={S.gasHHV}
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
              ecoFlueTempOutClamped={R.ecoFlueTempOutClamped}
              daeaPressure={S.daeaPressure}
              daeaConductivity={S.daeaConductivity}
              tSat={R.tSat}
              tDaea={R.tDaea}
              excessAir={R.excessAir}
              pinchEnabled={S.pinchEnabled}
              boilerSteamFlow={R.boilerSteamFlow}
              onOpenPopup={handleOpenPopup}
              
            />
            {/* Floating input popup */}
            {popupKey && <div className="popup-backdrop" onClick={() => setPopupKey(null)} />}
            {popupKey && popupPos && (
              <div 
                className="param-popup-card" 
                style={{ left: popupPos.x, top: popupPos.y, width: popupKey === 'economizerFlue' ? '350px' : undefined }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="popup-header">
                  <h4>{popupKey === 'economizerFlue' ? 'Flue Gases' : popupKey.replace(/([A-Z])/g, ' $1')}</h4>
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