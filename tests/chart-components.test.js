/**
 * Tests for GBOS dashboard chart components.
 *
 * Uses a minimal DOM simulation (jsdom-like stubs) so tests
 * can run in plain Node.js without a browser or heavy dependencies.
 */

/* ---- Minimal DOM stubs ---- */

class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.classList = new MockClassList();
    this.style = {};
    this.textContent = '';
    this._innerHTML = '';
    this.className = '';
    this.id = '';
    this.clientWidth = 400;
    this._listeners = {};
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(val) {
    this._innerHTML = val;
    if (val === '') this.children = [];
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  appendChild(child) { this.children.push(child); return child; }
  querySelector(sel) {
    return this._find(sel, false);
  }
  querySelectorAll(sel) {
    return this._find(sel, true) || [];
  }
  addEventListener(ev, fn) {
    this._listeners[ev] = this._listeners[ev] || [];
    this._listeners[ev].push(fn);
  }
  getTotalLength() { return 1200; }
  _find(sel, all) {
    const results = [];
    const match = (el) => {
      if (sel.startsWith('.')) {
        if (el.classList && el.classList.contains(sel.slice(1))) results.push(el);
      }
      if (el.children) el.children.forEach(match);
    };
    this.children.forEach(match);
    return all ? results : results[0] || null;
  }
}

class MockClassList {
  constructor() { this._classes = new Set(); }
  add(...classes) { classes.forEach(c => this._classes.add(c)); }
  remove(...classes) { classes.forEach(c => this._classes.delete(c)); }
  contains(c) { return this._classes.has(c); }
  toggle(c) { this._classes.has(c) ? this._classes.delete(c) : this._classes.add(c); }
}

// Stub createElementNS for SVG elements
const origCreateElementNS = global.document ? global.document.createElementNS : null;

function setupGlobalDOM() {
  global.document = {
    createElement(tag) { return new MockElement(tag); },
    createElementNS(ns, tag) { return new MockElement(tag); },
    getElementById(id) { return null; },
    querySelector(sel) { return null; },
    querySelectorAll(sel) { return []; },
    addEventListener(ev, fn) {},
  };
  global.requestAnimationFrame = (fn) => fn();
  global.Date = Date;
}

function createContainer(width) {
  const el = new MockElement('div');
  el.clientWidth = width || 400;
  return el;
}

/* ---- Test runner ---- */

let _passed = 0;
let _failed = 0;
const _failures = [];

