/**
 * DonutChart — renders a donut/ring chart using SVG.
 *
 * Usage:
 *   const chart = new DonutChart(containerEl, { size: 160 });
 *   chart.render([
 *     { label: 'Completed', value: 72, color: '#22c55e' },
 *     { label: 'Pending',   value: 18, color: '#eab308' },
 *     { label: 'Failed',    value: 10, color: '#ef4444' },
 *   ]);
 */
class DonutChart {
  /**
   * @param {HTMLElement} container
   * @param {Object}  [opts]
   * @param {number}  [opts.size=160]
   * @param {number}  [opts.strokeWidth=18]
   * @param {boolean} [opts.showLegend=true]
   * @param {boolean} [opts.showCenter=true]
   * @param {string}  [opts.centerLabel='']
   * @param {boolean} [opts.animate=true]
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.size = opts.size || 160;
    this.strokeWidth = opts.strokeWidth || 18;
    this.showLegend = opts.showLegend !== false;
    this.showCenter = opts.showCenter !== false;
    this.centerLabel = opts.centerLabel || '';
    this.animate = opts.animate !== false;
  }

  /**
   * Render the donut chart.
   * @param {{ label: string, value: number, color?: string }[]} data
   */
  render(data) {
    if (!data || !data.length) {
      this.container.innerHTML = '<p class="chart-empty">No data available</p>';
      return;
    }

    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) {
      this.container.innerHTML = '<p class="chart-empty">No data available</p>';
      return;
    }

    const defaultColors = ['#6366f1', '#22c55e', '#eab308', '#ef4444', '#3b82f6', '#f97316', '#8b5cf6'];
    const svgNS = 'http://www.w3.org/2000/svg';
    const half = this.size / 2;
    const radius = half - this.strokeWidth / 2;
    const circumference = 2 * Math.PI * radius;

    const wrapper = document.createElement('div');
    wrapper.className = 'donut-chart';

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', this.size);
    svg.setAttribute('height', this.size);
    svg.setAttribute('viewBox', `0 0 ${this.size} ${this.size}`);
    svg.classList.add('donut-chart__svg');

    // Background ring
    const bg = document.createElementNS(svgNS, 'circle');
    bg.setAttribute('cx', half);
    bg.setAttribute('cy', half);
    bg.setAttribute('r', radius);
    bg.setAttribute('fill', 'none');
    bg.setAttribute('stroke', 'var(--chart-track, #e5e7eb)');
    bg.setAttribute('stroke-width', this.strokeWidth);
    svg.appendChild(bg);

    // Segments
    let offset = 0;
    data.forEach((d, i) => {
      const pct = d.value / total;
      const segLen = pct * circumference;
      const gapLen = circumference - segLen;
      const color = d.color || defaultColors[i % defaultColors.length];

      const circle = document.createElementNS(svgNS, 'circle');
      circle.setAttribute('cx', half);
      circle.setAttribute('cy', half);
      circle.setAttribute('r', radius);
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', color);
      circle.setAttribute('stroke-width', this.strokeWidth);
      circle.setAttribute('stroke-dasharray', `${segLen} ${gapLen}`);
      circle.setAttribute('stroke-dashoffset', -offset);
      circle.setAttribute('stroke-linecap', 'round');
      circle.style.transform = 'rotate(-90deg)';
      circle.style.transformOrigin = '50% 50%';
      circle.classList.add('donut-chart__segment');
      if (this.animate) {
        circle.style.opacity = '0';
        circle.style.transition = `opacity 0.5s ease ${i * 0.15}s`;
      }
      svg.appendChild(circle);

      offset += segLen;
    });

    // Center text
    if (this.showCenter) {
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', half);
      text.setAttribute('y', half);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.classList.add('donut-chart__center-text');
      text.textContent = this.centerLabel || DOM.formatNumber(total);
      svg.appendChild(text);
    }

    wrapper.appendChild(svg);

    // Legend
    if (this.showLegend) {
      const legend = document.createElement('ul');
      legend.className = 'donut-chart__legend';
      data.forEach((d, i) => {
        const color = d.color || defaultColors[i % defaultColors.length];
        const li = document.createElement('li');
        li.className = 'donut-chart__legend-item';
        li.innerHTML = `<span class="donut-chart__legend-dot" style="background:${color}"></span>` +
          `<span class="donut-chart__legend-label">${d.label}</span>` +
          `<span class="donut-chart__legend-value">${DOM.formatNumber(d.value)}</span>`;
        legend.appendChild(li);
      });
      wrapper.appendChild(legend);
    }

    this.container.innerHTML = '';
    this.container.appendChild(wrapper);

    // Animate
    if (this.animate) {
      requestAnimationFrame(() => {
        svg.querySelectorAll('.donut-chart__segment').forEach(seg => {
          seg.style.opacity = '1';
        });
      });
    }
  }

  clear() {
    this.container.innerHTML = '';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DonutChart;
}
