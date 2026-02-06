/**
 * ProgressRing — renders a circular progress indicator using SVG.
 * Designed for single-value metrics like data quality percentage.
 *
 * Usage:
 *   const ring = new ProgressRing(containerEl, { size: 120 });
 *   ring.render(87);
 */
class ProgressRing {
  /**
   * @param {HTMLElement} container
   * @param {Object}  [opts]
   * @param {number}  [opts.size=120]
   * @param {number}  [opts.strokeWidth=10]
   * @param {string}  [opts.color='#6366f1']
   * @param {string}  [opts.trackColor='var(--chart-track, #e5e7eb)']
   * @param {boolean} [opts.showValue=true]
   * @param {string}  [opts.suffix='%']
   * @param {boolean} [opts.animate=true]
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.size = opts.size || 120;
    this.strokeWidth = opts.strokeWidth || 10;
    this.color = opts.color || '#6366f1';
    this.trackColor = opts.trackColor || 'var(--chart-track, #e5e7eb)';
    this.showValue = opts.showValue !== false;
    this.suffix = opts.suffix != null ? opts.suffix : '%';
    this.animate = opts.animate !== false;
  }

  /**
   * Render the progress ring.
   * @param {number} value — percentage (0-100)
   */
  render(value) {
    const pct = DOM.clamp(value || 0, 0, 100);
    const svgNS = 'http://www.w3.org/2000/svg';
    const half = this.size / 2;
    const radius = half - this.strokeWidth / 2;
    const circumference = 2 * Math.PI * radius;
    const dashoffset = circumference - (pct / 100) * circumference;

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', this.size);
    svg.setAttribute('height', this.size);
    svg.setAttribute('viewBox', `0 0 ${this.size} ${this.size}`);
    svg.classList.add('progress-ring');

    // Track
    const track = document.createElementNS(svgNS, 'circle');
    track.setAttribute('cx', half);
    track.setAttribute('cy', half);
    track.setAttribute('r', radius);
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke', this.trackColor);
    track.setAttribute('stroke-width', this.strokeWidth);
    svg.appendChild(track);

    // Fill
    const fill = document.createElementNS(svgNS, 'circle');
    fill.setAttribute('cx', half);
    fill.setAttribute('cy', half);
    fill.setAttribute('r', radius);
    fill.setAttribute('fill', 'none');
    fill.setAttribute('stroke', this._colorForValue(pct));
    fill.setAttribute('stroke-width', this.strokeWidth);
    fill.setAttribute('stroke-linecap', 'round');
    fill.setAttribute('stroke-dasharray', circumference);
    fill.setAttribute('stroke-dashoffset', this.animate ? circumference : dashoffset);
    fill.style.transform = 'rotate(-90deg)';
    fill.style.transformOrigin = '50% 50%';
    fill.classList.add('progress-ring__fill');
    if (this.animate) {
      fill.style.transition = 'stroke-dashoffset 0.8s ease';
    }
    svg.appendChild(fill);

    // Center value
    if (this.showValue) {
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', half);
      text.setAttribute('y', half);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.classList.add('progress-ring__value');
      text.textContent = Math.round(pct) + this.suffix;
      svg.appendChild(text);
    }

    this.container.innerHTML = '';
    this.container.appendChild(svg);

    // Animate
    if (this.animate) {
      requestAnimationFrame(() => {
        fill.setAttribute('stroke-dashoffset', dashoffset);
      });
    }
  }

  clear() {
    this.container.innerHTML = '';
  }

  /** Pick color based on value thresholds. */
  _colorForValue(pct) {
    if (this.color !== '#6366f1') return this.color;
    if (pct >= 80) return '#22c55e';
    if (pct >= 50) return '#eab308';
    return '#ef4444';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProgressRing;
}
