/**
 * Dashboard — main controller that initialises all chart components
 * and wires up the data service to the UI.
 */
const Dashboard = (() => {
  let charts = {};

  /**
   * Initialise the dashboard – called on DOMContentLoaded.
   */
  async function init() {
    _setupSidebar();
    await _loadAllData();
  }

  /* ---------- sidebar navigation ---------- */

  function _setupSidebar() {
    const toggle = DOM.getById('menu-toggle');
    const sidebar = DOM.getById('sidebar');
    if (toggle && sidebar) {
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('sidebar--open');
      });
    }

    DOM.qsa('.sidebar__link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        DOM.qsa('.sidebar__link').forEach(l => l.classList.remove('sidebar__link--active'));
        link.classList.add('sidebar__link--active');
      });
    });
  }

  /* ---------- data loading ---------- */

  async function _loadAllData() {
    try {
      const [stats, progress, timeline, tasks, activity, sources, quality] = await Promise.all([
        DataService.getStats(),
        DataService.getMigrationProgress(),
        DataService.getMigrationTimeline(),
        DataService.getTaskBreakdown(),
        DataService.getRecentActivity(),
        DataService.getDataSources(),
        DataService.getDataQuality(),
      ]);

      _renderStats(stats);
      _renderMigrationProgress(progress);
      _renderMigrationTimeline(timeline);
      _renderTaskBreakdown(tasks);
      _renderActivity(activity);
      _renderSources(sources);
      _renderQuality(quality);
    } catch (err) {
      console.error('Dashboard data load failed:', err);
    }
  }

  /* ---------- renderers ---------- */

  function _renderStats(stats) {
    DOM.setText('stat-total-records', DOM.formatNumber(stats.totalRecords));
    DOM.setText('stat-migrated', DOM.formatNumber(stats.migrated));
    DOM.setText('stat-pending', DOM.formatNumber(stats.pending));
    DOM.setText('stat-errors', DOM.formatNumber(stats.errors));

    // Calculate change percentages
    const trends = stats.trends;
    _setChange('total-records', trends.totalRecords);
    _setChange('migrated', trends.migrated);
    _setChange('pending', trends.pending);
    _setChange('errors', trends.errors);

    // Render sparklines in stat cards
    _renderStatSparklines(trends);
  }

  function _setChange(statName, trend) {
    if (!trend || trend.length < 2) return;
    const prev = trend[trend.length - 2];
    const curr = trend[trend.length - 1];
    const pct = prev > 0 ? (((curr - prev) / prev) * 100).toFixed(1) : 0;
    const card = DOM.qs(`[data-stat="${statName}"]`);
    if (!card) return;
    const changeEl = DOM.qs('.card__change', card);
    if (!changeEl) return;
    const arrow = pct >= 0 ? '\u2191' : '\u2193';
    changeEl.textContent = `${arrow} ${Math.abs(pct)}%`;
    changeEl.classList.remove('card__change--up', 'card__change--down');
    changeEl.classList.add(pct >= 0 ? 'card__change--up' : 'card__change--down');
  }

  function _renderStatSparklines(trends) {
    Object.entries(trends).forEach(([key, values]) => {
      const statName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      const card = DOM.qs(`[data-stat="${statName}"]`);
      if (!card) return;
      let sparkContainer = DOM.qs('.card__sparkline', card);
      if (!sparkContainer) {
        sparkContainer = DOM.create('div', 'card__sparkline');
        card.appendChild(sparkContainer);
      }
      const color = statName === 'errors' ? '#ef4444' : '#6366f1';
      const spark = new Sparkline(sparkContainer, { width: 80, height: 28, color });
      spark.render(values);
    });
  }

  function _renderMigrationProgress(data) {
    const container = DOM.getById('progress-bars');
    if (!container) return;

    // Render as horizontal bar chart showing progress per source
    const chartData = data.map(d => ({
      label: d.label,
      value: d.value,
      color: d.color,
    }));

    charts.migrationBars = new BarChart(container, {
      direction: 'horizontal',
      barHeight: 26,
      gap: 14,
      labelWidth: 110,
    });
    charts.migrationBars.render(chartData);
  }

  function _renderMigrationTimeline(data) {
    // Add a timeline chart card to the grid if not present
    let card = DOM.getById('timeline-card');
    if (!card) {
      card = DOM.create('div', 'card card--timeline');
      card.id = 'timeline-card';
      card.innerHTML = '<div class="card__header"><h2 class="card__title">Migration Volume</h2></div>' +
        '<div class="card__body"><div id="timeline-chart"></div></div>';
      const grid = DOM.getById('main-grid');
      if (grid) grid.appendChild(card);
    }

    const container = DOM.getById('timeline-chart');
    if (!container) return;

    charts.timeline = new LineChart(container, {
      lineColor: '#6366f1',
      height: 220,
      fill: true,
    });
    charts.timeline.render(data);
  }

  function _renderTaskBreakdown(data) {
    // Add a task breakdown card to the grid if not present
    let card = DOM.getById('tasks-card');
    if (!card) {
      card = DOM.create('div', 'card card--tasks');
      card.id = 'tasks-card';
      card.innerHTML = '<div class="card__header"><h2 class="card__title">Task Breakdown</h2></div>' +
        '<div class="card__body"><div id="tasks-donut"></div></div>';
      const grid = DOM.getById('main-grid');
      if (grid) grid.appendChild(card);
    }

    const container = DOM.getById('tasks-donut');
    if (!container) return;

    charts.taskDonut = new DonutChart(container, {
      size: 150,
      strokeWidth: 16,
      centerLabel: data.reduce((s, d) => s + d.value, 0).toString(),
    });
    charts.taskDonut.render(data);
  }

  function _renderActivity(data) {
    const list = DOM.getById('activity-list');
    if (!list) return;
    list.innerHTML = '';

    data.forEach(item => {
      const li = DOM.create('li', 'activity-item');
      const dot = DOM.create('span', `activity-item__dot activity-item__dot--${item.type}`);
      const msg = DOM.create('span', 'activity-item__message', item.message);
      const time = DOM.create('span', 'activity-item__time', _relativeTime(item.time));
      li.appendChild(dot);
      li.appendChild(msg);
      li.appendChild(time);
      list.appendChild(li);
    });
  }

  function _renderSources(data) {
    const list = DOM.getById('source-list');
    if (!list) return;
    list.innerHTML = '';

    data.forEach(src => {
      const li = DOM.create('li', 'source-item');
      const status = DOM.create('span', `source-item__status source-item__status--${src.status}`);
      const name = DOM.create('span', 'source-item__name', src.name);
      const records = DOM.create('span', 'source-item__records', DOM.formatNumber(src.records) + ' records');
      li.appendChild(status);
      li.appendChild(name);
      li.appendChild(records);
      list.appendChild(li);
    });
  }

  function _renderQuality(quality) {
    const meter = DOM.getById('quality-meter');
    if (!meter) return;

    // Replace the static SVG with a ProgressRing component
    meter.innerHTML = '';
    charts.quality = new ProgressRing(meter, {
      size: 120,
      strokeWidth: 10,
    });
    charts.quality.render(quality);
  }

  /* ---------- helpers ---------- */

  function _relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', Dashboard.init);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Dashboard;
}
