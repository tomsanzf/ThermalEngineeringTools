import React, { useState, useMemo } from 'react';
import { BoilerhouseSVG } from './components/BoilerhouseSVG';
import { HXProfileModal } from './components/HXProfileModal';
export interface ClampedNumericInputProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: string | number;
  defaultValue?: number;
  disabled?: boolean;
}
export const ClampedNumericInput: React.FC<ClampedNumericInputProps> = ({
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
  gasInputMode: 'lhv' | 'hhv';
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
  condenserDTmin: number;
  condenserT14: number;
  condenserInputMode: 'dtmin' | 't14';
  pinchDTmin: number;
  airRH: number;
}
const DEFAULT_STATE: SimulationState = {
  gasFlowRate: 72.57,
  gasInputMode: 'hhv',
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
  condenserDTmin: 5.0,
  condenserT14: 35.0,
  condenserInputMode: 'dtmin',
  pinchDTmin: 10.0,
  airRH: 50.0,
};
export default function App() {
  const [S, setS] = useState<SimulationState>(DEFAULT_STATE);

  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState<boolean>(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(true);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ general: true });
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isHXProfileOpen, setIsHXProfileOpen] = useState<boolean>(false);
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

    // Stoichiometric water vapor & dew point calculations with combustion air temperature and relative humidity (RH)
    const excessAir = excessAirFromO2(S.o2Flue);
    const e_air = excessAir / 100;
    
    // Saturation vapor pressure of water at combustion air inlet temperature
    const pSatAir = 0.0061121 * Math.exp((17.67 * S.airTempIn) / (S.airTempIn + 243.5)); // bar
    const pW_air = (S.airRH / 100) * pSatAir; // bar
    const xW_air = pW_air / Math.max(0.01, 1.01325 - pW_air); // moles water vapor per mole dry air
    
    const nH2O_air = 9.52 * (1 + e_air) * xW_air;
    const nH2O_total = 2.0 + nH2O_air;
    const nDryFlue = 8.52 + e_air * 9.52;
    const nWetFlue = nDryFlue + nH2O_total;
    
    const yH2O_flue = nH2O_total / nWetFlue;
    const pH2O_flue = yH2O_flue * 1.01325; // bar
    const tDew = pH2O_flue > 0 ? (243.5 * Math.log(pH2O_flue / 0.0061121)) / (17.67 - Math.log(pH2O_flue / 0.0061121)) : 0;

    const solveBoilerHouse = (_pinchActive: boolean, fixedUA?: number) => {
      console.groupCollapsed(`Solver Run: ${_pinchActive ? "Pinch Active" : "Base Case"}`);
      let tBdIn_local = 0;
      let tBdOut_local = 0;
      let tMuInBd_local = 0;
      let tMuOutBd_local = 0;
      let usersSteamFlow_local = S.steamFlowUsers;
      let peggingSteamFlow_local = 0;
      let boilerSteamFlow_local = S.steamFlowUsers * 1.1;
      let mBlowdown_local = S.steamFlowUsers * 0.05;
      let fwFlow_local = S.steamFlowUsers * 1.15;
      let condFlow_local = S.steamFlowUsers * (S.condPctManual / 100);
      let makeupFlow_local = Math.max(0, fwFlow_local - condFlow_local);
      let x_bd_local = 0;
      let ecoFlueTempOut_local = S.flueGasTemp;
      let tMakeupCondenserOut_local = S.makeupTemp;

      let gasFlowRate_local = S.gasFlowRate;
      let gasPowerLHV_local = gasFlowRate_local * S.gasLHV;
      let gasPowerHHV_local = gasFlowRate_local * S.gasHHV;

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
      let condPinch_local = 0;
      let condLMTD_local: number | string = "-";
      let condUA_local: number | string = "-";
      let condenserBindingConstraint_local = "-";
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

      for (let iter = 0; iter < 15; iter++) {
        flueTempEff_local = S.flueGasTemp;

        // Calculate makeup water temperature after Condenser (from previous iteration)
        const qCond_prev = qCondenserSensible_local + qCondenserLatent_local;
        if (S.ecoEnabled && S.ecoCondensingEnabled) {
          tMakeupCondenserOut_local = S.makeupTemp + (makeupFlow_local > 0 ? (qCond_prev * 3600) / (makeupFlow_local * 4.187) : 0);
          tMakeupCondenserOut_local = Math.min(tDaea, tMakeupCondenserOut_local);
        } else {
          tMakeupCondenserOut_local = S.makeupTemp;
        }

        let tMakeup1 = tMakeupCondenserOut_local;
        let tMakeup2 = tMakeup1;
        if (S.ecoEnabled && _pinchActive) {
          const PINCH_APPROACH_TEMP = Math.max(0.1, S.pinchDTmin); // °C minimum temperature difference at the hot end
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

          tBdIn_local = tDaea;
          tBdOut_local = tDaea - (mBdLiq_local > 0 ? (qBdRecovery_local * 3600) / (mBdLiq_local * 4.187) : 0);
          tMuInBd_local = tMakeup2;
          tMuOutBd_local = tMakeup3;
        } else {
          mFlash_local = 0;
          mBdLiq_local = mBlowdown_local;
          qBdRecovery_local = 0;
          tBdIn_local = tDaea;
          tBdOut_local = tDaea;
          tMuInBd_local = tMakeup2;
          tMuOutBd_local = tMakeup2;
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
          ecoFlueTempOutClamped_local = S.flueGasTemp;
          ecoLMTD_local = 0;
          ecoUA_local = 0;
        }
        ecoFlueTempOut_local = ecoFlueTempOutClamped_local;

        if (S.ecoEnabled && S.ecoCondensingEnabled) {
          const tFlueInCond = ecoFlueTempOutClamped_local; // T13
          const tWaterInCond = S.makeupTemp;
          // Flow heat capacities
          const C_water = (makeupFlow_local * 4.187) / 3600; // kW/K
          
          // Moist-air property functions using the dynamic flue gas water vapor fraction (yH2O_flue)
          const getHumidityRatio = (T: number) => {
            if (T >= tDew) {
              return 0.622 * yH2O_flue / (1.0 - yH2O_flue);
            }
            const pSat = 0.0061121 * Math.exp((17.67 * T) / (T + 243.5)); // bar
            const y_sat = pSat / 1.01325;
            const y = Math.max(0, Math.min(yH2O_flue, y_sat));
            return 0.622 * y / (1.0 - y);
          };
          
          const getMoistEnthalpy = (T: number) => {
            const w = getHumidityRatio(T);
            return 1.006 * T + w * (2501 + 1.86 * T); // kJ/kg dry air
          };
          
          // Dry flue gas mass flow rate
          const w_in = getHumidityRatio(tFlueInCond);
          const mFlueDry = mFlueGas_kg_h / (1.0 + w_in); // kg dry air / h
          
          const getHeatReleased = (T_out: number) => {
            const h_in = getMoistEnthalpy(tFlueInCond);
            const h_out = getMoistEnthalpy(T_out);
            return (mFlueDry * (h_in - h_out)) / 3600; // kW
          };
          
          // Water outlet temperature cap is now the Deaerator temperature (tDaea)
          const tWaterOut_cap = tDaea; 
          let Q_cond = 0;
          let t14_solved = tFlueInCond;
          
          if (S.condenserInputMode === 'dtmin') {
            const DT = Math.max(0.1, S.condenserDTmin);
            
            // 1. Hot End approach limit (with DA temp cap)
            const tWaterOut_max = Math.min(tWaterOut_cap, tFlueInCond - DT);
            const qLimit_hotEnd = C_water * Math.max(0, tWaterOut_max - tWaterInCond);
            
            // 2. Dew Point approach limit (only if gas inlet is above dew point)
            let qLimit_boundary = Infinity;
            if (tFlueInCond > tDew) {
              const qDry = (mFlueDry * (getMoistEnthalpy(tFlueInCond) - getMoistEnthalpy(tDew))) / 3600;
              const tWaterMid_max = tDew - DT;
              qLimit_boundary = qDry + C_water * Math.max(0, tWaterMid_max - tWaterInCond);
            }
            
            // 3. Cold End approach limit
            const tFlueOut_min = tWaterInCond + DT;
            const qLimit_coldEnd = tFlueInCond > tFlueOut_min ? getHeatReleased(tFlueOut_min) : 0;
            
            // Bottleneck duty
            Q_cond = Math.min(qLimit_hotEnd, qLimit_boundary, qLimit_coldEnd);
            
            // Solve for exit temperature T14 using bisection
            let low = tWaterInCond;
            let high = tFlueInCond;
            for (let i = 0; i < 20; i++) {
              const mid = (low + high) / 2;
              const q_mid = getHeatReleased(mid);
              if (q_mid >= Q_cond) {
                low = mid;
                t14_solved = mid;
              } else {
                high = mid;
              }
            }
            
          } else {
            // Mode B: User edits T14 directly
            // Clamp T14 to prevent physical impossibility
            const t14_target = Math.max(tWaterInCond + 0.1, Math.min(tFlueInCond, S.condenserT14));
            const q_potential = getHeatReleased(t14_target);
            
            // Cap based on water outlet cap (DA temperature) while preventing hot-end cross (epsilon = 0.1 K)
            const qWaterMax = C_water * Math.max(0, Math.min(tWaterOut_cap, tFlueInCond - 0.1) - tWaterInCond);
            
            // Cap based on dew point boundary to prevent temperature crossing at the boundary
            let qLimit_boundary = Infinity;
            if (tFlueInCond > tDew) {
              const qDry = getHeatReleased(tDew);
              const tWaterMid_max = tDew - 0.1; // same 0.1 K epsilon convention
              qLimit_boundary = qDry + C_water * Math.max(0, tWaterMid_max - tWaterInCond);
            }
            
            const qCap = Math.min(qWaterMax, qLimit_boundary);
            
            if (q_potential <= qCap) {
              Q_cond = q_potential;
              t14_solved = t14_target;
            } else {
              Q_cond = qCap;
              // Recalculate exit temperature using bisection
              let low = tWaterInCond;
              let high = tFlueInCond;
              for (let i = 0; i < 20; i++) {
                const mid = (low + high) / 2;
                const q_mid = getHeatReleased(mid);
                if (q_mid >= Q_cond) {
                  low = mid;
                  t14_solved = mid;
                } else {
                  high = mid;
                }
              }
            }
          }
          
          // Compute actual water temperatures
          const tWaterOut_actual = tWaterInCond + (C_water > 0 ? Q_cond / C_water : 0);
          
          // Water temp at the dewpoint boundary (Zone 2 outlet)
          const qZone2_actual = tFlueInCond > tDew 
            ? Math.max(0, (mFlueDry * (getMoistEnthalpy(Math.min(tFlueInCond, tDew)) - getMoistEnthalpy(t14_solved))) / 3600)
            : Q_cond;
          const tWaterMid_actual = tWaterInCond + (C_water > 0 ? qZone2_actual / C_water : 0);
          
          // Approach temperatures
          const dtHot = tFlueInCond - tWaterOut_actual;
          const dtDewBoundary = tFlueInCond > tDew ? (tDew - tWaterMid_actual) : Infinity;
          const dtCold = t14_solved - tWaterInCond;
          
          const dtMin_actual = Math.min(dtHot, dtDewBoundary, dtCold);
          
          // Determine binding constraint
          if (tWaterOut_actual >= tWaterOut_cap - 0.05) {
            condenserBindingConstraint_local = "Water Outlet Cap (DA Temp)";
          } else {
            const minDT = Math.min(dtHot, dtDewBoundary, dtCold);
            if (Math.abs(minDT - dtCold) < 0.05) {
              condenserBindingConstraint_local = "Cold End Approach (T14 - T_water_in)";
            } else if (tFlueInCond > tDew && Math.abs(minDT - dtDewBoundary) < 0.05) {
              condenserBindingConstraint_local = "Dew Point Approach (T_dew - T_water_mid)";
            } else {
              condenserBindingConstraint_local = "Hot End Approach (T13 - T_water_out)";
            }
          }
          
          // Compute sensible and latent heat fractions algebraically
          const w_out = getHumidityRatio(t14_solved);
          const dh_sens = (1.006 + 1.86 * w_in) * tFlueInCond - (1.006 + 1.86 * w_out) * t14_solved;
          const dh_latent = 2501 * (w_in - w_out);
          
          qCondenserSensible_local = (mFlueDry * dh_sens) / 3600;
          qCondenserLatent_local = (mFlueDry * dh_latent) / 3600;
          mCondensateWater_local = mFlueDry * (w_in - w_out);
          
          // Final stack temperature
          ecoFlueTempOutClamped_local = Math.max(S.airTempIn + 5, t14_solved);
          condPinch_local = dtMin_actual;
          
          // LMTD and UA Calculations
          if (dtHot > 0 && dtCold > 0 && condPinch_local > 0) {
            const dt_max = Math.max(dtHot, dtCold);
            const dt_min = Math.min(dtHot, dtCold);
            const lmtd = Math.abs(dtHot - dtCold) < 1e-5 ? dtHot : (dt_max - dt_min) / Math.log(dt_max / dt_min);
            condLMTD_local = lmtd;
            condUA_local = Q_cond / lmtd;
          } else {
            condLMTD_local = "N/A (Temp Cross)";
            condUA_local = "N/A (Temp Cross)";
          }
        } else {
          mCondensateWater_local = 0;
          qCondenserSensible_local = 0;
          qCondenserLatent_local = 0;
          condPinch_local = 0;
          condLMTD_local = "-";
          condUA_local = "-";
          condenserBindingConstraint_local = "-";
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
        const hFW_inlet = (S.ecoEnabled && _pinchActive) ? satEnthalpyLiquid(tFWEffective_local) : hFW_daea;
        const d_p = hSteam - hFW_daea;
        const d_p_inlet = hSteam - hFW_inlet;
        const d_m = hFW_daea - hMakeup_local;
        const d_c = hFW_daea - hCond;
        
        if (leadingVariable === 'gas') {
          const Q_transferred_total = gasPowerLHV_local * combustEff_local / 100;
          const Q_total_kJ_h = Q_transferred_total * 3600.0;

          // 1. Total boiler steam generated
          const M_boiler = Math.max(0, (Q_total_kJ_h - mBlowdown_local * (hLiqSat - hFW_inlet)) / d_p_inlet);

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
          const c_low = S.daeaCondMode === 'manual' ? S.daeaConductivityManual : Math.min(S.makeupConductivity, S.condConductivity);
          const c_high = S.daeaCondMode === 'manual' ? S.daeaConductivityManual : Math.max(S.makeupConductivity, S.condConductivity);
          const c_clamped = Math.max(c_low, Math.min(c_high, S.daeaConductivityManual));
          const condDelta = S.makeupConductivity - S.condConductivity;

          let peggingSteam_est = peggingSteamFlow_local;
          for (let j = 0; j < 5; j++) {
            const fw_est = usersSteamFlow_local + peggingSteam_est + mBlowdown_local;
            const M_liquid_est = Math.max(0, fw_est - peggingSteam_est);

            if (S.daeaCondMode === 'manual' && Math.abs(condDelta) > 0.01) {
              makeupFlow_local = (fw_est * c_clamped - M_liquid_est * S.condConductivity) / condDelta;
              makeupFlow_local = Math.max(0, Math.min(M_liquid_est, makeupFlow_local));
              condFlow_local = Math.max(0, M_liquid_est - makeupFlow_local);
            } else {
              if (S.condFlowAuto) {
                condFlow_local = usersSteamFlow_local * (S.condPctManual / 100);
              } else {
                condFlow_local = S.condReturnFlowManual;
              }
              makeupFlow_local = Math.max(0, M_liquid_est - condFlow_local);
            }

            peggingSteam_est = Math.max(0, (condFlow_local * d_c + makeupFlow_local * d_m) / d_p);
          }
          peggingSteamFlow_local = peggingSteam_est;
          boilerSteamFlow_local = usersSteamFlow_local + peggingSteamFlow_local;

          fwConductivity_local = (boilerSteamFlow_local + mBlowdown_local) > 0
            ? (condFlow_local * S.condConductivity + makeupFlow_local * S.makeupConductivity) / (boilerSteamFlow_local + mBlowdown_local)
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
          // The boiler burner must supply the heat required to raise feedwater from its entering state (hFW_inlet)
          // to saturated steam (hSteam) and saturated liquid blowdown (hLiqSat).
          const Q_transferred_total = Math.max(0,
            ((usersSteamFlow_local + peggingSteamFlow_local) * d_p_inlet
              + mBlowdown_local * (hLiqSat - hFW_inlet)) / 3600
          );
          gasPowerLHV_local = combustEff_local > 0 ? (Q_transferred_total * 100 / combustEff_local) : 0;
          gasPowerHHV_local = gasPowerLHV_local * (S.gasHHV / S.gasLHV);
          gasFlowRate_local = S.gasLHV > 0 ? (gasPowerLHV_local / S.gasLHV) : 0;
        }

        fwFlow_local = boilerSteamFlow_local + mBlowdown_local;
        console.log(`  [Iter ${iter}] Gas LHV = ${gasPowerLHV_local.toFixed(2)} kW, Gas HHV = ${gasPowerHHV_local.toFixed(2)} kW, FW Flow = ${fwFlow_local.toFixed(1)} kg/h`);
      }
      console.groupEnd();
return {
        ecoFlueTempOut: ecoFlueTempOut_local,
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
        tMakeupCondenserOut: tMakeupCondenserOut_local,
        tBdIn: tBdIn_local,
        tBdOut: tBdOut_local,
        tMuInBd: tMuInBd_local,
        tMuOutBd: tMuOutBd_local,
        condPinch: condPinch_local,
        condLMTD: condLMTD_local,
        condUA: condUA_local,
        condenserBindingConstraint: condenserBindingConstraint_local,
      };
    };

    // Stage 1: Solve the base design case (always Pinch HX OFF)
    const design = solveBoilerHouse(false);
    const ecoUA_design = design.ecoUA;

    // Stage 2: Solve the actual operating case using Stage 1's design UA!
    const result = (S.pinchEnabled && S.ecoEnabled) ? solveBoilerHouse(true, ecoUA_design) : design;
    const ecoFlueTempOut = result.ecoFlueTempOut;
    const tMakeupCondenserOut = result.tMakeupCondenserOut;
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
    const ecoUA = result.ecoUA;
    const tFW_out = result.tFW_out;
    const qCondenser = result.qCondenser;
    const qCondenserSensible = result.qCondenserSensible;
    const qCondenserLatent = result.qCondenserLatent;
    const mCondensateWater = result.mCondensateWater;
    const qBdRecovery = result.qBdRecovery;
    const mFlash = result.mFlash;
    const mBdLiq = result.mBdLiq;
    const tMakeupEffective = result.tMakeupEffective;
    const tBdIn = result.tBdIn;
    const tBdOut = result.tBdOut;
    const tMuInBd = result.tMuInBd;
    const tMuOutBd = result.tMuOutBd;
    const condPinch = result.condPinch;
    const condLMTD = result.condLMTD;
    const condUA = result.condUA;
    const condenserBindingConstraint = result.condenserBindingConstraint;

    const tFW = tFW_out;
    const hFW = satEnthalpyLiquid(tFW);

    // Boiler Heat transfer & efficiency
    const steamHeatTransferred = (boilerSteamFlow / 3600) * (hSteam - hFW); // kW
    const blowdownHeatLoss = (mBlowdown / 3600) * (hLiqSat - hFW); // kW
    const totalBoilerHeat = steamHeatTransferred + blowdownHeatLoss; // kW
    
    // Boiler Efficiency (Indirect Heat-Loss Method)
    let boilerEff = 0;
    const hFW_inlet_eff = satEnthalpyLiquid(tFWEffective);
    const blowdownHeatLoss_eff = (mBlowdown / 3600) * (hLiqSat - hFW_inlet_eff);
    if (S.gasInputMode === 'lhv') {
      const blowdownLossPct = gasPowerLHV > 0 ? (blowdownHeatLoss_eff / gasPowerLHV) * 100 : 0;
      boilerEff = 100 - flueLossPct - S.radLossPct - blowdownLossPct;
    } else {
      const sensibleFlueLossPct = gasPowerHHV > 0 ? (flueLossKW / gasPowerHHV) * 100 : 0;
      const latentFlueLossPct = gasPowerHHV > 0 ? ((gasPowerHHV - gasPowerLHV) / gasPowerHHV) * 100 : 0;
      const radLossPctHHV = gasPowerHHV > 0 ? (radLossKW / gasPowerHHV) * 100 : 0;
      const blowdownLossPctHHV = gasPowerHHV > 0 ? (blowdownHeatLoss_eff / gasPowerHHV) * 100 : 0;
      boilerEff = 100 - sensibleFlueLossPct - latentFlueLossPct - radLossPctHHV - blowdownLossPctHHV;
    }
    boilerEff = Math.max(0, boilerEff);

    // Overall Boilerhouse Efficiency (Upper Bound)
    const hRef = enthalpyLiquid(S.refTemp);
    const Q_export_net = (usersSteamFlow / 3600) * (hSteam - hRef) - (condFlow / 3600) * (hCond - hRef);
    const fuelPower = S.gasInputMode === 'lhv' ? gasPowerLHV : gasPowerHHV;
    const bhEffUpper = fuelPower > 0 ? Math.max(0, (Q_export_net / fuelPower) * 100) : 0;

    // Overall Boilerhouse Efficiency (Lower Bound)
    const tRefLower = Math.max(S.condReturnTemp, tDaea);
    const hRefLower = enthalpyLiquid(tRefLower);
    const Q_export_net_lower = (usersSteamFlow / 3600) * (hSteam - hRefLower) - (condFlow / 3600) * (hCond - hRefLower);
    const bhEffLower = fuelPower > 0 ? Math.max(0, (Q_export_net_lower / fuelPower) * 100) : 0;

    const condPct = usersSteamFlow > 0 ? (condFlow / usersSteamFlow * 100) : 0;
    // Solve resulting drum conductivity
    let boilerConductivity = S.boilerConductivity;
    const isBlowdownCapped = S.bdMode === 'auto' && (mBlowdown >= usersSteamFlow * 0.249 || (S.boilerConductivity - S.makeupConductivity) <= 0);
    if (S.bdMode === 'manual' || isBlowdownCapped) {
      boilerConductivity = mBlowdown > 0
        ? (condFlow * S.condConductivity + makeupFlow * S.makeupConductivity) / mBlowdown
        : 9999;
    }

    // Calculate Condenser HX Profile
    let hxProfile: { pct: number; tHot: number; tCold: number; }[] = [];
    if (S.ecoEnabled && S.ecoCondensingEnabled && result.qCondenser > 0) {
      const tFlueIn = result.ecoFlueTempOut;
      const tFlueOut = result.ecoFlueTempOutClamped;
      const tWaterIn = S.makeupTemp;
      const tWaterOut = result.tMakeupCondenserOut;
      const Q_total = result.qCondenser;
      
      const excessAirRatio = excessAirFromO2(S.o2Flue) / 100;
      const pSatAir = 0.0061121 * Math.exp((17.67 * S.airTempIn) / (S.airTempIn + 243.5));
      const xAir = (S.airRH / 100 * pSatAir) / (1.01325 - (S.airRH / 100 * pSatAir));
      const nH2O = 2.0 + 9.52 * (1 + excessAirRatio) * xAir;
      const nDry = 8.52 + 9.52 * excessAirRatio;
      const yH2O_flue = nH2O / (nDry + nH2O);
      
      const getHumidityRatio = (T: number) => {
        if (T >= tDew) {
          return 0.622 * yH2O_flue / (1.0 - yH2O_flue);
        }
        const pSat = 0.0061121 * Math.exp((17.67 * T) / (T + 243.5));
        const y_sat = pSat / 1.01325;
        const y = Math.max(0, Math.min(yH2O_flue, y_sat));
        return 0.622 * y / (1.0 - y);
      };
      
      const getMoistEnthalpy = (T: number) => {
        const w = getHumidityRatio(T);
        return 1.006 * T + w * (2501 + 1.86 * T);
      };
      
      const mFlueGas_kg_h = result.gasFlowRate * 10.5;
      const w_in = getHumidityRatio(tFlueIn);
      const mFlueDry = mFlueGas_kg_h / (1.0 + w_in);
      
      const h_in = getMoistEnthalpy(tFlueIn);
      
      for (let i = 0; i <= 50; i++) {
        const tHot = tFlueIn - (i / 50) * (tFlueIn - tFlueOut);
        const h_out = getMoistEnthalpy(tHot);
        const q_released = (mFlueDry * (h_in - h_out)) / 3600;
        const pct = Q_total > 0 ? Math.min(100, Math.max(0, (q_released / Q_total) * 100)) : 0;
        const tCold = tWaterOut - (pct / 100) * (tWaterOut - tWaterIn);
        hxProfile.push({ pct, tHot, tCold });
      }
      
      hxProfile.sort((a, b) => a.pct - b.pct);
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
      ecoUA,
      ecoFlueTempOut,
      ecoFlueTempOutClamped,
      tFW,
      hFW,
      steamHeatTransferred,
      blowdownHeatLoss,
      totalBoilerHeat,
      boilerEff,
      Q_export_net,
      bhEffUpper,
      bhEffLower,
      excessAir,
      x_bd,
      usersSteamFlow,
      tMakeupEffective,
      tMakeupCondenserOut,
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
      mBdLiq,
      tBdIn,
      tBdOut,
      tMuInBd,
      tMuOutBd,
      condPinch,
      condLMTD,
      condUA,
      condenserBindingConstraint,
      hxProfile
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


  const handleValueChange = (key: string, value: number) => {
    setS(prev => {
      const next = { ...prev };
      if (key === 'gasPower') {
        const hv = prev.gasInputMode === 'lhv' ? prev.gasLHV : prev.gasHHV;
        next.gasFlowRate = hv > 0 ? value / hv : 0;
        setLeadingVariable('gas');
      } else if (key === 'gasFlowRate') {
        next.gasFlowRate = value;
        setLeadingVariable('gas');
      } else if (key === 'steamFlowUsers') {
        next.steamFlowUsers = value;
        setLeadingVariable('steam');
      } else if (key === 'daeaTemp') {
        const satT = satTempFromP(prev.daeaPressure);
        const isMax = value >= satT;
        next.daeaTempMode = isMax ? 'auto' : 'manual';
        next.daeaTempManual = Math.min(satT, value);
      } else if (key === 'daeaConductivity') {
        next.daeaCondMode = 'manual';
        next.daeaConductivityManual = value;
      } else if (key === 'condenserT14') {
        next.condenserT14 = value;
        next.condenserInputMode = 't14';
      } else {
        // @ts-ignore
        next[key] = value;
      }
      return next;
    });
  };
  const handleGasModeChange = (newMode: 'lhv' | 'hhv') => {
    setS(prev => ({
      ...prev,
      gasInputMode: newMode
    }));
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
        const powerVal = S.gasInputMode === 'lhv' ? R.gasPowerLHV : R.gasPowerHHV;
        const powerToShow = timeUnitMode === 'yearly' ? Math.round(powerVal * mult) : Number((powerVal * mult).toFixed(1));
        const flowToShow = timeUnitMode === 'yearly' ? Math.round(R.gasFlowRate * mult) : Number((R.gasFlowRate * mult).toFixed(1));
        
        return (
          <>
            <div className="form-row">
              <label>Heating Value Type</label>
              <select 
                value={S.gasInputMode} 
                onChange={(e) => handleGasModeChange(e.target.value as any)}
              >
                <option value="lhv">LHV (Lower Heating Value)</option>
                <option value="hhv">HHV (Higher Heating Value)</option>
              </select>
            </div>
            
            <div className="form-row">
              <label>{`Gas Power (${S.gasInputMode.toUpperCase()})`}</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  min={0}
                  defaultValue={100}
                  value={powerToShow}
                  onChange={(v) => {
                    handleValueChange('gasPower', v);
                  }}
                />
                <span className="form-unit">{timeUnitMode === 'yearly' ? 'MWh' : 'kW'}</span>
              </div>
            </div>

            <div className="form-row">
              <label>Gas Flow Rate</label>
              <div className="input-with-unit">
                <ClampedNumericInput 
                  min={0}
                  defaultValue={10}
                  value={flowToShow}
                  onChange={(v) => {
                    handleValueChange('gasFlowRate', v);
                  }}
                />
                <span className="form-unit">{timeUnitMode === 'yearly' ? 'kNm³' : 'Nm³/h'}</span>
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
      case 'bdhr':
        return (
          <>
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
                  <label>{timeUnitMode === 'yearly' ? 'Recovered Energy' : 'Recovered Heat Power'}</label>
                  <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text)', padding: '0.2rem 0' }}>
                    {fmtVal(R.qBdRecovery * (timeUnitMode === 'yearly' ? 8.76 : 1.0), timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}
                  </div>
                </div>
                
                {/* Temperature table */}
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  marginTop: '0.5rem',
                  fontSize: '0.75rem',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '4px'
                }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', fontWeight: '600', color: 'var(--text-dim)' }}>Stream</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontWeight: '600', color: 'var(--text-dim)' }}>Inlet Temp</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontWeight: '600', color: 'var(--text-dim)' }}>Outlet Temp</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.35rem 0.5rem', color: 'var(--blowdown)' }}>Blowdown</td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{R.tBdIn.toFixed(1)} °C</td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{R.tBdOut.toFixed(1)} °C</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0.35rem 0.5rem', color: 'var(--water)' }}>Makeup</td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{R.tMuInBd.toFixed(1)} °C</td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{R.tMuOutBd.toFixed(1)} °C</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </>
        );
      case 'flueGases':
        return (
          <>
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
                    setS(prev => ({ ...prev, o2Flue: v }));
                  }}
                />
                <span className="form-unit">%vol</span>
              </div>
            </div>
            
            <div className="form-row">
              <label>Calculated Excess Air</label>
              <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text)', padding: '0.2rem 0' }}>
                {R.excessAir.toFixed(0)} %
              </div>
            </div>

            <div className="form-row">
              <label>Flue Gas Dew Point</label>
              <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text)', padding: '0.2rem 0' }}>
                {R.tDew.toFixed(1)} °C
              </div>
            </div>

            <div className="form-row">
              <label>{S.ecoEnabled ? 'Raw Boiler Flue Temp' : 'Boiler Outlet Temp'}</label>
              <div className="input-with-unit">
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
                <span className="form-unit">°C</span>
              </div>
            </div>
          </>
        );
      case 'economizer': {
        const ecoFlueMin = Math.round((S.ecoEnabled && S.pinchEnabled ? R.tFWEffective : R.tDaea) + 5.0);
        return (
          <>
            <div className="form-row">
              <label>Economizer Status</label>
              <div className="toggle-group">
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
            </div>
            {S.ecoEnabled && (
              <>
                <div className="form-row">
                  <label>UA Mode</label>
                  <div className="toggle-group">
                    <button 
                      className={`toggle-btn ${S.ecoUAMode === 'auto_ua' ? 'active' : ''}`}
                      onClick={() => setS(prev => ({ ...prev, ecoUAMode: 'auto_ua' }))}
                    >
                      Design UA
                    </button>
                    <button 
                      className={`toggle-btn ${S.ecoUAMode === 'manual_temp' ? 'active' : ''}`}
                      onClick={() => setS(prev => ({ ...prev, ecoUAMode: 'manual_temp' }))}
                    >
                      Target Temp
                    </button>
                  </div>
                </div>
                {S.ecoUAMode === 'auto_ua' ? (
                  <div className="form-row">
                    <label>Design UA</label>
                    <div className="input-with-unit">
                      <ClampedNumericInput 
                        step="0.5"
                        min={1}
                        max={100}
                        defaultValue={15.0}
                        value={S.ecoUA_design}
                        onChange={(v) => {
                          setS(prev => ({ ...prev, ecoUA_design: v }));
                        }}
                      />
                      <span className="form-unit">kW/K</span>
                    </div>
                  </div>
                ) : (
                  <div className="form-row">
                    <label>Target Flue Exit Temp</label>
                    <div className="input-with-unit">
                      <ClampedNumericInput 
                        step="5"
                        min={ecoFlueMin}
                        max={300}
                        defaultValue={130}
                        value={Math.round(R.ecoFlueTempOutClamped)}
                        onChange={(v) => {
                          setS(prev => ({ ...prev, ecoFlueTempOutManual: v }));
                        }}
                      />
                      <span className="form-unit">°C</span>
                    </div>
                  </div>
                )}
                <hr style={{ margin: '0.5rem 0', borderColor: 'rgba(255,255,255,0.08)' }} />
                <div className="form-row">
                  <label>Power Recovered</label>
                  <div className="display-val" style={{ fontSize: '0.75rem', padding: '0.2rem 0', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                    {R.ecoHeat.toFixed(1)} kW
                  </div>
                </div>
                <div className="form-row">
                  <label>LMTD</label>
                  <div className="display-val" style={{ fontSize: '0.75rem', padding: '0.2rem 0', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                    {R.ecoLMTD > 0 ? `${R.ecoLMTD.toFixed(1)} K` : 'N/A'}
                  </div>
                </div>
                <div className="form-row">
                  <label>Calculated UA</label>
                  <div className="display-val" style={{ fontSize: '0.75rem', padding: '0.2rem 0', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                    {R.ecoUA > 0 ? `${R.ecoUA.toFixed(3)} kW/K` : 'N/A'}
                  </div>
                </div>
              </>
            )}
          </>
        );
      }
      case 'condenser': {
        const mult = timeUnitMode === 'yearly' ? 8.76 : 1.0;
        return (
          <>
            <div className="form-row">
              <label>Condensing Mode</label>
              <div className="toggle-group">
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
            </div>
            {S.ecoEnabled && S.ecoCondensingEnabled && (
              <>
                <div className="form-row">
                  <label>Flue Dew Point</label>
                  <div className="display-val" style={{ fontSize: '0.75rem', padding: '0.2rem 0', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                    {R.tDew.toFixed(1)} °C
                  </div>
                </div>
                <div className="form-row">
                  <label>Water Condensed</label>
                  <div className="display-val" style={{ fontSize: '0.75rem', padding: '0.2rem 0', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                    {fmtVal(R.mCondensateWater * mult, timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 't' : 'kg/h'}
                  </div>
                </div>
                <div className="form-row">
                  <label>Sensible Heat Recovered</label>
                  <div className="display-val" style={{ fontSize: '0.75rem', padding: '0.2rem 0', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                    {fmtVal(R.qCondenserSensible * mult, timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}
                  </div>
                </div>
                <div className="form-row">
                  <label>Latent Heat Recovered</label>
                  <div className="display-val" style={{ fontSize: '0.75rem', padding: '0.2rem 0', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                    {fmtVal(R.qCondenserLatent * mult, timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}
                  </div>
                </div>
                <div className="form-row" style={{ fontWeight: 'bold' }}>
                  <label>Total Heat Recovered</label>
                  <div className="display-val" style={{ fontSize: '0.75rem', padding: '0.2rem 0', textAlign: 'left', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                    {fmtVal(R.qCondenser * mult, timeUnitMode === 'yearly' ? 1 : 0)} {timeUnitMode === 'yearly' ? 'MWh' : 'kW'}
                  </div>
                </div>
                <hr style={{ margin: '0.5rem 0', borderColor: 'rgba(255,255,255,0.08)' }} />
                <div className="form-row">
                  <label style={{ fontWeight: S.condenserInputMode === 'dtmin' ? 'bold' : 'normal' }}>
                    Pinch (deltaTmin) {S.condenserInputMode === 'dtmin' ? '★' : ''}
                  </label>
                  <div className="input-with-unit editable-cell">
                    <ClampedNumericInput
                      step="0.5"
                      min={0.1}
                      max={50}
                      defaultValue={5.0}
                      value={Number(R.condPinch.toFixed(1))}
                      onChange={(v) => {
                        setS(prev => ({
                          ...prev,
                          condenserDTmin: v,
                          condenserInputMode: 'dtmin'
                        }));
                      }}
                    />
                    <span className="form-unit">K</span>
                  </div>
                </div>
                <div className="form-row">
                  <label style={{ fontWeight: S.condenserInputMode === 't14' ? 'bold' : 'normal' }}>
                    Stack Exit Temp {S.condenserInputMode === 't14' ? '★' : ''}
                  </label>
                  <div className="input-with-unit editable-cell">
                    <ClampedNumericInput
                      step="1"
                      min={15}
                      max={150}
                      defaultValue={35.0}
                      value={Number(R.ecoFlueTempOutClamped.toFixed(1))}
                      onChange={(v) => {
                        setS(prev => ({
                          ...prev,
                          condenserT14: v,
                          condenserInputMode: 't14'
                        }));
                      }}
                    />
                    <span className="form-unit">°C</span>
                  </div>
                </div>

                <div className="form-row" style={{ marginTop: '0.75rem', marginBottom: '0.25rem' }}>
                  <button
                    type="button"
                    style={{
                      width: '100%',
                      fontSize: '0.75rem',
                      padding: '0.4rem 0.8rem',
                      backgroundColor: '#38bdf8',
                      color: '#0f172a',
                      fontWeight: 'bold',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem'
                    }}
                    onClick={() => setIsHXProfileOpen(true)}
                  >
                    📊 Open HX Profile
                  </button>
                </div>

                <div className="form-row">
                  <label>LMTD</label>
                  <div className="display-val" style={{ fontSize: '0.75rem', padding: '0.2rem 0', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                    {typeof R.condLMTD === 'number' ? `${R.condLMTD.toFixed(1)} K` : R.condLMTD}
                  </div>
                </div>
                <div className="form-row">
                  <label>UA</label>
                  <div className="display-val" style={{ fontSize: '0.75rem', padding: '0.2rem 0', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                    {typeof R.condUA === 'number' ? `${R.condUA.toFixed(3)} kW/K` : R.condUA}
                  </div>
                </div>
                <div className="form-row" style={{ fontSize: '0.7rem', color: 'var(--accent-orange)' }}>
                  <label style={{ color: 'var(--accent-orange)' }}>Binding Pinch Point</label>
                  <div style={{ fontWeight: 'bold', fontFamily: 'var(--font-mono)', padding: '0.2rem 0', textAlign: 'left' }}>
                    {R.condenserBindingConstraint}
                  </div>
                </div>
              </>
            )}
          </>
        );
      }
      case 'pinch': {
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
          <>
            <div className="form-row">
              <label>Pinch HX Status</label>
              <div className="toggle-group">
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
            </div>
            {S.pinchEnabled && (
              <>
                <div className="form-row">
                  <label>Pinch (deltaTmin)</label>
                  <div className="input-with-unit editable-cell">
                    <ClampedNumericInput
                      step="0.5"
                      min={0.1}
                      max={50}
                      defaultValue={10.0}
                      value={S.pinchDTmin}
                      onChange={(v) => {
                        setS(prev => ({
                          ...prev,
                          pinchDTmin: v
                        }));
                      }}
                    />
                    <span className="form-unit">K</span>
                  </div>
                </div>
                <div className="form-row">
                  <label>Exchanged Power</label>
                  <div className="display-val" style={{ fontSize: '0.75rem', padding: '0.2rem 0', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                    {R.pinchHeat.toFixed(1)} kW
                  </div>
                </div>
                <div className="form-row">
                  <label>Effectiveness</label>
                  <div className="display-val" style={{ fontSize: '0.75rem', padding: '0.2rem 0', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                    {pinchEffectivenessPct.toFixed(0)}%
                  </div>
                </div>
                <div className="form-row">
                  <label>LMTD</label>
                  <div className="display-val" style={{ fontSize: '0.75rem', padding: '0.2rem 0', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                    {pinchLMTD > 0 ? `${pinchLMTD.toFixed(1)} K` : 'N/A'}
                  </div>
                </div>
                <div className="form-row">
                  <label>Calculated UA</label>
                  <div className="display-val" style={{ fontSize: '0.75rem', padding: '0.2rem 0', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                    {pinchUA > 0 ? `${pinchUA.toFixed(3)} kW/K` : 'N/A'}
                  </div>
                </div>
              </>
            )}
          </>
        );
      }
      default:
        return null;
    }
  };

  const handleOpenSection = (key: string) => {
    let targetKey: string | null = null;
    
    if (key === 'addEconomizer' || key === 'economizer') {
      setS(prev => ({ ...prev, ecoEnabled: true }));
      targetKey = 'economizer';
    } else if (key === 'addCondenser' || key === 'condenser' || key === 'economizerFlue' || key === 'T02') {
      setS(prev => ({ ...prev, ecoCondensingEnabled: true }));
      targetKey = 'condenser';
    } else if (key === 'addBDHR' || key === 'bdhr') {
      setS(prev => ({ ...prev, bdRecoveryEnabled: true }));
      targetKey = 'bdhr';
    } else if (key === 'addPinchHX' || key === 'pinch' || key === 'T08') {
      setS(prev => ({ ...prev, pinchEnabled: true }));
      targetKey = 'pinch';
    } else if (key === 'gasInput') {
      targetKey = 'gasInput';
    } else if (key === 'airTempIn' || key === 'flueGasTemp' || key === 'flueGases' || key === 'airRH' || key === 'X03') {
      targetKey = 'flueGases';
    } else if (key === 'settings') {
      targetKey = 'settings';
    }
    
    if (!targetKey) return;
    
    setIsLeftPanelOpen(true);
    setOpenSections(prev => ({
      ...prev,
      [targetKey!]: true
    }));
    setHighlightedSection(targetKey);
    setTimeout(() => {
      setHighlightedSection(prev => prev === targetKey ? null : prev);
    }, 800);
    
    setTimeout(() => {
      const el = document.getElementById(`section-card-${targetKey}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 150);
  };

  const toggleSection = (id: string) => {
    setOpenSections(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const renderSidebarSection = (id: string, title: string, icon: string) => {
    const isOpen = !!openSections[id];
    const isHighlighted = highlightedSection === id;
    return (
      <div 
        id={`section-card-${id}`}
        className={`sidebar-section-card ${isOpen ? 'expanded' : 'collapsed'} ${isHighlighted ? 'highlighted' : ''}`}
        style={{
          border: '1px solid var(--border)',
          borderRadius: '6px',
          overflow: 'hidden',
          backgroundColor: isOpen ? 'rgba(255, 255, 255, 0.01)' : 'transparent',
          transition: 'all 0.2s ease',
          marginBottom: '0.5rem'
        }}
      >
        <button 
          onClick={() => toggleSection(id)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.6rem 0.8rem',
            background: isOpen ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.02)',
            border: 'none',
            color: 'var(--text)',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
            fontWeight: '600',
            fontSize: '0.8rem',
            transition: 'background-color 0.2s ease'
          }}
          className="section-header-btn"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{icon}</span>
            <span>{title}</span>
          </span>
          <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{isOpen ? '▼' : '▶'}</span>
        </button>
        {isOpen && (
          <div style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="popup-table">
            {renderPopupContent(id)}
          </div>
        )}
      </div>
    );
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
        <div className="efficiency-badges">
          <div className="eff-badge-card">
            <span className="eff-badge-label" style={{ textTransform: 'none' }}>η_Boiler {S.gasInputMode.toUpperCase()}</span>
            <span className="eff-badge-value">{fmtVal(R.boilerEff, 1)}%</span>
          </div>
          <div className="eff-badge-group">
            <div className="eff-group-title" style={{ textTransform: 'none' }}>η_boilerhouse {S.gasInputMode.toUpperCase()}</div>
            <div className="eff-group-badges">
              <div className="eff-badge-card">
                <span className="eff-badge-label">Upper bound</span>
                <span className={`eff-badge-value ${R.bhEffUpper < 75 ? 'danger' : R.bhEffUpper < 82 ? 'warn' : ''}`}>
                  {fmtVal(R.bhEffUpper, 1)}%
                </span>
                <span className="eff-badge-note">@ {S.refTemp.toFixed(0)} °C Tref</span>
              </div>
              <div className="eff-badge-card">
                <span className="eff-badge-label">Lower bound</span>
                <span className={`eff-badge-value ${R.bhEffLower < 75 ? 'danger' : R.bhEffLower < 82 ? 'warn' : ''}`}>
                  {fmtVal(R.bhEffLower, 1)}%
                </span>
                <span className="eff-badge-note">@ {Math.max(S.condReturnTemp, R.tDaea).toFixed(0)} °C Tref</span>
              </div>
            </div>
          </div>
        </div>
      </header>
      {/* Main dashboard content */}
      <div className="main-layout">
        {/* Left Settings Sidebar Container */}
        <div className="sidebar-container-left">
          <aside className={`settings-sidebar-wrapper ${isLeftPanelOpen ? 'open' : 'collapsed'}`}>
            <div className="sidebar settings-sidebar-inner">
              <div className="sidebar-header">
                <h3>Parameters</h3>
              </div>
              <div className="sidebar-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem' }}>
                {renderSidebarSection('settings', 'General', '⚙️')}
                {renderSidebarSection('gasInput', 'Gas Input', '🔥')}
                {renderSidebarSection('bdhr', 'Blowdown Recovery', '♻️')}
                {renderSidebarSection('flueGases', 'Flue Gas', '💨')}
                {renderSidebarSection('economizer', 'Economizer', '🌡️')}
                {renderSidebarSection('condenser', 'Condenser', '💧')}
                {renderSidebarSection('pinch', 'Pinch Heat Exchanger', '🔄')}
              </div>
            </div>
          </aside>
          <button 
            className={`sidebar-toggle-tab left-tab ${isLeftPanelOpen ? 'open' : 'collapsed'}`} 
            onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
            title={isLeftPanelOpen ? "Collapse Parameters" : "Expand Parameters"}
          >
            {isLeftPanelOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Left side SVG area */}
        <section className="diagram-area">
          <div className="diagram-card">
            <BoilerhouseSVG
              isAnimationEnabled={isAnimationEnabled}
              ecoEnabled={S.ecoEnabled}
              pinchEnabled={S.pinchEnabled}
              ecoCondensingEnabled={S.ecoCondensingEnabled}
              bdRecoveryEnabled={S.bdRecoveryEnabled}
              makeupFlow={R.makeupFlow}
              makeupConductivity={S.makeupConductivity}
              makeupTemp={S.makeupTemp}
              tMakeupCondenserOut={R.tMakeupCondenserOut}
              tMuInBd={R.tMuInBd}
              tMakeupEffective={R.tMakeupEffective}
              daeaPressure={S.daeaPressure}
              tDaea={R.tDaea}
              daeaConductivity={Math.round(R.fwConductivity)}
              condFlow={R.condFlow}
              condPct={R.condPct}
              condReturnTemp={S.condReturnTemp}
              condConductivity={S.condConductivity}
              fwFlow={R.fwFlow}
              tFWEffective={R.tFWEffective}
              tFW={R.tFW}
              bdFlowKgH={R.mBlowdown}
              bdFlow={R.x_bd}
              boilerConductivity={R.boilerConductivity}
              mFlash={R.mFlash}
              drumPressure={S.drumPressure}
              tSat={R.tSat}
              boilerSteamFlow={R.boilerSteamFlow}
              peggingSteamFlow={R.peggingSteamFlow}
              steamFlow={R.usersSteamFlow}
              Q_users_kW={R.Q_export_net}
              gasInputMode={S.gasInputMode}
              gasPowerLHV={R.gasPowerLHV}
              gasPowerHHV={R.gasPowerHHV}
              energyUnit={timeUnitMode === 'yearly' ? 'MWh' : 'kW'}
              gasFlowRate={R.gasFlowRate}
              airTempIn={S.airTempIn}
              airRH={S.airRH}
              o2Flue={S.o2Flue}
              flueGasTemp={S.flueGasTemp}
              ecoFlueTempOut={R.ecoFlueTempOut}
              ecoFlueTempOutClamped={R.ecoFlueTempOutClamped}
              condenserT14={S.condenserT14}
              ecoHeat={R.ecoHeat}
              qCondenser={R.qCondenser}
              mult={timeUnitMode === 'yearly' ? 8.76 : 1.0}
              fmtDiagVal={(val: number, decimals: number = 0) => (isNaN(val) || val === undefined) ? '-' : val.toFixed(decimals)}
              onLabelClick={(tag: string) => handleOpenSection(tag)}
              onValueChange={handleValueChange}
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
          </div>
        </section>
        {/* Right side balance sheets Container */}
        <div className="sidebar-container-right">
          <button 
            className={`sidebar-toggle-tab right-tab ${isRightPanelOpen ? 'open' : 'collapsed'}`} 
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            title={isRightPanelOpen ? "Collapse Flows Table" : "Expand Flows Table"}
          >
            {isRightPanelOpen ? '▶' : '◀'}
          </button>
          <aside className={`results-sidebar-wrapper ${isRightPanelOpen ? 'open' : 'collapsed'}`}>
          <div className="sidebar results-sidebar-inner">
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
      </div>
      </aside>
      </div>
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
      {isHXProfileOpen && (
        <HXProfileModal 
          isOpen={isHXProfileOpen}
          onClose={() => setIsHXProfileOpen(false)}
          profileData={R.hxProfile}
          tDew={R.tDew}
          condPinch={R.condPinch}
          bindingConstraint={R.condenserBindingConstraint}
          ecoFlueTempOutClamped={R.ecoFlueTempOutClamped}
          condenserInputMode={S.condenserInputMode}
          onPinchChange={(v) => {
            setS(prev => ({
              ...prev,
              condenserDTmin: v,
              condenserInputMode: 'dtmin'
            }));
          }}
          onExitTempChange={(v) => {
            setS(prev => ({
              ...prev,
              condenserT14: v,
              condenserInputMode: 't14'
            }));
          }}
        />
      )}
    </div>
  );
}