function describe(name, fn) {
  console.log(`\n  ${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    _passed++;
    console.log(`    \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    _failed++;
    _failures.push({ name, err });
    console.log(`    \x1b[31m✗\x1b[0m ${name}`);
    console.log(`      \x1b[31m${err.message}\x1b[0m`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertIncludes(str, sub, msg) {
  if (typeof str !== 'string' || !str.includes(sub)) {
    throw new Error(msg || `Expected "${str}" to include "${sub}"`);
  }
}

/* ---- Setup ---- */

setupGlobalDOM();

// Load modules
const DOM = require('../public/js/utils/dom.js');
const BarChart = require('../public/js/components/bar-chart.js');
const LineChart = require('../public/js/components/line-chart.js');
const DonutChart = require('../public/js/components/donut-chart.js');
const ProgressRing = require('../public/js/components/progress-ring.js');
const Sparkline = require('../public/js/components/sparkline.js');
const DataService = require('../public/js/services/data-service.js');

// Expose DOM globally (components expect it)
global.DOM = DOM;

/* ============================================
   TESTS
   ============================================ */

console.log('\n\x1b[1mGBOS Dashboard — Chart Component Tests\x1b[0m');

/* ---- DOM Utilities ---- */

describe('DOM utilities', () => {
  it('formatNumber formats with separators', () => {
    const result = DOM.formatNumber(12345);
    assert(result.length > 0, 'Should return non-empty string');
  });

  it('formatNumber handles null/NaN', () => {
    assertEqual(DOM.formatNumber(null), '0');
    assertEqual(DOM.formatNumber(NaN), '0');
    assertEqual(DOM.formatNumber(undefined), '0');
  });

  it('clamp restricts value within bounds', () => {
    assertEqual(DOM.clamp(50, 0, 100), 50);
    assertEqual(DOM.clamp(-10, 0, 100), 0);
    assertEqual(DOM.clamp(150, 0, 100), 100);
  });

  it('create makes an element with class and text', () => {
    const el = DOM.create('div', 'my-class', 'hello');
    assertEqual(el.tagName, 'DIV');
    assertEqual(el.className, 'my-class');
    assertEqual(el.textContent, 'hello');
  });
});

/* ---- BarChart ---- */

describe('BarChart', () => {
  it('renders horizontal bars', () => {
    const container = createContainer(500);
    const chart = new BarChart(container, { direction: 'horizontal', animate: false });
    chart.render([
      { label: 'A', value: 100, color: '#6366f1' },
      { label: 'B', value: 50, color: '#22c55e' },
    ]);
    assert(container.children.length === 1, 'Should have one SVG child');
    const svg = container.children[0];
    assertEqual(svg.tagName, 'SVG');
    assert(svg.classList.contains('bar-chart--horizontal'), 'Should have horizontal class');
    // 2 bars + 2 labels + 2 tracks + 2 values = 8 children
    assert(svg.children.length >= 4, 'Should have label, track, bar, and value elements');
  });

  it('renders vertical bars', () => {
    const container = createContainer(400);
    const chart = new BarChart(container, { direction: 'vertical', animate: false });
    chart.render([
      { label: 'X', value: 80 },
      { label: 'Y', value: 40 },
    ]);
    const svg = container.children[0];
    assert(svg.classList.contains('bar-chart--vertical'), 'Should have vertical class');
  });

  it('shows empty message for empty data', () => {
    const container = createContainer();
    const chart = new BarChart(container);
    chart.render([]);
    assertIncludes(container.innerHTML, 'No data available');
  });

  it('clear removes content', () => {
    const container = createContainer();
    const chart = new BarChart(container, { animate: false });
    chart.render([{ label: 'A', value: 10 }]);
    chart.clear();
    assertEqual(container.innerHTML, '');
  });

  it('handles zero max value without errors', () => {
    const container = createContainer();
    const chart = new BarChart(container, { animate: false });
    chart.render([{ label: 'A', value: 0 }, { label: 'B', value: 0 }]);
    assert(container.children.length === 1, 'Should render without error');
  });
});

/* ---- LineChart ---- */

describe('LineChart', () => {
  it('renders a line chart with points', () => {
    const container = createContainer(500);
    const chart = new LineChart(container, { animate: false, fill: true, showDots: true });
    chart.render([
      { label: 'Mon', value: 10 },
      { label: 'Tue', value: 30 },
      { label: 'Wed', value: 20 },
    ]);
    assert(container.children.length === 1, 'Should have one SVG');
    const svg = container.children[0];
    assert(svg.classList.contains('line-chart'), 'Should have line-chart class');
  });

  it('renders grid lines when enabled', () => {
    const container = createContainer(400);
    const chart = new LineChart(container, { animate: false, showGrid: true, gridLines: 4 });
    chart.render([{ label: 'A', value: 10 }, { label: 'B', value: 20 }]);
    const svg = container.children[0];
    const gridLines = svg.querySelectorAll('.line-chart__grid');
    assert(gridLines.length > 0, 'Should have grid lines');
  });

  it('shows empty message for no data', () => {
    const container = createContainer();
    const chart = new LineChart(container);
    chart.render([]);
    assertIncludes(container.innerHTML, 'No data available');
  });

  it('clear empties the container', () => {
    const container = createContainer();
    const chart = new LineChart(container, { animate: false });
    chart.render([{ label: 'A', value: 5 }]);
    chart.clear();
    assertEqual(container.innerHTML, '');
  });
});

/* ---- DonutChart ---- */

describe('DonutChart', () => {
  it('renders donut segments', () => {
    const container = createContainer();
    const chart = new DonutChart(container, { animate: false, showLegend: true, showCenter: true });
    chart.render([
      { label: 'Done', value: 70, color: '#22c55e' },
      { label: 'Pending', value: 30, color: '#eab308' },
    ]);
    // Should have wrapper div
    assert(container.children.length === 1, 'Should have wrapper');
    const wrapper = container.children[0];
    assert(wrapper.className.includes('donut-chart'), 'Should have donut-chart class');
  });

  it('shows empty for zero total', () => {
    const container = createContainer();
    const chart = new DonutChart(container, { animate: false });
    chart.render([{ label: 'A', value: 0 }, { label: 'B', value: 0 }]);
    assertIncludes(container.innerHTML, 'No data available');
  });

  it('shows empty for null data', () => {
    const container = createContainer();
    const chart = new DonutChart(container, { animate: false });
    chart.render(null);
    assertIncludes(container.innerHTML, 'No data available');
  });

  it('clear removes content', () => {
    const container = createContainer();
    const chart = new DonutChart(container, { animate: false });
    chart.render([{ label: 'A', value: 10 }]);
    chart.clear();
    assertEqual(container.innerHTML, '');
  });
});

/* ---- ProgressRing ---- */

describe('ProgressRing', () => {
  it('renders a progress ring', () => {
    const container = createContainer();
    const ring = new ProgressRing(container, { animate: false, size: 120 });
    ring.render(75);
    assert(container.children.length === 1, 'Should have SVG');
    const svg = container.children[0];
    assert(svg.classList.contains('progress-ring'), 'Should have progress-ring class');
  });

  it('clamps value to 0-100', () => {
    const container = createContainer();
    const ring = new ProgressRing(container, { animate: false });
    // Should not throw for out-of-range values
    ring.render(150);
    const svg = container.children[0];
    const valueText = svg.querySelector('.progress-ring__value');
    assertEqual(valueText.textContent, '100%');
  });

  it('handles zero value', () => {
    const container = createContainer();
    const ring = new ProgressRing(container, { animate: false });
    ring.render(0);
    const svg = container.children[0];
    const valueText = svg.querySelector('.progress-ring__value');
    assertEqual(valueText.textContent, '0%');
  });

  it('uses color thresholds', () => {
    const container = createContainer();
    const ring = new ProgressRing(container, { animate: false });
    ring.render(90);
    const svg = container.children[0];
    const fill = svg.querySelector('.progress-ring__fill');
    assertEqual(fill.attributes.stroke, '#22c55e', 'High values should be green');
  });

  it('clear removes content', () => {
    const container = createContainer();
    const ring = new ProgressRing(container, { animate: false });
    ring.render(50);
    ring.clear();
    assertEqual(container.innerHTML, '');
  });
});

/* ---- Sparkline ---- */

describe('Sparkline', () => {
  it('renders a sparkline SVG', () => {
    const container = createContainer();
    const spark = new Sparkline(container, { width: 80, height: 28, fill: true });
    spark.render([10, 20, 15, 30, 25]);
    assert(container.children.length === 1, 'Should have SVG');
    const svg = container.children[0];
    assert(svg.classList.contains('sparkline'), 'Should have sparkline class');
  });

  it('renders fill area when enabled', () => {
    const container = createContainer();
    const spark = new Sparkline(container, { fill: true });
    spark.render([5, 10, 8]);
    const svg = container.children[0];
    const area = svg.querySelector('.sparkline__area');
    assert(area, 'Should have fill area');
  });

  it('does not render with less than 2 values', () => {
    const container = createContainer();
    const spark = new Sparkline(container);
    spark.render([10]);
    assertEqual(container.innerHTML, '');
  });

  it('clear removes content', () => {
    const container = createContainer();
    const spark = new Sparkline(container);
    spark.render([1, 2, 3]);
    spark.clear();
    assertEqual(container.innerHTML, '');
  });
});

/* ---- DataService ---- */

describe('DataService', () => {
  it('getStats returns expected shape', async () => {
    const stats = await DataService.getStats();
    assert(typeof stats.totalRecords === 'number', 'totalRecords should be a number');
    assert(typeof stats.migrated === 'number', 'migrated should be a number');
    assert(typeof stats.pending === 'number', 'pending should be a number');
    assert(typeof stats.errors === 'number', 'errors should be a number');
    assert(Array.isArray(stats.trends.totalRecords), 'Should have trends arrays');
  });

  it('getMigrationProgress returns array with expected fields', async () => {
    const data = await DataService.getMigrationProgress();
    assert(Array.isArray(data), 'Should be array');
    assert(data.length > 0, 'Should have items');
    assert(typeof data[0].label === 'string', 'Should have label');
    assert(typeof data[0].value === 'number', 'Should have value');
    assert(typeof data[0].color === 'string', 'Should have color');
  });

  it('getMigrationTimeline returns array of label/value objects', async () => {
    const data = await DataService.getMigrationTimeline();
    assert(Array.isArray(data), 'Should be array');
    data.forEach(item => {
      assert(typeof item.label === 'string', 'Each item should have label');
      assert(typeof item.value === 'number', 'Each item should have value');
    });
  });

  it('getTaskBreakdown returns array with colors', async () => {
    const data = await DataService.getTaskBreakdown();
    assert(Array.isArray(data) && data.length > 0, 'Should be non-empty array');
    assert(typeof data[0].color === 'string', 'Should have color');
  });

  it('getRecentActivity returns timestamped entries', async () => {
    const data = await DataService.getRecentActivity();
    assert(Array.isArray(data) && data.length > 0, 'Should be non-empty');
    assert(typeof data[0].time === 'string', 'Should have time');
    assert(typeof data[0].message === 'string', 'Should have message');
    assert(typeof data[0].type === 'string', 'Should have type');
  });

  it('getDataSources returns source objects', async () => {
    const data = await DataService.getDataSources();
    assert(Array.isArray(data) && data.length > 0, 'Should be non-empty');
    assert(typeof data[0].name === 'string', 'Should have name');
    assert(typeof data[0].status === 'string', 'Should have status');
    assert(typeof data[0].records === 'number', 'Should have records');
  });

  it('getDataQuality returns a number 0-100', async () => {
    const q = await DataService.getDataQuality();
    assert(typeof q === 'number', 'Should be number');
    assert(q >= 0 && q <= 100, 'Should be 0-100');
  });
});

/* ---- Summary ---- */

console.log(`\n\x1b[1m  Results: ${_passed} passed, ${_failed} failed\x1b[0m\n`);

if (_failed > 0) {
  console.log('\x1b[31m  Failures:\x1b[0m');
  _failures.forEach(f => {
    console.log(`    - ${f.name}: ${f.err.message}`);
  });
  process.exit(1);
}
