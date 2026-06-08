export interface ConnectionPort {
  id: string;
  name: string;
  type: 'supply' | 'return'; // supply is inlet (into tank), return is outlet (out of tank)
  loopId: string;
  height: number; // 0 (bottom) to 1 (top)
  color: string;
}

export interface FluidLoop {
  id: string;
  name: string;
  type: 'source' | 'sink';
  designPower: number; // kW
  designTempSupply: number; // °C
  designTempReturn: number; // °C
  isActive: boolean;
  color: string;
  ports: {
    supply: string; // ConnectionPort.id
    return: string; // ConnectionPort.id
  };
  limitedByPower?: boolean;
}

export interface SimulationParams {
  tankVolume: number; // Liters
  tankHeight: number; // Meters
  ambientTemp: number; // °C
  heatLossCoef: number; // W/m²K
  conductionCoef: number; // W/K (internal conduction/mixing parameter)
  numNodes: number;
}

export interface TankState {
  temperatures: number[]; // From index 0 (bottom) to numNodes - 1 (top)
  ports: ConnectionPort[];
  loops: FluidLoop[];
}

// Initial state creator
export const createInitialState = (numNodes: number): TankState => {
  // Let's create an initially stratified tank: 30°C at bottom, 70°C at top
  const temperatures: number[] = [];
  for (let i = 0; i < numNodes; i++) {
    const fraction = i / (numNodes - 1);
    temperatures.push(30 + fraction * 40); // 30°C to 70°C linear ramp
  }

  const ports: ConnectionPort[] = [
    // Solar Loop Ports (now Compressed Air - bottom-left)
    { id: 'solar-supply', name: 'Compressed Air Supply (Warm In)', type: 'supply', loopId: 'solar', height: 0.50, color: '#f59e0b' },
    { id: 'solar-return', name: 'Compressed Air Return (Cold Out)', type: 'return', loopId: 'solar', height: 0.10, color: '#d97706' },
    
    // Heat Pump Loop Ports (top-left)
    { id: 'hp-supply', name: 'HP Supply (Hot In)', type: 'supply', loopId: 'hp', height: 0.90, color: '#ef4444' },
    { id: 'hp-return', name: 'HP Return (Warm Out)', type: 'return', loopId: 'hp', height: 0.50, color: '#b91c1c' },

    // Space Heating Loop Ports (now Process Sink - top-right)
    { id: 'heating-supply', name: 'Process Draw (Hot Out)', type: 'return', loopId: 'heating', height: 0.85, color: '#3b82f6' },
    { id: 'heating-return', name: 'Process Return (Warm In)', type: 'supply', loopId: 'heating', height: 0.20, color: '#2563eb' },

    // Domestic Hot Water Ports (Sink - bottom-right)
    { id: 'dhw-supply', name: 'DHW Draw (Hot Out)', type: 'return', loopId: 'dhw', height: 0.95, color: '#ec4899' },
    { id: 'dhw-return', name: 'DHW Makeup (Cold In)', type: 'supply', loopId: 'dhw', height: 0.05, color: '#db2777' },
  ];

  const loops: FluidLoop[] = [
    { 
      id: 'solar', 
      name: 'Compressed air heat recovery', 
      type: 'source', 
      designPower: 100, 
      designTempSupply: 60, 
      designTempReturn: 20, 
      isActive: false, 
      color: '#f59e0b', 
      ports: { supply: 'solar-supply', return: 'solar-return' },
      limitedByPower: true
    },
    { 
      id: 'hp', 
      name: 'Heat Pump Loop', 
      type: 'source', 
      designPower: 200, 
      designTempSupply: 90, 
      designTempReturn: 80, 
      isActive: false, 
      color: '#ef4444', 
      ports: { supply: 'hp-supply', return: 'hp-return' },
      limitedByPower: true
    },
    { 
      id: 'heating', 
      name: 'Process', 
      type: 'sink', 
      designPower: 150, 
      designTempSupply: 90, 
      designTempReturn: 50, 
      isActive: false, 
      color: '#3b82f6', 
      ports: { supply: 'heating-return', return: 'heating-supply' } 
    },
    { 
      id: 'dhw', 
      name: 'Domestic Hot Water', 
      type: 'sink', 
      designPower: 150, 
      designTempSupply: 50, 
      designTempReturn: 15, 
      isActive: false, 
      color: '#ec4899', 
      ports: { supply: 'dhw-return', return: 'dhw-supply' } 
    },
  ];

  return { temperatures, ports, loops };
};

