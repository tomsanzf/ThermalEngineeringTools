const { createInitialState, getLoopActuals } = require('../src/stratificationModel.ts');

const state = createInitialState(20);

// We need to simulate the rendering math in App.tsx
state.loops.forEach(loop => {
  if (!loop.isActive) return;
  const supplyPort = state.ports.find(p => p.id === loop.ports.supply);
  const returnPort = state.ports.find(p => p.id === loop.ports.return);
  
  const tankTop = 80;
  const tankHeight = 420;
  const supplyPortY = tankTop + tankHeight * (1 - supplyPort.height);
  const returnPortY = tankTop + tankHeight * (1 - returnPort.height);
  
  console.log(`Loop: ${loop.name} (${loop.type})`);
  console.log(`  Supply Port: ${supplyPort.id} (height=${supplyPort.height}) -> Y=${supplyPortY}`);
  console.log(`  Return Port: ${returnPort.id} (height=${returnPort.height}) -> Y=${returnPortY}`);
});
