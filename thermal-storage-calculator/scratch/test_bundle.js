const fs = require('fs');
const path = require('path');

// Mock browser globals
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  location: { href: 'http://localhost:5000/thermal-storage-calculator/dist/index.html' },
  navigator: { userAgent: 'node' }
};
global.document = {
  getElementById: () => ({
    appendChild: () => {},
    style: {}
  }),
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({
    style: {},
    setAttribute: () => {},
    appendChild: () => {}
  }),
  body: {
    appendChild: () => {}
  }
};
global.navigator = global.window.navigator;
global.self = global.window;

// Find the index JS file in dist/assets
const assetsDir = path.join(__dirname, '..', 'dist', 'assets');
const files = fs.readdirSync(assetsDir);
const jsFile = files.find(f => f.endsWith('.js'));

if (!jsFile) {
  console.error("No JS bundle found in dist/assets");
  process.exit(1);
}

const jsPath = path.join(assetsDir, jsFile);
console.log("Loading JS bundle:", jsPath);
const code = fs.readFileSync(jsPath, 'utf8');

try {
  eval(code);
  console.log("Successfully executed JS bundle without top-level errors!");
} catch (err) {
  console.error("RUNTIME ERROR DETECTED:");
  console.error(err);
}