export interface LoopActuals {
  flowRate: number;      // m³/h
  tempIn: number;        // °C (inlet to tank)
  tempOut: number;       // °C (outlet from tank)
  actualPower: number;   // kW
}

export const getLoopActuals = (
  loop: FluidLoop,
  temperatures: number[],
  ports: ConnectionPort[]
): LoopActuals => {
  const supplyPort = ports.find(p => p.id === loop.ports.supply);
  const returnPort = ports.find(p => p.id === loop.ports.return);
  const N = temperatures.length;

  const returnIdx = returnPort 
    ? Math.min(N - 1, Math.max(0, Math.floor(returnPort.height * N)))
    : 0;

  const T_draw = temperatures[returnIdx] !== undefined ? temperatures[returnIdx] : 20;

  if (!loop.isActive) {
    return {
      flowRate: 0,
      tempIn: T_draw,
      tempOut: T_draw,
      actualPower: 0
    };
  }

  const designDeltaT = Math.abs(loop.designTempSupply - loop.designTempReturn);
  const flowRate = designDeltaT > 0 ? (loop.designPower / (1.161111 * designDeltaT)) : 0;

  let tempIn = T_draw;
  let actualPower = 0;

  if (loop.type === 'source') {
    let actualDeltaT = Math.max(0, loop.designTempSupply - T_draw);
    if (loop.limitedByPower !== false) {
      const maxDeltaT = Math.abs(loop.designTempSupply - loop.designTempReturn);
      actualDeltaT = Math.min(actualDeltaT, maxDeltaT);
    }
    actualPower = flowRate * 1.161111 * actualDeltaT;
    tempIn = T_draw + actualDeltaT;
  } else {
    const actualDeltaT = Math.max(0, T_draw - loop.designTempReturn);
    actualPower = flowRate * 1.161111 * actualDeltaT;
    tempIn = T_draw - actualDeltaT;
  }

  return {
    flowRate,
    tempIn,
    tempOut: T_draw,
    actualPower
  };
};

