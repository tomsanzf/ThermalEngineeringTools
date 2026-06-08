const ports = [
  { id: 'solar-supply', name: 'Compressed Air Supply (Warm In)', type: 'supply', loopId: 'solar', height: 0.50, color: '#f59e0b' },
  { id: 'solar-return', name: 'Compressed Air Return (Cold Out)', type: 'return', loopId: 'solar', height: 0.10, color: '#d97706' },
  { id: 'hp-supply', name: 'HP Supply (Hot In)', type: 'supply', loopId: 'hp', height: 0.90, color: '#ef4444' },
  { id: 'hp-return', name: 'HP Return (Warm Out)', type: 'return', loopId: 'hp', height: 0.50, color: '#b91c1c' },
  { id: 'heating-supply', name: 'Process Draw (Hot Out)', type: 'return', loopId: 'heating', height: 0.85, color: '#3b82f6' },
  { id: 'heating-return', name: 'Process Return (Warm In)', type: 'supply', loopId: 'heating', height: 0.20, color: '#2563eb' },
  { id: 'dhw-supply', name: 'DHW Draw (Hot Out)', type: 'return', loopId: 'dhw', height: 0.95, color: '#ec4899' },
  { id: 'dhw-return', name: 'DHW Makeup (Cold In)', type: 'supply', loopId: 'dhw', height: 0.05, color: '#db2777' },
];

const loops = [
  { id: 'solar', name: 'Compressed air heat recovery', type: 'source', ports: { supply: 'solar-supply', return: 'solar-return' }, isActive: true, designPower: 100, designTempSupply: 60, designTempReturn: 20 },
  { id: 'hp', name: 'Heat Pump Loop', type: 'source', ports: { supply: 'hp-supply', return: 'hp-return' }, isActive: true, designPower: 200, designTempSupply: 90, designTempReturn: 80 },
  { id: 'heating', name: 'Process', type: 'sink', ports: { supply: 'heating-return', return: 'heating-supply' }, isActive: true, designPower: 150, designTempSupply: 90, designTempReturn: 50 },
  { id: 'dhw', name: 'Domestic Hot Water', type: 'sink', ports: { supply: 'dhw-return', return: 'dhw-supply' }, isActive: false, designPower: 150, designTempSupply: 50, designTempReturn: 15 }
];

const temperatures = Array(20).fill(50); // mock temperatures

// Mock getLoopActuals
const getLoopActuals = (loop) => {
  const designDeltaT = Math.abs(loop.designTempSupply - loop.designTempReturn);
  const flowRate = designDeltaT > 0 ? (loop.designPower / (1.161111 * designDeltaT)) : 0;
  return { flowRate };
};

const activeInlets = [];
const activeOutlets = [];
const tol = 0.001;

loops.forEach(loop => {
  if (!loop.isActive) return;
  const actuals = getLoopActuals(loop);
  if (actuals.flowRate <= tol) return;

  const supplyPort = ports.find(p => p.id === loop.ports.supply);
  const returnPort = ports.find(p => p.id === loop.ports.return);

  if (supplyPort && returnPort) {
    const isLeft = loop.type === 'source';
    
    activeInlets.push({
      id: supplyPort.id,
      loopId: loop.id,
      x: isLeft ? 0 : 150,
      y: (1 - supplyPort.height) * 420,
      height: supplyPort.height,
      flow: actuals.flowRate
    });

    activeOutlets.push({
      id: returnPort.id,
      loopId: loop.id,
      x: isLeft ? 0 : 150,
      y: (1 - returnPort.height) * 420,
      height: returnPort.height,
      flow: actuals.flowRate
    });
  }
});

activeInlets.sort((a, b) => b.height - a.height);
activeOutlets.sort((a, b) => b.height - a.height);

const paths = [];
const inletsTemp = activeInlets.map(node => ({ ...node }));
const outletsTemp = activeOutlets.map(node => ({ ...node }));

let i = 0;
let j = 0;

while (i < inletsTemp.length && j < outletsTemp.length) {
  const inlet = inletsTemp[i];
  const outlet = outletsTemp[j];

  const matchedFlow = Math.min(inlet.flow, outlet.flow);
  if (matchedFlow > tol) {
    let pathD = "";
    const isCross = inlet.x !== outlet.x;
    if (!isCross) {
      pathD = `M ${inlet.x} ${inlet.y} C 75 ${inlet.y}, 75 ${outlet.y}, ${outlet.x} ${outlet.y}`;
    } else {
      pathD = `M ${inlet.x} ${inlet.y} L ${outlet.x} ${outlet.y}`;
    }

    paths.push({
      d: pathD,
      flow: matchedFlow,
      isCross,
      inletX: inlet.x,
      inletY: inlet.y,
      outletX: outlet.x,
      outletY: outlet.y
    });

    inlet.flow -= matchedFlow;
    outlet.flow -= matchedFlow;
  }

  if (inlet.flow <= tol) {
    i++;
  }
  if (outlet.flow <= tol) {
    j++;
  }
}

console.log("Matched Paths Count:", paths.length);
paths.forEach((p, idx) => {
  let midX = 0;
  let midY = (p.inletY + p.outletY) / 2;
  if (p.inletX === p.outletX) {
    midX = p.inletX === 0 ? 56.25 : 93.75;
  } else {
    midX = (p.inletX + p.outletX) / 2;
  }
  console.log(`Path ${idx}: flow=${p.flow.toFixed(2)}, isCross=${p.isCross}, midX=${midX}, midY=${midY}`);
});
