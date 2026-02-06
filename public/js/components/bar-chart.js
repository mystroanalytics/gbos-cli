/**
 * BarChart — renders horizontal or vertical bar charts using SVG.
 *
 * Usage:
 *   const chart = new BarChart(containerEl, { direction: 'horizontal' });
 *   chart.render([
 *     { label: 'Users', value: 420, color: '#6366f1' },
 *     { label: 'Tasks', value: 310, color: '#22c55e' },
 *   ]);
 */
class BarChart {
  /**
   * @param {HTMLElement} container
   * @param {Object}  [opts]
   * @param {'horizontal'|'vertical'} [opts.direction='horizontal']
   * @param {number}  [opts.barHeight=28]
   * @param {number}  [opts.gap=12]
   * @param {number}  [opts.labelWidth=100]
   * @param {boolean} [opts.showValues=true]
   * @param {boolean} [opts.animate=true]
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.direction = opts.direction || 'horizontal';
    this.barHeight = opts.barHeight || 28;
    this.gap = opts.gap || 12;
    this.labelWidth = opts.labelWidth || 100;
    this.showValues = opts.showValues !== false;
    this.animate = opts.animate !== false;
  }

  /**
   * Render the chart with the given data.
   * @param {{ label: string, value: number, color?: string }[]} data
   */
  render(data) {
    if (!data || !data.length) {
      this.container.innerHTML = '<p class="chart-empty">No data available</p>';
      return;
    }

    const maxVal = Math.max(...data.map(d => d.value));
    if (this.direction === 'horizontal') {
      this._renderHorizontal(data, maxVal);
    } else {
      this._renderVertical(data, maxVal);
    }
  }

  /** Clear the chart. */
  clear() {
    this.container.innerHTML = '';
  }

  /* ---- private ---- */

  _renderHorizontal(data, maxVal) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const width = this.container.clientWidth || 400;
    const totalHeight = data.length * (this.barHeight + this.gap) - this.gap + 8;
    const barAreaWidth = width - this.labelWidth - 60;

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', totalHeight);
    svg.setAttribute('viewBox', `0 0 ${width} ${totalHeight}`);
    svg.classList.add('bar-chart', 'bar-chart--horizontal');

    data.forEach((d, i) => {
      const y = i * (this.barHeight + this.gap);
      const barWidth = maxVal > 0 ? (d.value / maxVal) * barAreaWidth : 0;
      const color = d.color || '#6366f1';

      // Label
      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', this.labelWidth - 8);
      label.setAttribute('y', y + this.barHeight / 2 + 5);
      label.setAttribute('text-anchor', 'end');
      label.classList.add('bar-chart__label');
      label.textContent = d.label;
      svg.appendChild(label);

      // Background track
      const track = document.createElementNS(svgNS, 'rect');
      track.setAttribute('x', this.labelWidth);
      track.setAttribute('y', y);
      track.setAttribute('width', barAreaWidth);
      track.setAttribute('height', this.barHeight);
      track.setAttribute('rx', 4);
      track.classList.add('bar-chart__track');
      svg.appendChild(track);

      // Bar
      const bar = document.createElementNS(svgNS, 'rect');
      bar.setAttribute('x', this.labelWidth);
      bar.setAttribute('y', y);
      bar.setAttribute('width', this.animate ? 0 : barWidth);
      bar.setAttribute('height', this.barHeight);
      bar.setAttribute('rx', 4);
      bar.setAttribute('fill', color);
      bar.classList.add('bar-chart__bar');
      if (this.animate) {
        bar.style.transition = `width 0.6s ease ${i * 0.1}s`;
      }
      svg.appendChild(bar);

      // Value text
      if (this.showValues) {
        const valText = document.createElementNS(svgNS, 'text');
        valText.setAttribute('x', this.labelWidth + barAreaWidth + 8);
        valText.setAttribute('y', y + this.barHeight / 2 + 5);
        valText.classList.add('bar-chart__value');
        valText.textContent = DOM.formatNumber(d.value);
        svg.appendChild(valText);
      }
    });

    this.container.innerHTML = '';
    this.container.appendChild(svg);

    // Trigger animation
    if (this.animate) {
      requestAnimationFrame(() => {
        const bars = svg.querySelectorAll('.bar-chart__bar');
        const maxValLocal = maxVal;
        data.forEach((d, i) => {
          const barWidth = maxValLocal > 0 ? (d.value / maxValLocal) * barAreaWidth : 0;
          bars[i].setAttribute('width', barWidth);
        });
      });
    }
  }

  _renderVertical(data, maxVal) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const width = this.container.clientWidth || 400;
    const chartHeight = 200;
    const bottomPadding = 40;
    const topPadding = 20;
    const totalHeight = chartHeight + bottomPadding + topPadding;
    const barWidth = Math.min(40, (width - 40) / data.length - 8);
    const barGap = (width - 40 - barWidth * data.length) / (data.length + 1);

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', totalHeight);
    svg.setAttribute('viewBox', `0 0 ${width} ${totalHeight}`);
    svg.classList.add('bar-chart', 'bar-chart--vertical');

    data.forEach((d, i) => {
      const x = 20 + barGap + i * (barWidth + barGap);
      const barH = maxVal > 0 ? (d.value / maxVal) * chartHeight : 0;
      const y = topPadding + chartHeight - barH;
      const color = d.color || '#6366f1';

      // Bar
      const bar = document.createElementNS(svgNS, 'rect');
      bar.setAttribute('x', x);
      bar.setAttribute('y', this.animate ? topPadding + chartHeight : y);
      bar.setAttribute('width', barWidth);
      bar.setAttribute('height', this.animate ? 0 : barH);
      bar.setAttribute('rx', 3);
      bar.setAttribute('fill', color);
      bar.classList.add('bar-chart__bar');
      if (this.animate) {
        bar.style.transition = `y 0.6s ease ${i * 0.1}s, height 0.6s ease ${i * 0.1}s`;
      }
      svg.appendChild(bar);

      // Label
      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', x + barWidth / 2);
      label.setAttribute('y', topPadding + chartHeight + 20);
      label.setAttribute('text-anchor', 'middle');
      label.classList.add('bar-chart__label');
      label.textContent = d.label;
      svg.appendChild(label);

      // Value on top
      if (this.showValues) {
        const valText = document.createElementNS(svgNS, 'text');
        valText.setAttribute('x', x + barWidth / 2);
        valText.setAttribute('y', y - 6);
        valText.setAttribute('text-anchor', 'middle');
        valText.classList.add('bar-chart__value');
        valText.textContent = DOM.formatNumber(d.value);
        svg.appendChild(valText);
      }
    });

    this.container.innerHTML = '';
    this.container.appendChild(svg);

    // Trigger animation
    if (this.animate) {
      requestAnimationFrame(() => {
        const bars = svg.querySelectorAll('.bar-chart__bar');
        data.forEach((d, i) => {
          const barH = maxVal > 0 ? (d.value / maxVal) * chartHeight : 0;
          const y = topPadding + chartHeight - barH;
          bars[i].setAttribute('y', y);
          bars[i].setAttribute('height', barH);
        });
      });
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BarChart;
}