// Simulation solver step
// Returns a new list of temperatures after time step dt (in seconds)
export const simulateStep = (
  state: TankState,
  params: SimulationParams,
  dt: number // in seconds
): number[] => {
  const N = params.numNodes;
  const T = [...state.temperatures];
  
  const V_tank = params.tankVolume / 1000; // m³
  const V_node = V_tank / N; // m³ per node
  
  // 1. Calculate nodal source terms (fluid injections and withdrawals)
  const q_inj = new Array(N).fill(0); // m³/s
  const q_inj_temp = new Array(N).fill(0); // Weighted temp sum for injection
  const q_with = new Array(N).fill(0); // m³/s

  state.loops.forEach(loop => {
    if (!loop.isActive) return;
    
    const actuals = getLoopActuals(loop, T, state.ports);
    if (actuals.flowRate <= 0) return;

    const flow_m3s = actuals.flowRate / 3600; // m³/h to m³/s
    
    // Find ports
    const supplyPort = state.ports.find(p => p.id === loop.ports.supply);
    const returnPort = state.ports.find(p => p.id === loop.ports.return);

    if (supplyPort && returnPort) {
      // Node indices (0 to N-1)
      const supplyIdx = Math.min(N - 1, Math.max(0, Math.floor(supplyPort.height * N)));
      const returnIdx = Math.min(N - 1, Math.max(0, Math.floor(returnPort.height * N)));

      // Inflow (supplyPort is 'supply' type, meaning water goes INTO the tank)
      q_inj[supplyIdx] += flow_m3s;
      q_inj_temp[supplyIdx] += flow_m3s * actuals.tempIn;

      // Outflow (returnPort is 'return' type, meaning water is drawn OUT OF the tank)
      q_with[returnIdx] += flow_m3s;
    }
  });

  // 2. Calculate net flow across node interfaces (advection flow velocities)
  // f[i] is flow from node i to node i+1 (upwards)
  // Mass balance at node i: q_inj[i] - q_with[i] = f[i] - f[i-1]
  // Therefore: f[i] = f[i-1] + q_inj[i] - q_with[i]
  // With f[-1] = 0.
  const f = new Array(N - 1).fill(0);
  let currentFlow = 0;
  for (let i = 0; i < N - 1; i++) {
    currentFlow += q_inj[i] - q_with[i];
    f[i] = currentFlow;
  }

  // 3. Update temperatures
  const nextT = new Array(N).fill(0);
  
  // Physical parameters
  // Water properties
  const rho = 1000; // kg/m³
  const Cp = 4180; // J/kgK
  const cond_W_K = params.conductionCoef; // Effective thermal conduction W/K
  const U_loss_W_m2K = params.heatLossCoef; // W/m²K
  const H = params.tankHeight; // m
  const D = Math.sqrt((4 * V_tank) / (Math.PI * H)); // Tank diameter
  const nodeHeight = H / N;
  const nodeArea = Math.PI * D * nodeHeight; // Side area of node

  for (let i = 0; i < N; i++) {
    const Ti = T[i];
    
    // Conduction
    let q_conduction = 0;
    if (i > 0) {
      q_conduction += cond_W_K * (T[i - 1] - Ti);
    }
    if (i < N - 1) {
      q_conduction += cond_W_K * (T[i + 1] - Ti);
    }

    // Heat Loss to Ambient
    const q_loss = U_loss_W_m2K * nodeArea * (params.ambientTemp - Ti);

    // Advection
    // Flow inside the tank across boundaries
    let q_advection = 0;

    // Interface below node i (between i-1 and i)
    if (i > 0) {
      const f_below = f[i - 1];
      if (f_below > 0) {
        // Flow is upwards, brings water from node i-1 into i
        q_advection += f_below * rho * Cp * T[i - 1];
      } else {
        // Flow is downwards, draws water from i into i-1
        q_advection += f_below * rho * Cp * Ti;
      }
    }

    // Interface above node i (between i and i+1)
    if (i < N - 1) {
      const f_above = f[i];
      if (f_above > 0) {
        // Flow is upwards, draws water from i into i+1
        q_advection -= f_above * rho * Cp * Ti;
      } else {
        // Flow is downwards, brings water from i+1 into i
        q_advection -= f_above * rho * Cp * T[i + 1];
      }
    }

    // Direct injection and withdrawal
    const q_direct_inj = q_inj_temp[i] * rho * Cp; // q_inj[i]*T_inj * rho * Cp
    const q_direct_with = q_with[i] * rho * Cp * Ti; // q_with[i]*Ti * rho * Cp

    // Net energy rate of change (Watts)
    const netPower = q_conduction + q_loss + q_advection + q_direct_inj - q_direct_with;

    // Temperature rate of change (K/s)
    const dT_dt = netPower / (V_node * rho * Cp);

    nextT[i] = Ti + dT_dt * dt;

    // Clip temperatures to reasonable limits (0°C to 100°C)
    nextT[i] = Math.min(100, Math.max(0, nextT[i]));
  }

  // 4. Density-driven convection (Buoyancy Mixing)
  // If cold water (heavier) sits on top of hot water (lighter), they mix.
  // We perform multiple mixing sweeps from bottom to top until stable.
  // Stable means temperature decreases or stays equal as we go down: T[i] >= T[i-1] for all i.
  let mixed = true;
  let iterations = 0;
  const maxIterations = N * 2; // prevent infinite loops
  while (mixed && iterations < maxIterations) {
    mixed = false;
    for (let i = 1; i < N; i++) {
      // Since index 0 is bottom and N-1 is top, stable means:
      // T[i] (above) >= T[i-1] (below)
      // If T[i] < T[i-1], it is unstable (cold water on top of hot water)
      if (nextT[i] < nextT[i - 1]) {
        // Mix them
        const avg = (nextT[i] + nextT[i - 1]) / 2;
        nextT[i] = avg;
        nextT[i - 1] = avg;
        mixed = true;
      }
    }
    iterations++;
  }

  return nextT;
};
