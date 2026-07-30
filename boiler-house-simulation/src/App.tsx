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
  daeaCondMode: 'auto' | 'manual';
  daeaConductivityManual: number;
  daeaTempMode: 'auto' | 'manual';
  daeaTempManual: number;
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
  ecoFlueTempOutManual: number;
  ecoUAMode: 'auto_ua' | 'manual_temp';
  ecoUA_design: number;
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
  ecoFlueTempOutManual: 130,
  ecoUAMode: 'manual_temp',
  ecoUA_design: 15.0,
  pinchEnabled: false,
  ecoCondensingEnabled: false,
  bdRecoveryEnabled: false,
  bdRecoveryEff: 80,
  daeaPressure: 0.2,
  daeaConductivity: 20,
  daeaCondMode: 'auto',
  daeaConductivityManual: 20,
  daeaTempMode: 'auto',
  daeaTempManual: 105.1,
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
    const tDaeaSat = satTempFromP(S.daeaPressure);
    const tDaea = S.daeaTempMode === 'manual'
      ? Math.max(10, Math.min(tDaeaSat, S.daeaTempManual))
      : tDaeaSat;
    const hFW_daea = satEnthalpyLiquid(tDaea);
        // 3. Enthalpies of incoming streams
    const hCond = enthalpyLiquid(S.condReturnTemp);
    const radLossPct = S.radLossPct;

    // Stoichiometric water vapor & dew point calculations
    const excessAir = excessAirFromO2(S.o2Flue);
    const e_air = excessAir / 100;
    const yH2O_in = 2.0 / (10.52 + 9.52 * e_air);
    const pH2O_in = yH2O_in * 1.01325; // bar
    const tDew = pH2O_in > 0 ? (243.5 * Math.log(pH2O_in / 0.006112)) / (17.67 - Math.log(pH2O_in / 0.006112)) : 0;

    const solveBoilerHouse = (_pinchActive: boolean, fixedUA?: number) => {
      let usersSteamFlow_local = S.steamFlowUsers;
      let peggingSteamFlow_local = 0;
      let boilerSteamFlow_local = S.steamFlowUsers * 1.1;
      let mBlowdown_local = S.steamFlowUsers * 0.05;
      let fwFlow_local = S.steamFlowUsers * 1.15;
      let condFlow_local = S.steamFlowUsers * (S.condPctManual / 100);
      let makeupFlow_local = Math.max(0, fwFlow_local - condFlow_local);
      let x_bd_local = 0;

      let gasFlowRate_local = S.gasFlowRate;
      let gasPowerLHV_local = S.gasInputValue;
      if (S.gasInputMode === 'volume') {
        gasFlowRate_local = S.gasInputValue;
        gasPowerLHV_local = gasFlowRate_local * S.gasLHV;
      } else if (S.gasInputMode === 'lhv') {
        gasPowerLHV_local = S.gasInputValue;
        gasFlowRate_local = S.gasLHV > 0 ? gasPowerLHV_local / S.gasLHV : 0;
      } else {
        gasPowerLHV_local = S.gasHHV > 0 ? (S.gasInputValue * S.gasLHV / S.gasHHV) : S.gasInputValue;
        gasFlowRate_local = S.gasLHV > 0 ? gasPowerLHV_local / S.gasLHV : 0;
      }
      let gasPowerHHV_local = gasPowerLHV_local * (S.gasHHV / (S.gasLHV || 1));

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

      let tMakeupEffective_local = S.makeupTemp;
      let hMakeup_local = enthalpyLiquid(tMakeupEffective_local);

      let ecoFlueTempOutClamped_local = S.ecoEnabled ? Math.max(105, S.ecoFlueTempOutManual) : S.flueGasTemp;
      let flueTempEff_local = ecoFlueTempOutClamped_local;
      let flueLossPct_local = flueGasLossPct(flueTempEff_local, S.airTempIn, S.o2Flue);
      let combustEff_local = Math.max(0, 100 - flueLossPct_local - radLossPct);

      for (let iter = 0; iter < 5; iter++) {
        flueTempEff_local = S.flueGasTemp;

        // 1. Pinch HX pre-heating & pre-cooling sequence
        //    Uses a minimum approach temperature of 10°C at the hot end (T_DA - T_makeup_out >= 10°C).
        //    This is physically cleaner than a fixed UA or fixed effectiveness:
        //    it guarantees LMTD > 0 and prevents the T_makeup_out = T_DA (zero delta-T) problem.
        let tMakeup1 = S.makeupTemp;
        let tMakeup2 = tMakeup1;
        if (S.ecoEnabled && _pinchActive) {
          const PINCH_APPROACH_TEMP = 10.0; // °C minimum temperature difference at the hot end
          const C_mu = (makeupFlow_local * 4.187) / 3600;
          const C_fw = (fwFlow_local * 4.187) / 3600;

          // Hot end limit: makeup water outlet can be at most (T_DA - approach)
          const tMakeupOutMax = tDaea - PINCH_APPROACH_TEMP;

          // Only pre-heat if makeup is cooler than the limit
          if (tMakeup1 < tMakeupOutMax && C_mu > 0) {
            // Heat that would bring makeup to the approach limit
            const qMax_approach = C_mu * (tMakeupOutMax - tMakeup1);
            // Use the approach-limited heat, but don't exceed what FW can give
            const qMax_fw = C_fw * (tDaea - tMakeup1);
            pinchHeat_local = Math.min(qMax_approach, qMax_fw);

            tMakeup2 = tMakeup1 + (pinchHeat_local / C_mu);
            tMakeup2 = Math.min(tMakeupOutMax, tMakeup2);
          } else {
            pinchHeat_local = 0;
            tMakeup2 = tMakeup1;
          }

          tFWEffective_local = tDaea - (fwFlow_local > 0 ? (pinchHeat_local * 3600) / (fwFlow_local * 4.187) : 0);
        } else {
          pinchHeat_local = 0;
          tFWEffective_local = tDaea;
        }

        let tMakeup3 = tMakeup2;
        if (S.bdRecoveryEnabled) {
          const x_flash = Math.max(0, (hLiqSat - hFW_daea) / (satEnthalpyVapour(tDaeaSat) - hFW_daea));
          mFlash_local = mBlowdown_local * x_flash;
          mBdLiq_local = mBlowdown_local - mFlash_local;
          
          const C_bd = (mBdLiq_local * 4.187) / 3600; 
          const C_mu = (makeupFlow_local * 4.187) / 3600; 
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

        // 2. Economizer Heat Recovery
        const tWaterIn_local = (S.ecoEnabled && _pinchActive) ? tFWEffective_local : tDaea;
        const mFlueGas_kg_h = (gasFlowRate_local * 10.5);
        const C_flue = (mFlueGas_kg_h * 1.05) / 3600.0;
        const C_water = (fwFlow_local * 4.187) / 3600.0;

        if (S.ecoEnabled) {
          if (fixedUA === undefined) {
            ecoFlueTempOutClamped_local = Math.max(tWaterIn_local + 5.0, Math.min(S.flueGasTemp - 5.0, S.ecoFlueTempOutManual));
            // Eco heat from direct flue gas energy balance: Q = C_flue × (T_in - T_out)
            ecoHeat_local = Math.max(0, C_flue * (S.flueGasTemp - ecoFlueTempOutClamped_local));
            
            tFW_out_local = tWaterIn_local + (fwFlow_local > 0 ? (ecoHeat_local * 3600.0) / (fwFlow_local * 4.187) : 0);
            tFW_out_local = Math.min(tSat - 5.0, tFW_out_local);
            ecoHeat_local = (fwFlow_local / 3600.0) * 4.187 * (tFW_out_local - tWaterIn_local);
            
            const dt1 = S.flueGasTemp - tFW_out_local;
            const dt2 = ecoFlueTempOutClamped_local - tWaterIn_local;
            if (Math.abs(dt1 - dt2) < 1e-5 || dt1 <= 0 || dt2 <= 0) {
              ecoLMTD_local = (dt1 + dt2) / 2.0;
            } else {
              ecoLMTD_local = (dt1 - dt2) / Math.log(dt1 / dt2);
            }
            ecoUA_local = ecoLMTD_local > 0 ? (ecoHeat_local / ecoLMTD_local) : 0.5;
          } else {
            const ecoUA_use = fixedUA;
            const C_min = Math.min(C_flue, C_water);
            const C_max = Math.max(C_flue, C_water);
            const C_r = C_max > 0 ? C_min / C_max : 1.0;
            const NTU = C_min > 0 ? ecoUA_use / C_min : 0;
            
            let eps = 0;
            if (Math.abs(1.0 - C_r) < 1e-6) {
              eps = NTU / (1.0 + NTU);
            } else {
              eps = (1.0 - Math.exp(-NTU * (1.0 - C_r))) / (1.0 - C_r * Math.exp(-NTU * (1.0 - C_r)));
            }
            
            const qMax = C_min * (S.flueGasTemp - tWaterIn_local);
            ecoHeat_local = eps * qMax;
            
            tFW_out_local = tWaterIn_local + (C_water > 0 ? ecoHeat_local / C_water : 0);
            tFW_out_local = Math.min(tSat - 5.0, tFW_out_local);
            ecoHeat_local = C_water * (tFW_out_local - tWaterIn_local);
            
            ecoFlueTempOutClamped_local = S.flueGasTemp - (C_flue > 0 ? ecoHeat_local / C_flue : 0);
            ecoFlueTempOutClamped_local = Math.max(tWaterIn_local + 5.0, Math.min(S.flueGasTemp - 5.0, ecoFlueTempOutClamped_local));
            
            const dt1 = S.flueGasTemp - tFW_out_local;
            const dt2 = ecoFlueTempOutClamped_local - tWaterIn_local;
            if (Math.abs(dt1 - dt2) < 1e-5 || dt1 <= 0 || dt2 <= 0) {
              ecoLMTD_local = (dt1 + dt2) / 2.0;
            } else {
              ecoLMTD_local = (dt1 - dt2) / Math.log(dt1 / dt2);
            }
            ecoUA_local = ecoUA_use;
          }
        } else {
          ecoHeat_local = 0;
          tFW_out_local = tWaterIn_local;
          ecoFlueTempOutClamped_local = S.ecoFlueTempOutManual;
          ecoLMTD_local = 0;
          ecoUA_local = 0;
        }

        if (S.ecoEnabled && S.ecoCondensingEnabled) {
          const tFlueInCond = ecoFlueTempOutClamped_local;
          const tWaterInCond = S.makeupTemp;
          const dtInCond = Math.max(0, tFlueInCond - tWaterInCond);
          const tFlueOutCond = tWaterInCond + Math.min(20, dtInCond * 0.5);
          ecoFlueTempOutClamped_local = Math.max(S.airTempIn + 5, tFlueOutCond);
          
          qCondenserSensible_local = 50; 
          const y_H2O_in = 0.12; 
          const y_H2O_sat_out = Math.min(y_H2O_in * 0.9, Math.max(0.02, 0.01 + 0.002 * (ecoFlueTempOutClamped_local - 20)));
          const delta_y_H2O = Math.max(0, y_H2O_in - y_H2O_sat_out);
          mCondensateWater_local = mFlueGas_kg_h * delta_y_H2O; 
          qCondenserLatent_local = (mCondensateWater_local * 2440) / 3600; 
        } else {
          mCondensateWater_local = 0;
          qCondenserLatent_local = 0;
        }

        qCondenser_local = qCondenserSensible_local + qCondenserLatent_local;
        flueLossKW_local = (flueGasLossPct(ecoFlueTempOutClamped_local, S.airTempIn, S.o2Flue) / 100 * gasPowerLHV_local);
        radLossKW_local = (radLossPct / 100 * gasPowerLHV_local);
        
        const latentGainPct = gasPowerLHV_local > 0 ? (qCondenserLatent_local / gasPowerLHV_local * 100) : 0;
        flueLossPct_local = flueGasLossPct(ecoFlueTempOutClamped_local, S.airTempIn, S.o2Flue);
        combustEff_local = Math.max(0, 100 - flueLossPct_local - radLossPct + latentGainPct);

        // flueTempEff = the actual flue temperature leaving the boiler house (after eco/condenser)
        // When eco is active, this is ecoFlueTempOutClamped (the calculated exit temp, e.g. 130°C or lower).
        // Without eco it equals the raw boiler flue outlet (flueGasTemp).
        flueTempEff_local = S.ecoEnabled ? ecoFlueTempOutClamped_local : S.flueGasTemp;


        // 3. Mass & Energy Balances across Boiler House
        const d_p = hSteam - hFW_daea;
        const d_m = hFW_daea - hMakeup_local;
        const d_c = hFW_daea - hCond;
        
        if (leadingVariable === 'gas') {
          const Q_transferred_daea = gasPowerLHV_local * combustEff_local / 100;
          const Q_total_kJ_h = (Q_transferred_daea + ecoHeat_local) * 3600.0;

          // 1. Total boiler steam generated
          const M_boiler = Math.max(0, (Q_total_kJ_h - mBlowdown_local * (hLiqSat - hFW_daea)) / d_p);

          // 2. Pegging steam flow P
          if (S.condFlowAuto) {
            const r = S.condPctManual / 100;
            const num = (M_boiler + mBlowdown_local) * d_m - M_boiler * r * (d_m - d_c);
            const den = d_p + d_m - r * (d_m - d_c);
            peggingSteamFlow_local = Math.max(0, num / den);
            usersSteamFlow_local = M_boiler - peggingSteamFlow_local;
            condFlow_local = usersSteamFlow_local * r;
          } else {
            condFlow_local = S.condReturnFlowManual;
            peggingSteamFlow_local = Math.max(0, ((M_boiler + mBlowdown_local) * d_m - condFlow_local * (d_m - d_c)) / (d_p + d_m));
            usersSteamFlow_local = M_boiler - peggingSteamFlow_local;
          }
          boilerSteamFlow_local = M_boiler;

          const M_liquid = Math.max(0, fwFlow_local - peggingSteamFlow_local);
          const c_low = S.daeaCondMode === 'manual' ? S.daeaConductivityManual : Math.min(S.makeupConductivity, S.condConductivity);
          const c_high = S.daeaCondMode === 'manual' ? S.daeaConductivityManual : Math.max(S.makeupConductivity, S.condConductivity);
          const c_clamped = Math.max(c_low, Math.min(c_high, S.daeaConductivityManual));
          const condDelta = S.makeupConductivity - S.condConductivity;

          if (S.daeaCondMode === 'manual' && Math.abs(condDelta) > 0.01) {
            makeupFlow_local = (fwFlow_local * c_clamped - M_liquid * S.condConductivity) / condDelta;
            makeupFlow_local = Math.max(0, Math.min(M_liquid, makeupFlow_local));
            condFlow_local = Math.max(0, M_liquid - makeupFlow_local);
          } else {
            if (S.waterInputMode === 'condensate') {
              makeupFlow_local = Math.max(0, M_liquid - condFlow_local);
            } else {
              makeupFlow_local = Math.min(M_liquid, S.makeupFlowManual);
              condFlow_local = Math.max(0, M_liquid - makeupFlow_local);
            }
          }

          fwConductivity_local = fwFlow_local > 0
            ? (condFlow_local * S.condConductivity + makeupFlow_local * S.makeupConductivity) / fwFlow_local
            : S.makeupConductivity;

          if (S.bdMode === 'manual') {
            mBlowdown_local = usersSteamFlow_local * (S.bdFlowManual / 100);
          } else {
            mBlowdown_local = S.boilerConductivity > 0 ? (fwFlow_local * fwConductivity_local) / S.boilerConductivity : 0;
            if (mBlowdown_local > usersSteamFlow_local * 0.25) {
              mBlowdown_local = usersSteamFlow_local * 0.25;
            }
          }
          x_bd_local = usersSteamFlow_local > 0 ? (mBlowdown_local / usersSteamFlow_local) * 100 : 0;
        } else {
          usersSteamFlow_local = S.steamFlowUsers;
          if (S.condFlowAuto) {
            condFlow_local = usersSteamFlow_local * (S.condPctManual / 100);
          } else {
            condFlow_local = S.condReturnFlowManual;
          }
          // Iterate deaerator energy balance to find pegging steam flow (since fwFlow = usersSteam + peggingSteam + mBlowdown)
          let peggingSteam_est = peggingSteamFlow_local;
          for (let j = 0; j < 5; j++) {
            const fw_est = usersSteamFlow_local + peggingSteam_est + mBlowdown_local;
            peggingSteam_est = Math.max(0, (fw_est * d_m - condFlow_local * (d_m - d_c)) / (d_p + d_m));
          }
          peggingSteamFlow_local = peggingSteam_est;
          boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;
          makeupFlow_local = Math.max(0, boilerSteamFlow_local - condFlow_local);

          fwConductivity_local = fwFlow_local > 0
            ? (condFlow_local * S.condConductivity + makeupFlow_local * S.makeupConductivity) / fwFlow_local
            : S.makeupConductivity;

          if (S.bdMode === 'manual') {
            mBlowdown_local = usersSteamFlow_local * (S.bdFlowManual / 100);
          } else {
            mBlowdown_local = S.boilerConductivity > 0 ? (fwFlow_local * fwConductivity_local) / S.boilerConductivity : 0;
            if (mBlowdown_local > usersSteamFlow_local * 0.25) {
              mBlowdown_local = usersSteamFlow_local * 0.25;
            }
          }
          x_bd_local = usersSteamFlow_local > 0 ? (mBlowdown_local / usersSteamFlow_local) * 100 : 0;

          // Boiler furnace heat balance:
          // The boiler burner must supply the heat required to raise feedwater from its entering state
          // (tFW_out_local) to saturated steam (hSteam) and saturated liquid blowdown (hLiqSat).
          // Referenced to DA outlet (tDaea): Q_burner = (steam × d_p + blowdown × (hLiqSat - hFW_daea))/3600 - ecoHeat
          const Q_transferred_daea = Math.max(0,
            (((usersSteamFlow_local + peggingSteamFlow_local) * d_p
              + mBlowdown_local * (hLiqSat - hFW_daea)) / 3600)
            - ecoHeat_local
          );
          gasPowerLHV_local = combustEff_local > 0 ? (Q_transferred_daea * 100 / combustEff_local) : 0;
          gasPowerHHV_local = gasPowerLHV_local * (S.gasHHV / S.gasLHV);
          gasFlowRate_local = S.gasLHV > 0 ? (gasPowerLHV_local / S.gasLHV) : 0;
        }

        fwFlow_local = boilerSteamFlow_local + mBlowdown_local;
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

    // Stage 2: Solve the actual operating case using Stage 1's design UA!
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
      boilerConductivity: Math.round(boilerConductivity),
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
  const handleExportState = () => {
    try {
      const exportObj = {
        ...S,
        timeUnitMode,
        leadingVariable
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `BH_Sim_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      alert("Failed to export: " + err);
    }
  };

  const handleImportClick = () => {
    document.getElementById('state-import-input')?.click();
  };

  const handleImportState = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    fileReader.readAsText(files[0], "UTF-8");
    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && typeof parsed === 'object' && 'gasLHV' in parsed && 'drumPressure' in parsed && 'steamFlowUsers' in parsed) {
          // Restore timeUnitMode if present
          if (parsed.timeUnitMode === 'hourly' || parsed.timeUnitMode === 'yearly') {
            setTimeUnitMode(parsed.timeUnitMode);
          }
          // Restore leadingVariable if present
          if (parsed.leadingVariable === 'gas' || parsed.leadingVariable === 'steam') {
            setLeadingVariable(parsed.leadingVariable);
          }
          // Extract state properties
          const { timeUnitMode: _, leadingVariable: __, ...stateOnly } = parsed;
          setS({
            ...DEFAULT_STATE,
            ...stateOnly
          });
          alert("Simulation successfully imported!");
        } else {
          alert("Invalid state JSON file format.");
        }
      } catch (err) {
        alert("Failed to parse JSON file: " + err);
      }
      e.target.value = '';
    };
  };

  // Click handlers
  const handleOpenPopup = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPopupKey(key);
    setPopupPos({ x: 12, y: 12 });
  };
  const handleGasModeChange = (newMode: 'volume' | 'lhv' | 'hhv') => {
    setS(prev => {
      let newInputValue = prev.gasInputValue;
      if (newMode === 'volume') {
        newInputValue = R.gasFlowRate;
      } else if (newMode === 'lhv') {
        newInputValue = R.gasPowerLHV;
      } else if (newMode === 'hhv') {
        newInputValue = R.gasPowerHHV;
      }
      return {
        ...prev,
        gasInputMode: newMode,
        gasInputValue: newInputValue,
        gasFlowRate: R.gasFlowRate
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
                    <td style={{ width: '50%', fontWeight: '500' }}>Boiler Outlet (Flue In)</td>
                    <td style={{ width: '50%', fontWeight: '500' }} colSpan={2}>After Eco (Flue Out)</td>
                  </tr>
                  <tr>
                    <td className="display-val">{S.flueGasTemp} °C</td>
                    <td colSpan={2} className="display-val">
                      {S.pinchEnabled && S.ecoEnabled ? (
                        <span style={{ color: 'var(--accent-orange)', fontWeight: '600' }}>{R.ecoFlueTempOutClamped.toFixed(0)} °C</span>
                      ) : (
                        <ClampedNumericInput 
                          step="5"
                          min={Math.ceil(R.tDaea + 5)}
                          max={S.flueGasTemp - 5}
                          defaultValue={130}
                          value={S.ecoFlueTempOutManual}
                          onChange={(v) => {
                            setS(prev => ({ ...prev, ecoFlueTempOutManual: v }));
                          }}
                        />
                      )}
                    </td>
                  </tr>
                  
{/* SECTION 3: FeedWater Temperature */}  <tr>
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
                    setS(prev => ({ ...prev, bdMode: 'auto' }));
                  }}
                >
                  Auto
                </button>
                <button 
                  className={`toggle-btn ${S.bdMode === 'manual' ? 'active' : ''}`}
                  onClick={() => {
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
                  onChange={(v) => setS(prev => ({ ...prev, waterInputMode: 'makeup', makeupFlowManual: v / mult, daeaCondMode: 'auto' }))}
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
                  max={5000}
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
                  onClick={() => setS(prev => ({ ...prev, condFlowAuto: true, waterInputMode: 'condensate', daeaCondMode: 'auto' }))}
                >
                  Auto (%)
                </button>
                <button 
                  className={`toggle-btn ${!S.condFlowAuto ? 'active' : ''}`}
                  onClick={() => setS(prev => ({ ...prev, condFlowAuto: false, waterInputMode: 'condensate', daeaCondMode: 'auto' }))}
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
                    onChange={(v) => setS(prev => ({ ...prev, condPctManual: v, waterInputMode: 'condensate', daeaCondMode: 'auto' }))}
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
                    onChange={(v) => setS(prev => ({ ...prev, condReturnFlowManual: v / mult, waterInputMode: 'condensate', daeaCondMode: 'auto' }))}
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
                  step="0.01"
                  min={0.0}
                  max={2.0}
                  defaultValue={0.2}
                  value={S.daeaPressure}
                  onChange={(v) => setS(prev => {
                    const satT = satTempFromP(v);
                    const isManual = prev.daeaTempMode === 'manual';
                    const newMode = (isManual && prev.daeaTempManual < satT) ? 'manual' : 'auto';
                    return {
                      ...prev,
                      daeaPressure: v,
                      daeaTempMode: newMode,
                      daeaTempManual: isManual ? Math.min(satT, prev.daeaTempManual) : satT
                    };
                  })}
                />
                <span className="form-unit">bar(g)</span>
              </div>
            </div>
            <div className="form-row">
              <label>Deaerator Temperature</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  step="1"
                  min={10}
                  max={Math.round(satTempFromP(S.daeaPressure))}
                  value={S.daeaTempMode === 'manual' ? S.daeaTempManual : Math.round(satTempFromP(S.daeaPressure))}
                  onChange={(v) => setS(prev => {
                    const satT = Math.round(satTempFromP(prev.daeaPressure));
                    const isMax = v >= satT;
                    return {
                      ...prev,
                      daeaTempMode: isMax ? 'auto' : 'manual',
                      daeaTempManual: v
                    };
                  })}
                />
                <span className="form-unit">°C</span>
                {S.daeaTempMode === 'auto' && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem', fontStyle: 'italic' }}>
                    (Sat)
                  </span>
                )}
              </div>
            </div>
            <div className="form-row">
              <label>Deaerator Conductivity</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  min={0}
                  max={5000}
                  defaultValue={20}
                  value={S.daeaCondMode === 'manual' ? S.daeaConductivityManual : Math.round(R.fwConductivity)}
                  onChange={(v) => setS(prev => ({ ...prev, daeaCondMode: 'manual', daeaConductivityManual: v }))}
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
            
            {/* Import / Export Buttons Capsule */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#0a0d14',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              padding: '0.2rem 0.4rem',
              marginLeft: '1.25rem',
              height: '32px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}>
              <button
                className="header-btn"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text)',
                  fontSize: '0.85rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                onClick={handleExportState}
                title="Export current parameters to a JSON file"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Export</span>
              </button>

              <div style={{
                width: '1px',
                height: '14px',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                margin: '0 0.2rem'
              }} />

              <button
                className="header-btn"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text)',
                  fontSize: '0.85rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                onClick={handleImportClick}
                title="Import parameters from a JSON file"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Import</span>
              </button>
              
              <input
                type="file"
                id="state-import-input"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleImportState}
              />
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
              ecoFlueTempOut={R.ecoFlueTempOutClamped}
              ecoFlueTempOutClamped={R.ecoFlueTempOutClamped}
              ecoCondensingEnabled={S.ecoCondensingEnabled}
              qCondenser={R.qCondenser}
              bdRecoveryEnabled={S.bdRecoveryEnabled}
              daeaPressure={S.daeaPressure}
              daeaConductivity={Math.round(R.fwConductivity)}
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
          Calculation mode: <strong style={{ color: leadingVariable === 'gas' ? 'var(--gas)' : 'var(--steam)' }}>{leadingVariable === 'gas' ? 'Fuel Led' : 'Steam Led'}</strong>
        </span>
        <span style={{ margin: '0 0.75rem', opacity: 0.3 }}>|</span>
        <span>
          Water balance: <strong style={{ color: S.daeaCondMode === 'manual' ? 'var(--air)' : (S.waterInputMode === 'makeup' ? 'var(--water)' : 'var(--condensate)') }}>{S.daeaCondMode === 'manual' ? 'DA Cond Led' : (S.waterInputMode === 'makeup' ? 'Makeup Led' : 'Cond Return Led')}</strong>
        </span>
        <span>
          All calculations are based on <span className="footer-highlight">ASME PTC 4</span> / <span className="footer-highlight">EN 12952</span>
        </span>
      </footer>
    </div>
  );
}