/**
 * LineChart — renders a line/area chart using SVG.
 *
 * Usage:
 *   const chart = new LineChart(containerEl, { fill: true });
 *   chart.render([
 *     { label: 'Mon', value: 20 },
 *     { label: 'Tue', value: 45 },
 *     { label: 'Wed', value: 30 },
 *   ]);
 */
class LineChart {
  /**
   * @param {HTMLElement} container
   * @param {Object}  [opts]
   * @param {string}  [opts.lineColor='#6366f1']
   * @param {string}  [opts.fillColor='rgba(99,102,241,0.15)']
   * @param {boolean} [opts.fill=true]
   * @param {boolean} [opts.showDots=true]
   * @param {boolean} [opts.showGrid=true]
   * @param {boolean} [opts.showLabels=true]
   * @param {boolean} [opts.animate=true]
   * @param {number}  [opts.height=200]
   * @param {number}  [opts.gridLines=4]
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.lineColor = opts.lineColor || '#6366f1';
    this.fillColor = opts.fillColor || 'rgba(99,102,241,0.15)';
    this.fill = opts.fill !== false;
    this.showDots = opts.showDots !== false;
    this.showGrid = opts.showGrid !== false;
    this.showLabels = opts.showLabels !== false;
    this.animate = opts.animate !== false;
    this.height = opts.height || 200;
    this.gridLines = opts.gridLines || 4;
  }

  /**
   * Render the chart.
   * @param {{ label: string, value: number }[]} data
   */
  render(data) {
    if (!data || !data.length) {
      this.container.innerHTML = '<p class="chart-empty">No data available</p>';
      return;
    }

    const svgNS = 'http://www.w3.org/2000/svg';
    const width = this.container.clientWidth || 400;
    const padLeft = 45;
    const padRight = 20;
    const padTop = 15;
    const padBottom = this.showLabels ? 35 : 10;
    const chartW = width - padLeft - padRight;
    const chartH = this.height - padTop - padBottom;
    const totalH = this.height;

    const maxVal = Math.max(...data.map(d => d.value));
    const minVal = 0;
    const range = maxVal - minVal || 1;

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', totalH);
    svg.setAttribute('viewBox', `0 0 ${width} ${totalH}`);
    svg.classList.add('line-chart');

    // Grid lines
    if (this.showGrid) {
      for (let i = 0; i <= this.gridLines; i++) {
        const y = padTop + (chartH / this.gridLines) * i;
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', padLeft);
        line.setAttribute('y1', y);
        line.setAttribute('x2', width - padRight);
        line.setAttribute('y2', y);
        line.classList.add('line-chart__grid');
        svg.appendChild(line);

        // Grid value labels
        const val = maxVal - (range / this.gridLines) * i;
        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', padLeft - 8);
        text.setAttribute('y', y + 4);
        text.setAttribute('text-anchor', 'end');
        text.classList.add('line-chart__grid-label');
        text.textContent = val >= 1000 ? Math.round(val / 1000) + 'k' : Math.round(val);
        svg.appendChild(text);
      }
    }

    // Build points
    const points = data.map((d, i) => {
      const x = padLeft + (i / (data.length - 1 || 1)) * chartW;
      const y = padTop + chartH - ((d.value - minVal) / range) * chartH;
      return { x, y, label: d.label, value: d.value };
    });

    const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');

    // Fill area
    if (this.fill) {
      const areaD = pathD +
        ` L${points[points.length - 1].x},${padTop + chartH}` +
        ` L${points[0].x},${padTop + chartH} Z`;
      const area = document.createElementNS(svgNS, 'path');
      area.setAttribute('d', areaD);
      area.setAttribute('fill', this.fillColor);
      area.classList.add('line-chart__area');
      if (this.animate) area.style.opacity = '0';
      svg.appendChild(area);
    }

    // Line
    const line = document.createElementNS(svgNS, 'path');
    line.setAttribute('d', pathD);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', this.lineColor);
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    line.classList.add('line-chart__line');
    if (this.animate) {
      const len = line.getTotalLength ? 1200 : 0;
      line.style.strokeDasharray = len;
      line.style.strokeDashoffset = len;
    }
    svg.appendChild(line);

    // Dots
    if (this.showDots) {
      points.forEach((p, i) => {
        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', p.x);
        circle.setAttribute('cy', p.y);
        circle.setAttribute('r', 4);
        circle.setAttribute('fill', this.lineColor);
        circle.classList.add('line-chart__dot');
        if (this.animate) {
          circle.style.opacity = '0';
          circle.style.transition = `opacity 0.3s ease ${0.4 + i * 0.06}s`;
        }
        svg.appendChild(circle);
      });
    }

    // X-axis labels
    if (this.showLabels) {
      points.forEach((p) => {
        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', p.x);
        text.setAttribute('y', padTop + chartH + 22);
        text.setAttribute('text-anchor', 'middle');
        text.classList.add('line-chart__label');
        text.textContent = p.label;
        svg.appendChild(text);
      });
    }

    this.container.innerHTML = '';
    this.container.appendChild(svg);

    // Animate in
    if (this.animate) {
      requestAnimationFrame(() => {
        const lineEl = svg.querySelector('.line-chart__line');
        if (lineEl) {
          const totalLen = lineEl.getTotalLength ? lineEl.getTotalLength() : 1200;
          lineEl.style.strokeDasharray = totalLen;
          lineEl.style.strokeDashoffset = totalLen;
          lineEl.style.transition = 'stroke-dashoffset 0.8s ease';
          requestAnimationFrame(() => {
            lineEl.style.strokeDashoffset = '0';
          });
        }
        const areaEl = svg.querySelector('.line-chart__area');
        if (areaEl) {
          areaEl.style.transition = 'opacity 0.6s ease 0.4s';
          areaEl.style.opacity = '1';
        }
        svg.querySelectorAll('.line-chart__dot').forEach(dot => {
          dot.style.opacity = '1';
        });
      });
    }
  }

  clear() {
    this.container.innerHTML = '';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LineChart;
}
