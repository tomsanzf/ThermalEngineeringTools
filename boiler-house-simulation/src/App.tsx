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
  ecoCondensingEnabled: boolean;
  // Blowdown recovery
  bdRecoveryEnabled: boolean;
  bdRecoveryEff: number;
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
  refTemp: number;
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
  ecoCondensingEnabled: false,
  bdRecoveryEnabled: false,
  bdRecoveryEff: 80,
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
  refTemp: 20,
};
export default function App() {
  const [S, setS] = useState<SimulationState>(DEFAULT_STATE);
  const [popupKey, setPopupKey] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isAnimationEnabled, setIsAnimationEnabled] = useState<boolean>(true);
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(false);
  const [leadingVariable, setLeadingVariable] = useState<'gas' | 'steam'>('steam');
  const [timeUnitMode, setTimeUnitMode] = useState<'hourly' | 'yearly'>('hourly');
  // Calculation Engine
  const R = useMemo(() => {
    // 1. Drum saturated states
    const tSat = satTempFromP(S.drumPressure);
    const hSteam = satEnthalpyVapour(tSat);
    const hLiqSat = satEnthalpyLiquid(tSat);
    // 2. Deaerator saturated states
    const tDaea = satTempFromP(S.daeaPressure);
    const hFW_daea = satEnthalpyLiquid(tDaea);
    const hPeggingSteam = hSteam;
    // 3. Enthalpies of incoming streams
    const hCond = enthalpyLiquid(S.condReturnTemp);
    const radLossPct = S.radLossPct;

    // Stoichiometric water vapor & dew point calculations
    const excessAir = excessAirFromO2(S.o2Flue);
    const e_air = excessAir / 100;
    const yH2O_in = 2.0 / (10.52 + 9.52 * e_air);
    const pH2O_in = yH2O_in * 1.01325; // bar
    const tDew = pH2O_in > 0 ? (243.5 * Math.log(pH2O_in / 0.006112)) / (17.67 - Math.log(pH2O_in / 0.006112)) : 0;

    const solveBoilerHouse = (pinchActive: boolean, fixedUA?: number) => {
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
      let qCondenser_local = 0;
      let qCondenserSensible_local = 0;
      let qCondenserLatent_local = 0;
      let mCondensateWater_local = 0;
      let qBdRecovery_local = 0;
      let mFlash_local = 0;
      let mBdLiq_local = 0;

      let ecoDt_local = 0;
      let ecoLMTD_local = 0;
      let ecoUA_local = 0;
      let tFW_out_local = tDaea;
      let tWaterIn_local = tDaea;

      let tMakeupEffective_local = S.makeupTemp;
      let hMakeup_local = enthalpyLiquid(tMakeupEffective_local);

      let ecoFlueTempOutClamped_local = S.ecoEnabled ? Math.max(105, S.ecoFlueTempOut) : S.flueGasTemp;
      let flueTempEff_local = ecoFlueTempOutClamped_local;
      let flueLossPct_local = flueGasLossPct(flueTempEff_local, S.airTempIn, S.o2Flue);
      let combustEff_local = Math.max(0, 100 - flueLossPct_local - radLossPct);

      // Run 5 iterations to solve the coupled efficiency, fuel, and preheating feedback loops
      for (let iter = 0; iter < 5; iter++) {
        // Intermediate & Stack gas temperatures
        let tFlueMid = S.flueGasTemp;
        if (S.ecoEnabled) {
          if (S.ecoCondensingEnabled) {
            tFlueMid = Math.max(105, S.ecoFlueTempOut);
            flueTempEff_local = S.ecoFlueTempOut;
            ecoFlueTempOutClamped_local = flueTempEff_local;
          } else {
            tFlueMid = S.ecoFlueTempOut;
            flueTempEff_local = S.ecoFlueTempOut;
            ecoFlueTempOutClamped_local = flueTempEff_local;
          }
        } else {
          tFlueMid = S.flueGasTemp;
          flueTempEff_local = S.flueGasTemp;
          ecoFlueTempOutClamped_local = flueTempEff_local;
        }

        // Stoichiometry flows based on current gas flow estimate
        const gasMolarFlow = gasFlowRate_local / 0.022414; // mol/h
        const nH2O_in = 2.0 * gasMolarFlow;
        const nDry = (8.52 + 9.52 * e_air) * gasMolarFlow;

        // Sensible heat recovered in standard economizer
        ecoHeat_local = S.ecoEnabled
          ? Math.max(0, (flueGasLossPct(S.flueGasTemp, S.airTempIn, S.o2Flue) - flueGasLossPct(tFlueMid, S.airTempIn, S.o2Flue)) / 100 * gasPowerLHV_local)
          : 0;

        // Sensible heat recovered in condensing economizer (Condenser)
        qCondenserSensible_local = (S.ecoEnabled && S.ecoCondensingEnabled)
          ? Math.max(0, (flueGasLossPct(tFlueMid, S.airTempIn, S.o2Flue) - flueGasLossPct(flueTempEff_local, S.airTempIn, S.o2Flue)) / 100 * gasPowerLHV_local)
          : 0;

        // Latent heat recovered in condensing economizer
        if (S.ecoEnabled && S.ecoCondensingEnabled && flueTempEff_local < tDew) {
          const pH2O_sat = 0.006112 * Math.exp((17.67 * flueTempEff_local) / (flueTempEff_local + 243.5)); // bar
          const nH2O_out = nDry * (pH2O_sat / (1.01325 - pH2O_sat)); // mol/h
          mCondensateWater_local = Math.max(0, nH2O_in - nH2O_out) * 0.018015; // kg/h
          qCondenserLatent_local = (mCondensateWater_local * 2440) / 3600; // kW
        } else {
          mCondensateWater_local = 0;
          qCondenserLatent_local = 0;
        }

        qCondenser_local = qCondenserSensible_local + qCondenserLatent_local;
        flueLossKW_local = (flueGasLossPct(flueTempEff_local, S.airTempIn, S.o2Flue) / 100 * gasPowerLHV_local);
        radLossKW_local = (radLossPct / 100 * gasPowerLHV_local);
        
        const latentGainPct = gasPowerLHV_local > 0 ? (qCondenserLatent_local / gasPowerLHV_local * 100) : 0;
        flueLossPct_local = flueGasLossPct(flueTempEff_local, S.airTempIn, S.o2Flue);
        combustEff_local = Math.max(0, 100 - flueLossPct_local - radLossPct + latentGainPct);

        // Preheating sequence for makeup water
        let tMakeup1 = S.makeupTemp;
        if (S.ecoEnabled && S.ecoCondensingEnabled) {
          tMakeup1 = S.makeupTemp + (makeupFlow_local > 0 ? (qCondenser_local * 3600) / (makeupFlow_local * 4.187) : 0);
          tMakeup1 = Math.min(tDaea, tMakeup1);
        }

        let tMakeup2 = tMakeup1;
        if (pinchActive && S.ecoEnabled) {
          tMakeup2 = tMakeup1 + 0.70 * (tDaea - tMakeup1);
          tMakeup2 = Math.min(tDaea, tMakeup2);
        }

        let tMakeup3 = tMakeup2;
        if (S.bdRecoveryEnabled) {
          const x_flash = Math.max(0, (hLiqSat - hFW_daea) / (satEnthalpyVapour(tDaea) - hFW_daea));
          mFlash_local = mBlowdown_local * x_flash;
          mBdLiq_local = mBlowdown_local - mFlash_local;
          
          const C_bd = (mBdLiq_local * 4.187) / 3600; // kW/K
          const C_mu = (makeupFlow_local * 4.187) / 3600; // kW/K
          const C_min = Math.min(C_bd, C_mu);
          const qMax_bd = C_min * (tDaea - tMakeup2);
          qBdRecovery_local = (S.bdRecoveryEff / 100) * qMax_bd;
          tMakeup3 = tMakeup2 + (makeupFlow_local > 0 ? (qBdRecovery_local * 3600) / (makeupFlow_local * 4.187) : 0);
          tMakeup3 = Math.min(tDaea, tMakeup3);
        } else {
          mFlash_local = 0;
          mBdLiq_local = mBlowdown_local;
          qBdRecovery_local = 0;
        }

        tMakeupEffective_local = tMakeup3;
        hMakeup_local = enthalpyLiquid(tMakeupEffective_local);

        const d_p = hSteam - hFW_daea;
        const d_m = hFW_daea - hMakeup_local;
        const d_c = hFW_daea - hCond;
        const d_flash = satEnthalpyVapour(tDaea) - hFW_daea;

        const H_A_local = d_m;
        const H_D_local = d_p;
        const H_E_local = hLiqSat - hFW_daea;

        if (leadingVariable === 'steam') {
          usersSteamFlow_local = S.steamFlowUsers;
          if (S.waterInputMode === 'makeup') {
            makeupFlow_local = S.makeupFlowManual;
            if (S.bdMode === 'auto') {
              const a1 = d_p + d_c;
              const b1 = -d_p;
              const c1 = usersSteamFlow_local * d_p - makeupFlow_local * (d_p + d_m) + mFlash_local * d_flash;
              const a2 = S.condConductivity;
              const b2 = -S.boilerConductivity;
              const c2 = -makeupFlow_local * S.makeupConductivity;
              const det = a1 * b2 - a2 * b1;
              if (det !== 0) {
                condFlow_local = (c1 * b2 - c2 * b1) / det;
                mBlowdown_local = (a1 * c2 - a2 * c1) / det;
              }
              const maxBD = usersSteamFlow_local * 0.25;
              if (mBlowdown_local > maxBD) {
                mBlowdown_local = maxBD;
                condFlow_local = (d_p + d_c) > 0 ? ((usersSteamFlow_local + mBlowdown_local) * d_p - makeupFlow_local * (d_p + d_m) + mFlash_local * d_flash) / (d_p + d_c) : 0;
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
              peggingSteamFlow_local = (makeupFlow_local * d_m + condFlow_local * d_c - mFlash_local * d_flash) / d_p;
              peggingSteamFlow_local = Math.max(0, peggingSteamFlow_local);
              boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
              fwFlow_local = boilerSteamFlow_local + mBlowdown_local;
              x_bd_local = boilerSteamFlow_local > 0 ? (mBlowdown_local / boilerSteamFlow_local * 100) : 0;
            } else {
              x_bd_local = S.bdFlowManual;
              const f_bd = x_bd_local / 100;
              const den = d_p - f_bd * d_c;
              condFlow_local = den > 0 ? (usersSteamFlow_local * (1 + f_bd) * d_p - makeupFlow_local * (d_p - f_bd * d_m) + mFlash_local * d_flash) / den : 0;
              if (condFlow_local < 0) {
                condFlow_local = 0;
                makeupFlow_local = (d_p + (1 - f_bd) * d_m) > 0 ? (1 + f_bd) * usersSteamFlow_local * d_p / (d_p + (1 - f_bd) * d_m) : usersSteamFlow_local;
                peggingSteamFlow_local = makeupFlow_local * d_m / d_p;
                mBlowdown_local = f_bd * (usersSteamFlow_local + peggingSteamFlow_local);
              } else {
                peggingSteamFlow_local = (makeupFlow_local * d_m + condFlow_local * d_c - mFlash_local * d_flash) / d_p;
                peggingSteamFlow_local = Math.max(0, peggingSteamFlow_local);
                mBlowdown_local = f_bd * (usersSteamFlow_local + peggingSteamFlow_local);
              }
              fwFlow_local = usersSteamFlow_local + peggingSteamFlow_local + mBlowdown_local;
              boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
              x_bd_local = boilerSteamFlow_local > 0 ? (mBlowdown_local / boilerSteamFlow_local * 100) : 0;
            }
          } else {
            condFlow_local = S.condFlowAuto
              ? (usersSteamFlow_local * S.condPctManual / 100)
              : Math.min(S.condReturnFlowManual, usersSteamFlow_local);

            if (S.bdMode === 'auto') {
              const num = condFlow_local * S.condConductivity + (usersSteamFlow_local - condFlow_local) * S.makeupConductivity;
              const den = S.boilerConductivity - S.makeupConductivity;
              const maxBD = usersSteamFlow_local * 0.25;
              mBlowdown_local = den > 0 ? Math.min(maxBD, Math.max(0, num / den)) : maxBD;

              const numPeg = (usersSteamFlow_local + mBlowdown_local) * H_A_local - condFlow_local * (hCond - hMakeup_local) - mFlash_local * d_flash;
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
              peggingSteamFlow_local = (E - C) > 0 ? Math.max(0, (usersSteamFlow_local * C - D - mFlash_local * d_flash) / (E - C)) : 0;
              boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
              mBlowdown_local = boilerSteamFlow_local * (x_bd_local / 100);
              fwFlow_local = boilerSteamFlow_local + mBlowdown_local;
              x_bd_local = boilerSteamFlow_local > 0 ? (mBlowdown_local / boilerSteamFlow_local * 100) : 0;
            }
            makeupFlow_local = Math.max(0, fwFlow_local - condFlow_local - peggingSteamFlow_local - mFlash_local);
          }

          const Q_transferred_daea = (boilerSteamFlow_local / 3600) * (hSteam - hFW_daea) + (mBlowdown_local / 3600) * (hLiqSat - hFW_daea);
          gasPowerLHV_local = combustEff_local > 0 ? (Q_transferred_daea * 100 / combustEff_local) : 0;
          gasPowerHHV_local = gasPowerLHV_local * (S.gasHHV / S.gasLHV);
          gasFlowRate_local = S.gasLHV > 0 ? (gasPowerLHV_local / S.gasLHV) : 0;
        } else {
          // Fuel-Driven
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

          if (S.waterInputMode === 'makeup') {
            const makeupFlowConst = S.makeupFlowManual;
            if (S.bdMode === 'manual') {
              x_bd_local = S.bdFlowManual;
              const f_bd = x_bd_local / 100;
              const P1 = (d_p - f_bd * d_c) > 0 ? (d_c * (1 + f_bd)) / (d_p - f_bd * d_c) : 0;
              const P2 = (d_p - f_bd * d_c) > 0 ? (makeupFlowConst * (d_m - d_c) - mFlash_local * d_flash) / (d_p - f_bd * d_c) : 0;
              const K1 = f_bd * (1 + P1);
              const K2 = f_bd * P2;
              const A_final = (1 + P1) * H_D_local + K1 * H_E_local;
              const B_final = P2 * H_D_local + K2 * H_E_local;
              usersSteamFlow_local = A_final > 0 ? Math.max(0, (Q_transferred_daea * 3600 - B_final) / A_final) : 0;
              peggingSteamFlow_local = P1 * usersSteamFlow_local + P2;
              peggingSteamFlow_local = Math.max(0, peggingSteamFlow_local);
              boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
              mBlowdown_local = K1 * usersSteamFlow_local + K2;
              condFlow_local = usersSteamFlow_local + mBlowdown_local - makeupFlowConst;
              makeupFlow_local = makeupFlowConst;
            } else {
              const denBD = S.boilerConductivity - S.condConductivity;
              const K1 = denBD > 0 ? S.condConductivity / denBD : 0.25;
              const K2 = denBD > 0 ? makeupFlowConst * (S.makeupConductivity - S.condConductivity) / denBD : 0;
              const K1_clamped = K1 > 0.25 ? 0.25 : K1;
              const K2_clamped = K1 > 0.25 ? 0 : K2;
              const P1 = d_p > 0 ? (d_c * (1 + K1_clamped)) / d_p : 0;
              const P2 = d_p > 0 ? (K2_clamped * d_c + makeupFlowConst * (d_m - d_c) - mFlash_local * d_flash) / d_p : 0;
              const A_final = (1 + P1) * H_D_local + K1_clamped * H_E_local;
              const B_final = P2 * H_D_local + K2_clamped * H_E_local;
              usersSteamFlow_local = A_final > 0 ? Math.max(0, (Q_transferred_daea * 3600 - B_final) / A_final) : 0;
              peggingSteamFlow_local = P1 * usersSteamFlow_local + P2;
              peggingSteamFlow_local = Math.max(0, peggingSteamFlow_local);
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
                peggingSteamFlow_local = (makeupFlow_local * d_m - mFlash_local * d_flash) / d_p;
                peggingSteamFlow_local = Math.max(0, peggingSteamFlow_local);
                mBlowdown_local = f_bd * (usersSteamFlow_local + peggingSteamFlow_local);
              } else {
                const factor = d_p + d_m - d_p * S.makeupConductivity / S.boilerConductivity;
                makeupFlow_local = factor > 0 ? (usersSteamFlow_local * d_p) / factor : usersSteamFlow_local;
                mBlowdown_local = makeupFlow_local * S.makeupConductivity / S.boilerConductivity;
                peggingSteamFlow_local = (makeupFlow_local * d_m - mFlash_local * d_flash) / d_p;
                peggingSteamFlow_local = Math.max(0, peggingSteamFlow_local);
              }
              boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
              fwFlow_local = boilerSteamFlow_local + mBlowdown_local;
            }
          } else {
            // Solve usersSteamFlow_local iteratively since it depends on Q_transferred_daea
            const f_bd = boilerSteamFlow_local > 0 ? (mBlowdown_local / boilerSteamFlow_local) : (S.bdFlowManual / 100);
            const f_c = usersSteamFlow_local > 0 ? (condFlow_local / usersSteamFlow_local) : (S.condPctManual / 100);

            const E = hPeggingSteam - hMakeup_local;
            const den_boiler = d_p + f_bd * H_E_local;
            boilerSteamFlow_local = den_boiler > 0 ? (Q_transferred_daea * 3600) / den_boiler : 0;
            mBlowdown_local = f_bd * boilerSteamFlow_local;

            const num_users = boilerSteamFlow_local * E - mBlowdown_local * d_m + mFlash_local * d_flash;
            const den_users = E + d_m - f_c * (hCond - hMakeup_local);
            usersSteamFlow_local = den_users > 0 ? Math.max(0, num_users / den_users) : 0;

            condFlow_local = S.condFlowAuto
              ? (usersSteamFlow_local * S.condPctManual / 100)
              : Math.min(S.condReturnFlowManual, usersSteamFlow_local);

            if (S.bdMode === 'auto') {
              const num = condFlow_local * S.condConductivity + (usersSteamFlow_local - condFlow_local) * S.makeupConductivity;
              const den = S.boilerConductivity - S.makeupConductivity;
              const maxBD = usersSteamFlow_local * 0.25;
              mBlowdown_local = den > 0 ? Math.min(maxBD, Math.max(0, num / den)) : maxBD;
              
              const numPeg = (usersSteamFlow_local + mBlowdown_local) * H_A_local - condFlow_local * (hCond - hMakeup_local) - mFlash_local * d_flash;
              const denPeg = hPeggingSteam - hFW_daea;
              peggingSteamFlow_local = denPeg > 0 ? Math.max(0, numPeg / denPeg) : 0;
            } else {
              x_bd_local = S.bdFlowManual;
              const B_factor = 1 + x_bd_local / 100;
              const C_factor = B_factor * H_A_local;
              const D_factor = condFlow_local * (hCond - hMakeup_local);
              const E_factor = hPeggingSteam - hMakeup_local;
              peggingSteamFlow_local = (E_factor - C_factor) > 0 ? Math.max(0, (usersSteamFlow_local * C_factor - D_factor - mFlash_local * d_flash) / (E_factor - C_factor)) : 0;
              mBlowdown_local = (usersSteamFlow_local + peggingSteamFlow_local) * (x_bd_local / 100);
            }
            boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
            fwFlow_local = boilerSteamFlow_local + mBlowdown_local;
            x_bd_local = boilerSteamFlow_local > 0 ? (mBlowdown_local / boilerSteamFlow_local * 100) : 0;
            makeupFlow_local = Math.max(0, fwFlow_local - condFlow_local - peggingSteamFlow_local - mFlash_local);
          }
        }
      }

      // Heat exchanger pinch sizing calculations if active
      if (S.ecoEnabled) {
        tWaterIn_local = tDaea;
        if (fixedUA !== undefined) {
          const tWaterOut_est = tWaterIn_local + (ecoHeat_local * 3600) / (fwFlow_local * 4.187);
          tFW_out_local = Math.min(tSat - 5, tWaterOut_est);
        } else {
          tFW_out_local = tWaterIn_local + (ecoHeat_local * 3600) / (fwFlow_local * 4.187);
          tFW_out_local = Math.min(tSat - 5, tFW_out_local);
          ecoHeat_local = (fwFlow_local / 3600) * 4.187 * (tFW_out_local - tWaterIn_local);
        }
        
        const dt_in = S.flueGasTemp - tFW_out_local;
        const dt_out = ecoFlueTempOutClamped_local - tWaterIn_local;
        ecoDt_local = dt_in - dt_out;
        if (dt_in > 0 && dt_out > 0 && Math.abs(dt_in - dt_out) > 0.01) {
          ecoLMTD_local = (dt_in - dt_out) / Math.log(dt_in / dt_out);
        } else {
          ecoLMTD_local = (dt_in + dt_out) / 2;
        }
        ecoUA_local = ecoLMTD_local > 0 ? (ecoHeat_local / ecoLMTD_local) : 0;
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
        qCondenser: qCondenser_local,
        qCondenserSensible: qCondenserSensible_local,
        qCondenserLatent: qCondenserLatent_local,
        mCondensateWater: mCondensateWater_local,
        qBdRecovery: qBdRecovery_local,
        mFlash: mFlash_local,
        mBdLiq: mBdLiq_local,
        tMakeupEffective: tMakeupEffective_local,
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
    const qCondenser = result.qCondenser;
    const qCondenserSensible = result.qCondenserSensible;
    const qCondenserLatent = result.qCondenserLatent;
    const mCondensateWater = result.mCondensateWater;
    const qBdRecovery = result.qBdRecovery;
    const mFlash = result.mFlash;
    const mBdLiq = result.mBdLiq;
    const tMakeupEffective = result.tMakeupEffective;

    const tFW = tFW_out;
    const hFW = satEnthalpyLiquid(tFW);

    // Boiler Heat transfer & efficiency
    const steamHeatTransferred = (boilerSteamFlow / 3600) * (hSteam - hFW); // kW
    const blowdownHeatLoss = (mBlowdown / 3600) * (hLiqSat - hFW); // kW
    const totalBoilerHeat = steamHeatTransferred + blowdownHeatLoss; // kW
    const boilerEff = gasPowerLHV > 0
      ? Math.max(0, (steamHeatTransferred / gasPowerLHV) * 100)
      : 0;
    // Overall Boilerhouse Efficiency
    const hRef = enthalpyLiquid(S.refTemp);
    const Q_export_net = (usersSteamFlow / 3600) * (hSteam - hRef) - (condFlow / 3600) * (hCond - hRef);

    const bhEff = gasPowerHHV > 0
      ? Math.max(0, (Q_export_net / gasPowerHHV) * 100)
      : 0;
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
      ecoUA_design,
      hRef,
      hCond,
      tDew,
      qCondenser,
      qCondenserSensible,
      qCondenserLatent,
      mCondensateWater,
      qBdRecovery,
      mFlash,
      mBdLiq
    };
  }, [S, leadingVariable]);
  // Click handlers
  const handleOpenPopup = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPopupKey(key);
    setPopupPos({ x: 12, y: 12 });
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

            <div className="form-row">
              <label>Unit Basis</label>
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${timeUnitMode === 'hourly' ? 'active' : ''}`}
                  onClick={() => setTimeUnitMode('hourly')}
                >
                  Hourly
                </button>
                <button
                  className={`toggle-btn ${timeUnitMode === 'yearly' ? 'active' : ''}`}
                  onClick={() => setTimeUnitMode('yearly')}
                >
                  Yearly
                </button>
              </div>
            </div>
          </>
        );
      case 'gasInput': {
        const mult = timeUnitMode === 'yearly' ? 8.76 : 1.0;
        const mainLabel = timeUnitMode === 'yearly'
          ? (S.gasInputMode === 'volume' ? 'Yearly Volume' : S.gasInputMode === 'lhv' ? 'Yearly Energy (LHV)' : 'Yearly Energy (HHV)')
          : (S.gasInputMode === 'volume' ? 'Volume Flow' : S.gasInputMode === 'lhv' ? 'LHV Power' : 'HHV Power');
        const mainUnit = timeUnitMode === 'yearly'
          ? (S.gasInputMode === 'volume' ? 'kNm³' : 'MWh')
          : (S.gasInputMode === 'volume' ? 'Nm³/h' : 'kW');

        const val_raw = leadingVariable === 'gas'
          ? (S.gasInputMode === 'volume' ? S.gasFlowRate : S.gasInputValue)
          : (S.gasInputMode === 'volume' ? R.gasFlowRate : (S.gasInputMode === 'lhv' ? R.gasPowerLHV : R.gasPowerHHV));

        const valueToShow = timeUnitMode === 'yearly' ? Math.round(val_raw * mult) : Number((val_raw * mult).toFixed(1));

        return (
          <>
            <div className="form-row">
              <label>Input Mode</label>
              <select 
                value={S.gasInputMode} 
                onChange={(e) => handleGasModeChange(e.target.value as any)}
              >
                <option value="volume">{timeUnitMode === 'yearly' ? 'Yearly volume' : 'Volume flow'}</option>
                <option value="lhv">{timeUnitMode === 'yearly' ? 'Yearly Energy (LHV)' : 'Power (LHV)'}</option>
                <option value="hhv">{timeUnitMode === 'yearly' ? 'Yearly Energy (HHV)' : 'Power (HHV)'}</option>
              </select>
            </div>
            <div className="form-row">
              <label>{mainLabel}</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  min={0}
                  defaultValue={100}
                  value={valueToShow}
                  onChange={(v) => {
                    setLeadingVariable('gas');
                    const hourlyVal = v / mult;
                    setS(prev => ({
                      ...prev,
                      gasInputValue: hourlyVal,
                      gasFlowRate: prev.gasInputMode === 'volume' ? hourlyVal : prev.gasFlowRate
                    }));
                  }}
                />
                <span className="form-unit">{mainUnit}</span>
              </div>
            </div>
            <div className="form-row">
              <label>Gas LHV</label>
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
            <div className="form-row">
              <label>Gas HHV</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  step="0.05"
                  min={1}
                  max={50}
                  defaultValue={11.63}
                  value={S.gasHHV}
                  onChange={(v) => {
                    setLeadingVariable('gas');
                    setS(prev => ({ ...prev, gasHHV: v }));
                  }}
                />
                <span className="form-unit">kWh/Nm³</span>
              </div>
            </div>
          </>
        );
      }
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
                <tr>
                  <td style={{ textAlign: 'left' }}>Condensing Mode</td>
                  <td colSpan={2}>
                    <div className="toggle-group table-toggle">
                      <button
                        className={`toggle-btn ${S.ecoCondensingEnabled ? 'active' : ''}`}
                        onClick={() => setS(prev => ({ ...prev, ecoCondensingEnabled: true }))}
                      >
                        Active
                      </button>
                      <button
                        className={`toggle-btn ${!S.ecoCondensingEnabled ? 'active' : ''}`}
                        onClick={() => setS(prev => ({ ...prev, ecoCondensingEnabled: false }))}
                      >
                        Disabled
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {!S.ecoEnabled && (
                <>
                  <tr>
                    <td colSpan={3} className="section-title">Flue Gas Temperature</td>
                  </tr>
                  <tr>
                    <td style={{ width: '45%', textAlign: 'left' }}>Boiler Outlet Temp</td>
                    <td style={{ width: '35%' }}>
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
                    </td>
                    <td style={{ width: '20%' }} className="display-val">°C</td>
                  </tr>
                </>
              )}

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
                          min={S.ecoCondensingEnabled ? 30 : Math.ceil(R.tDaea)}
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
                    <td style={{ fontWeight: '500', fontSize: '0.7rem' }}>{S.pinchEnabled ? 'Pre-heated Makeup Water' : 'Makeup Water'}</td>
                    <td style={{ fontWeight: '500', fontSize: '0.7rem' }} colSpan={2}>{S.pinchEnabled ? 'Pinch HX Inlet / Deaerator Outlet' : 'Deaerator Outlet'}</td>
                  </tr>
                  <tr>
                    <td className="display-val">{S.pinchEnabled ? `${R.tMakeupEffective.toFixed(1)} °C` : `${S.makeupTemp.toFixed(1)} °C`}</td>
                    <td colSpan={2} className="display-val">{R.tDaea.toFixed(1)} °C</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '500', fontSize: '0.7rem' }}>{S.pinchEnabled ? 'Pinch HX Outlet / Eco Inlet' : 'Eco Inlet'}</td>
                    <td style={{ fontWeight: '500', fontSize: '0.7rem' }} colSpan={2}>Eco Outlet</td>
                  </tr>
                  <tr>
                    <td className="display-val">{S.pinchEnabled ? `${R.tFWEffective.toFixed(1)} °C` : `${R.tDaea.toFixed(1)} °C`}</td>
                    <td colSpan={2} className="display-val">{R.tFW.toFixed(1)} °C</td>
                  </tr>

                  {/* SECTION 3B: Condenser Data */}
                  {S.ecoEnabled && S.ecoCondensingEnabled && (
                    <>
                      <tr>
                        <td colSpan={3} className="section-title">Condenser Data</td>
                      </tr>
                      <tr>
                        <td style={{ textAlign: 'left' }}>Flue Dew Point</td>
                        <td className="display-val">{R.tDew.toFixed(1)}</td>
                        <td className="display-val">°C</td>
                      </tr>
                      <tr>
                        <td style={{ textAlign: 'left' }}>Water Condensed</td>
                        <td className="display-val">{fmtVal(R.mCondensateWater * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)}</td>
                        <td className="display-val">{timeUnitMode === 'yearly' ? 't' : 'kg/h'}</td>
                      </tr>
                      <tr>
                        <td style={{ textAlign: 'left' }}>Latent Heat Recovered</td>
                        <td className="display-val">{fmtVal(R.qCondenserLatent * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)}</td>
                        <td className="display-val">{timeUnitMode === 'yearly' ? 'MWh' : 'kW'}</td>
                      </tr>
                    </>
                  )}

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
      case 'bdFlow':
      case 'boilerConductivity':
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
            
            {/* Blowdown Heat Recovery */}
            <hr style={{ margin: '1rem 0', borderColor: 'rgba(255,255,255,0.08)' }} />
            <div className="form-row">
              <label>Blowdown Heat Recovery</label>
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${S.bdRecoveryEnabled ? 'active' : ''}`}
                  onClick={() => setS(prev => ({ ...prev, bdRecoveryEnabled: true }))}
                >
                  Active
                </button>
                <button
                  className={`toggle-btn ${!S.bdRecoveryEnabled ? 'active' : ''}`}
                  onClick={() => setS(prev => ({ ...prev, bdRecoveryEnabled: false }))}
                >
                  Disabled
                </button>
              </div>
            </div>
            {S.bdRecoveryEnabled && (
              <>
                <div className="form-row">
                  <label>Recovery HX Effectiveness</label>
                  <div className="input-with-unit">
                    <ClampedNumericInput
                      step={1}
                      min={50}
                      max={95}
                      defaultValue={80}
                      value={S.bdRecoveryEff}
                      onChange={(v) => setS(prev => ({ ...prev, bdRecoveryEff: v }))}
                    />
                    <span className="form-unit">%</span>
                  </div>
                </div>
                <div className="form-row">
                  <label>Calculated Flash Steam</label>
                  <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text)', padding: '0.2rem 0' }}>
                    {fmtVal(R.mFlash * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 't' : 'kg/h'}
                  </div>
                </div>
                <div className="form-row">
                  <label>Recovered Heat Power</label>
                  <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text)', padding: '0.2rem 0' }}>
                    {fmtVal(R.qBdRecovery * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}
                  </div>
                </div>
              </>
            )}
          </>
        );
      case 'makeupFlow': {
        const mult = timeUnitMode === 'yearly' ? 8.76 : 1.0;
        const valueToShow = Math.round((S.waterInputMode === 'makeup' ? S.makeupFlowManual : R.makeupFlow) * mult);
        return (
          <>
            <div className="form-row">
              <label>{timeUnitMode === 'yearly' ? 'Yearly Makeup Water Flow' : 'Makeup Water Flow'}</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  min={0}
                  max={timeUnitMode === 'yearly' ? 87600 : 10000}
                  step={timeUnitMode === 'yearly' ? 500 : 50}
                  defaultValue={timeUnitMode === 'yearly' ? 2628 : 300}
                  value={valueToShow}
                  onChange={(v) => setS(prev => ({ ...prev, waterInputMode: 'makeup', makeupFlowManual: v / mult }))}
                />
                <span className="form-unit">{timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
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
      }
      case 'steamFlow': {
        const mult = timeUnitMode === 'yearly' ? 8.76 : 1.0;
        const valueToShow = Math.round((leadingVariable === 'steam' ? S.steamFlowUsers : R.usersSteamFlow) * mult);
        return (
          <div className="form-row">
            <label>{timeUnitMode === 'yearly' ? 'Yearly Steam Demand to Users' : 'Steam Demand to Users'}</label>
            <div className="input-with-unit">
              <ClampedNumericInput 
                step={timeUnitMode === 'yearly' ? 500 : 50}
                min={timeUnitMode === 'yearly' ? 876 : 100}
                max={timeUnitMode === 'yearly' ? 87600 : 10000}
                defaultValue={timeUnitMode === 'yearly' ? 8760 : 1000}
                value={valueToShow}
                onChange={(v) => {
                  setLeadingVariable('steam');
                  setS(prev => ({ ...prev, steamFlowUsers: v / mult }));
                }}
              />
              <span className="form-unit">{timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
            </div>
          </div>
        );
      }
      case 'condReturnFlow': {
        const mult = timeUnitMode === 'yearly' ? 8.76 : 1.0;
        const valueToShow = Math.round((S.condFlowAuto ? R.condFlow : S.condReturnFlowManual) * mult);
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
                  Manual ({timeUnitMode === 'yearly' ? 't' : 'kg/h'})
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
                <label>{timeUnitMode === 'yearly' ? 'Yearly Condensate Return Flow' : 'Condensate Return Flow'}</label>
                <div className="input-with-unit">
                  <ClampedNumericInput 
                    step={timeUnitMode === 'yearly' ? 500 : 50}
                    min={0}
                    defaultValue={timeUnitMode === 'yearly' ? 6132 : 700}
                    value={valueToShow}
                    onChange={(v) => setS(prev => ({ ...prev, condReturnFlowManual: v / mult, waterInputMode: 'condensate' }))}
                  />
                  <span className="form-unit">{timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
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
              <label>Condensate Return Conductivity</label>
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
      }
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
  const fmtVal = (val: number | undefined, dec: number = 0) => {
    if (val === undefined || isNaN(val)) return '—';
    const actualDec = (timeUnitMode === 'yearly' && val > 10) ? 0 : dec;
    const formatted = val.toFixed(actualDec);
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return parts.join('.');
  };
  return (
    <div className={`app-container ${isDarkMode ? '' : 'light-theme'}`}>
      {/* Header bar */}
      <header className="dashboard-header">
        <div className="logo-area" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.75rem' }}>
            <a 
              href="../../"
              className="back-btn"
              title="Back to Landing Page"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                textDecoration: 'none',
                fontSize: '1.2rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--gas)';
                e.currentTarget.style.color = '#000';
                e.currentTarget.style.borderColor = 'var(--gas)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.color = 'var(--text)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              ←
            </a>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="logo-tag">ARMSTRONG INTERNATIONAL</span>
              <h1 className="logo-title" style={{ margin: 0, lineHeight: 1.2 }}>BoilerHouse Sim</h1>
            </div>
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
              timeUnitMode={timeUnitMode}
              gasFlowRate={R.gasFlowRate}
              gasInputMode={S.gasInputMode}
              gasLHV={S.gasLHV}
              gasHHV={S.gasHHV}
              gasPowerLHV={R.gasPowerLHV}
              gasPowerHHV={R.gasPowerHHV}
              airTempIn={S.airTempIn}
              o2Flue={S.o2Flue}
              flueGasTemp={S.flueGasTemp}
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
              mFlash={R.mFlash}
              mCondensateWater={R.mCondensateWater}
              Q_users_kW={R.Q_export_net}
              condPct={R.condPct}
              condReturnTemp={S.condReturnTemp}
              condConductivity={S.condConductivity}
              peggingSteamFlow={R.peggingSteamFlow}
              ecoEnabled={S.ecoEnabled}
              ecoHeat={R.ecoHeat}
              ecoFlueTempOut={S.ecoFlueTempOut}
              ecoFlueTempOutClamped={R.ecoFlueTempOutClamped}
              ecoCondensingEnabled={S.ecoCondensingEnabled}
              qCondenser={R.qCondenser}
              bdRecoveryEnabled={S.bdRecoveryEnabled}
              daeaPressure={S.daeaPressure}
              daeaConductivity={S.daeaConductivity}
              tSat={R.tSat}
              tDaea={R.tDaea}
              excessAir={R.excessAir}
              pinchEnabled={S.pinchEnabled}
              boilerSteamFlow={R.boilerSteamFlow}
              onOpenPopup={handleOpenPopup}
              onActivateFeature={(key) => setS(prev => ({ ...prev, [key]: true }))}
            />
            {/* Collapsible legend overlay */}
            <div className={`legend-overlay ${isLegendOpen ? 'open' : ''}`}>
              <button className="legend-toggle" onClick={() => setIsLegendOpen(!isLegendOpen)}>
                {isLegendOpen ? 'Hide Legend ▲' : 'Show Legend ▼'}
              </button>
              {isLegendOpen && (
                <div className="legend-content">
                  <div className="legend-item"><span className="legend-color gas"></span> Fuel Gas</div>
                  <div className="legend-item"><span className="legend-color air"></span> Fresh Air</div>
                  <div className="legend-item"><span className="legend-color steam"></span> Steam</div>
                  <div className="legend-item"><span className="legend-color water"></span> Feedwater</div>
                  <div className="legend-item"><span className="legend-color condensate"></span> Condensate</div>
                  <div className="legend-item"><span className="legend-color blowdown"></span> Blowdown</div>
                  <div className="legend-item"><span className="legend-color flue"></span> Flue Gas</div>
                </div>
              )}
            </div>
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
          <h3>Mass and Energy Flows</h3>
        </div>
        <div className="sidebar-content">
          {/* Header row */}
          <div className="balance-row three-cols" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem', marginBottom: '0.4rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
            <span className="balance-col-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Item</span>
            <span className="balance-col-mass" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Mass Flow</span>
            <span className="balance-col-energy" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Energy Flow</span>
          </div>

          {/* 1. Fuel Input */}
          <div className="balance-group">
            <span className="balance-group-title">Fuel Input</span>
            <div className="balance-row three-cols">
              <span className="balance-col-label">Gas (LHV)</span>
              <span className="balance-col-mass" style={{ color: 'var(--gas)' }}>{fmtVal(R.gasFlowRate * 0.717 * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
              <span className="balance-col-energy" style={{ color: 'var(--gas)' }}>{fmtVal(R.gasPowerLHV * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}</span>
            </div>
            <div className="balance-row three-cols">
              <span className="balance-col-label">Gas (HHV)</span>
              <span className="balance-col-mass" style={{ color: 'var(--gas)' }}>{fmtVal(R.gasFlowRate * 0.717 * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
              <span className="balance-col-energy" style={{ color: 'var(--gas)' }}>{fmtVal(R.gasPowerHHV * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}</span>
            </div>
            <div className="balance-row three-cols">
              <span className="balance-col-label">Excess Air Ratio</span>
              <span className="balance-col-mass">—</span>
              <span className="balance-col-energy">{fmtVal(R.excessAir, 0)}%</span>
            </div>
          </div>

          {/* 2. Boiler Losses */}
          <div className="balance-group">
            <span className="balance-group-title">Boiler Heat Losses</span>
            
            {/* Radiation Loss */}
            <div className="balance-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ flex: 1, textAlign: 'left', fontSize: '0.75rem' }}>Radiation Loss</span>
              <span style={{ width: '95px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--steam)', whiteSpace: 'nowrap' }}>
                {fmtVal(R.radLossKW * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'} ({fmtVal(S.radLossPct, 0)}%)
              </span>
            </div>

            {/* Flue Stack (Sensible) */}
            <div className="balance-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ flex: 1, textAlign: 'left', fontSize: '0.75rem' }}>Flue Stack (Sensible)</span>
              <span style={{ width: '95px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--steam)', whiteSpace: 'nowrap' }}>
                {fmtVal(R.flueLossKW * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'} ({fmtVal(R.flueLossPct, 0)}%)
              </span>
            </div>

            {/* Total Losses (LHV) */}
            <div className="balance-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '0.2rem' }}>
              <span style={{ flex: 1, textAlign: 'left', fontSize: '0.75rem' }}>Total Losses (LHV)</span>
              <span style={{ width: '95px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--steam)', whiteSpace: 'nowrap' }}>
                {fmtVal((R.flueLossKW + R.radLossKW) * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}
              </span>
            </div>

            {/* Flue Stack (Latent) */}
            <div className="balance-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ flex: 1, textAlign: 'left', fontSize: '0.75rem' }}>Flue Stack (Latent)</span>
              <span style={{ width: '95px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--steam)', whiteSpace: 'nowrap' }}>
                {fmtVal((R.gasPowerHHV - R.gasPowerLHV) * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}
              </span>
            </div>

            {/* Total Losses (HHV) */}
            <div className="balance-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '0.2rem' }}>
              <span style={{ flex: 1, textAlign: 'left', fontSize: '0.75rem' }}>Total Losses (HHV)</span>
              <span style={{ width: '95px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--steam)', whiteSpace: 'nowrap' }}>
                {fmtVal((R.flueLossKW + R.radLossKW + (R.gasPowerHHV - R.gasPowerLHV)) * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}
              </span>
            </div>
          </div>

          {/* 3. Steam Generation */}
          <div className="balance-group">
            <span className="balance-group-title">Steam Generation</span>
            <div className="balance-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.3rem' }}>
              <span className="balance-label" style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Ref. Temp:</span>
              <div className="input-with-unit" style={{ width: '130px', display: 'flex', alignItems: 'center' }}>
                <ClampedNumericInput
                  step="1"
                  min={0}
                  max={250}
                  defaultValue={20}
                  value={S.refTemp}
                  onChange={(v) => setS(prev => ({ ...prev, refTemp: v }))}
                />
                <span className="form-unit" style={{ fontSize: '0.65rem', marginLeft: '2px' }}>°C</span>
              </div>
            </div>
            <div className="balance-row three-cols">
              <span className="balance-col-label">Boiler Steam</span>
              <span className="balance-col-mass" style={{ color: 'var(--steam)' }}>{fmtVal(R.boilerSteamFlow * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
              <span className="balance-col-energy" style={{ color: 'var(--steam)' }}>{fmtVal(((R.boilerSteamFlow / 3600) * (R.hSteam - R.hRef)) * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}</span>
            </div>
            <div className="balance-row three-cols">
              <span className="balance-col-label">Pegging Steam</span>
              <span className="balance-col-mass" style={{ color: 'var(--steam)' }}>{fmtVal(R.peggingSteamFlow * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
              <span className="balance-col-energy" style={{ color: 'var(--steam)' }}>{fmtVal(((R.peggingSteamFlow / 3600) * (R.hSteam - R.hRef)) * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}</span>
            </div>
            <div className="balance-row three-cols">
              <span className="balance-col-label">Blowdown</span>
              <span className="balance-col-mass" style={{ color: 'var(--blowdown)' }}>{fmtVal(R.mBlowdown * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
              <span className="balance-col-energy" style={{ color: 'var(--blowdown)' }}>{fmtVal(((R.mBlowdown / 3600) * (R.hLiqSat - R.hRef)) * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}</span>
            </div>
            <div className="balance-row three-cols" style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '0.2rem' }}>
              <span className="balance-col-label">Total Boiler Heat</span>
              <span className="balance-col-mass" style={{ color: 'var(--water)' }}>{fmtVal(R.fwFlow * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
              <span className="balance-col-energy" style={{ color: 'var(--water)' }}>{fmtVal((((R.usersSteamFlow / 3600) * (R.hSteam - R.hRef)) + ((R.peggingSteamFlow / 3600) * (R.hSteam - R.hRef)) + ((R.mBlowdown / 3600) * (R.hLiqSat - R.hRef))) * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}</span>
            </div>
          </div>

          {/* 4. Users */}
          <div className="balance-group">
            <span className="balance-group-title">Steam Users</span>
            <div className="balance-row three-cols">
              <span className="balance-col-label">Steam Supply</span>
              <span className="balance-col-mass" style={{ color: 'var(--steam)' }}>{fmtVal(R.usersSteamFlow * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
              <span className="balance-col-energy" style={{ color: 'var(--steam)' }}>{fmtVal(((R.usersSteamFlow / 3600) * (R.hSteam - R.hRef)) * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}</span>
            </div>
            <div className="balance-row three-cols">
              <span className="balance-col-label">Condensate Return</span>
              <span className="balance-col-mass" style={{ color: 'var(--condensate)' }}>{fmtVal(R.condFlow * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
              <span className="balance-col-energy" style={{ color: 'var(--condensate)' }}>{fmtVal(((R.condFlow / 3600) * (R.hCond - R.hRef)) * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}</span>
            </div>
            <div className="balance-row three-cols" style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '0.2rem', fontWeight: 'bold' }}>
              <span className="balance-col-label">Net Consumed</span>
              <span className="balance-col-mass" style={{ color: 'var(--text)' }}>{fmtVal((R.usersSteamFlow - R.condFlow) * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
              <span className="balance-col-energy" style={{ color: 'var(--text)' }}>{fmtVal(R.Q_export_net * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}</span>
            </div>
          </div>

          {/* 5. Feedwater Loop */}
          <div className="balance-group">
            <span className="balance-group-title">Feedwater Loop</span>
            <div className="balance-row three-cols">
              <span className="balance-col-label">DA Outlet (FW)</span>
              <span className="balance-col-mass" style={{ color: 'var(--water)' }}>{fmtVal(R.fwFlow * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
              <span className="balance-col-energy" style={{ color: 'var(--water)' }}>{fmtVal(((R.fwFlow / 3600) * (R.hFW_daea - R.hRef)) * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}</span>
            </div>
            {S.pinchEnabled && S.ecoEnabled && (
              <div className="balance-row three-cols">
                <span className="balance-col-label">Pinch HX Outlet</span>
                <span className="balance-col-mass" style={{ color: 'var(--water)' }}>{fmtVal(R.fwFlow * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
                <span className="balance-col-energy" style={{ color: 'var(--water)' }}>{fmtVal(((R.fwFlow / 3600) * (enthalpyLiquid(R.tFWEffective) - R.hRef)) * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}</span>
              </div>
            )}
            <div className="balance-row three-cols">
              <span className="balance-col-label">ECO Outlet (to drum)</span>
              <span className="balance-col-mass" style={{ color: 'var(--water)' }}>{fmtVal(R.fwFlow * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 't' : 'kg/h'}</span>
              <span className="balance-col-energy" style={{ color: 'var(--water)' }}>{fmtVal(((R.fwFlow / 3600) * (R.hFW - R.hRef)) * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}</span>
            </div>
          </div>

          {/* 6. Heat Recovery */}
          <div className="balance-group">
            <span className="balance-group-title">Heat Recovery</span>
            
            {/* Pinch HX */}
            {S.ecoEnabled && S.pinchEnabled && (
              <div className="balance-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ flex: 1, textAlign: 'left', fontSize: '0.75rem' }}>Pinch HX</span>
                <span style={{ width: '95px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#4ade80', whiteSpace: 'nowrap' }}>
                  {fmtVal(R.pinchHeat * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}
                </span>
              </div>
            )}

            {/* Economizer (Sensible) */}
            {S.ecoEnabled && (
              <div className="balance-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ flex: 1, textAlign: 'left', fontSize: '0.75rem' }}>Economizer (Sensible)</span>
                <span style={{ width: '95px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#4ade80', whiteSpace: 'nowrap' }}>
                  {fmtVal(R.ecoHeat * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}
                </span>
              </div>
            )}

            {/* Condenser (Sensible) */}
            {S.ecoEnabled && S.ecoCondensingEnabled && (
              <div className="balance-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ flex: 1, textAlign: 'left', fontSize: '0.75rem' }}>Condenser (Sensible)</span>
                <span style={{ width: '95px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#4ade80', whiteSpace: 'nowrap' }}>
                  {fmtVal(R.qCondenserSensible * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}
                </span>
              </div>
            )}

            {/* Condenser (Latent) */}
            {S.ecoEnabled && S.ecoCondensingEnabled && (
              <div className="balance-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ flex: 1, textAlign: 'left', fontSize: '0.75rem' }}>Condenser (Latent)</span>
                <span style={{ width: '95px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#4ade80', whiteSpace: 'nowrap' }}>
                  {fmtVal(R.qCondenserLatent * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}
                </span>
              </div>
            )}

            {/* Blowdown Recovery */}
            {S.bdRecoveryEnabled && (
              <div className="balance-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ flex: 1, textAlign: 'left', fontSize: '0.75rem' }}>Blowdown Recovery</span>
                <span style={{ width: '95px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#4ade80', whiteSpace: 'nowrap' }}>
                  {fmtVal(R.qBdRecovery * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}
                </span>
              </div>
            )}

            {/* No active HR */}
            {(!S.ecoEnabled && !S.bdRecoveryEnabled) && (
              <div className="balance-row" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                No active heat recovery systems
              </div>
            )}
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