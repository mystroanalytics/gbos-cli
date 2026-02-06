/**
 * Sparkline — renders a compact inline line chart using SVG.
 * Ideal for showing trends in stat cards.
 *
 * Usage:
 *   const spark = new Sparkline(containerEl, { width: 100, height: 32 });
 *   spark.render([10, 24, 18, 30, 28, 45, 42]);
 */
class Sparkline {
  /**
   * @param {HTMLElement} container
   * @param {Object}  [opts]
   * @param {number}  [opts.width=100]
   * @param {number}  [opts.height=32]
   * @param {string}  [opts.color='#6366f1']
   * @param {boolean} [opts.fill=true]
   * @param {string}  [opts.fillColor='rgba(99,102,241,0.15)']
   * @param {number}  [opts.strokeWidth=2]
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.width = opts.width || 100;
    this.height = opts.height || 32;
    this.color = opts.color || '#6366f1';
    this.fill = opts.fill !== false;
    this.fillColor = opts.fillColor || 'rgba(99,102,241,0.15)';
    this.strokeWidth = opts.strokeWidth || 2;
  }

  /**
   * Render the sparkline.
   * @param {number[]} values
   */
  render(values) {
    if (!values || values.length < 2) {
      this.container.innerHTML = '';
      return;
    }

    const svgNS = 'http://www.w3.org/2000/svg';
    const pad = 2;
    const w = this.width;
    const h = this.height;
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    const range = maxVal - minVal || 1;

    const points = values.map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - minVal) / range) * (h - pad * 2);
      return { x, y };
    });

    const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.classList.add('sparkline');

    if (this.fill) {
      const areaD = pathD +
        ` L${points[points.length - 1].x.toFixed(1)},${h} L${points[0].x.toFixed(1)},${h} Z`;
      const area = document.createElementNS(svgNS, 'path');
      area.setAttribute('d', areaD);
      area.setAttribute('fill', this.fillColor);
      area.classList.add('sparkline__area');
      svg.appendChild(area);
    }

    const line = document.createElementNS(svgNS, 'path');
    line.setAttribute('d', pathD);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', this.color);
    line.setAttribute('stroke-width', this.strokeWidth);
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    line.classList.add('sparkline__line');
    svg.appendChild(line);

    this.container.innerHTML = '';
    this.container.appendChild(svg);
  }

  clear() {
    this.container.innerHTML = '';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Sparkline;
}
