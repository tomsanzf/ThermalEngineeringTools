const fs = require('fs');
const path = require('path');

const mockElement = {
  nodeType: 1,
  tagName: 'DIV',
  appendChild: () => {},
  removeChild: () => {},
  insertBefore: () => {},
  setAttribute: () => {},
  removeAttribute: () => {},
  style: {},
  ownerDocument: null,
  namespaceURI: 'http://www.w3.org/1999/xhtml',
  getRootNode: () => {},
  childNodes: [],
  addEventListener: () => {},
  removeEventListener: () => {}
};
mockElement.ownerDocument = {
  nodeType: 9,
  createElement: () => mockElement,
  createElementNS: () => mockElement,
  createTextNode: () => ({ nodeType: 3 }),
  createComment: () => ({ nodeType: 8 })
};

// Mock browser globals
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  },
  location: { href: 'http://localhost:5000/thermal-storage-calculator/dist/index.html' },
  navigator: { userAgent: 'node' }
};
global.MutationObserver = global.window.MutationObserver;
global.document = mockElement.ownerDocument;
global.document.getElementById = () => mockElement;
global.document.querySelectorAll = () => [];
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
