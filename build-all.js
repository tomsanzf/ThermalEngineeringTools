const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const dirs = [
  'heat-pump-visualizer',
  'p-h-diagram-hp',
  'pfd-overlay-studio',
  'sankeyloop/SankeyLoop-Stable',
  'thermal-storage-calculator',
  'pinch-analysis'
];

console.log("Starting build of all sub-projects...");

dirs.forEach(dir => {
  const fullPath = path.join(root, dir);
  if (fs.existsSync(path.join(fullPath, 'package.json'))) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Building project: ${dir}`);
    console.log(`--------------------------------------------------`);
    try {
      execSync('npm run build', { cwd: fullPath, stdio: 'inherit' });
    } catch (e) {
      console.error(`Failed to build project in ${dir}:`, e.message);
    }
  } else {
    console.log(`Skipping ${dir} (directory or package.json not found yet)`);
  }
});

console.log("\nAll builds finished!");
