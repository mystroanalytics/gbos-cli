/**
 * DOM utility helpers for the GBOS dashboard.
 */
const DOM = (() => {
  /**
   * Shorthand for document.getElementById.
   * @param {string} id
   * @returns {HTMLElement|null}
   */
  function getById(id) {
    return document.getElementById(id);
  }

  /**
   * Shorthand for document.querySelector.
   * @param {string} selector
   * @param {HTMLElement} [parent=document]
   * @returns {HTMLElement|null}
   */
  function qs(selector, parent) {
    return (parent || document).querySelector(selector);
  }

  /**
   * Shorthand for document.querySelectorAll (returns Array).
   * @param {string} selector
   * @param {HTMLElement} [parent=document]
   * @returns {HTMLElement[]}
   */
  function qsa(selector, parent) {
    return Array.from((parent || document).querySelectorAll(selector));
  }

  /**
   * Create an element with optional class and text content.
   * @param {string} tag
   * @param {string} [className]
   * @param {string} [text]
   * @returns {HTMLElement}
   */
  function create(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  /**
   * Set the text content of an element by id.
   * @param {string} id
   * @param {string|number} value
   */
  function setText(id, value) {
    const el = getById(id);
    if (el) el.textContent = String(value);
  }

  /**
   * Format a number with locale-aware thousands separators.
   * @param {number} n
   * @returns {string}
   */
  function formatNumber(n) {
    if (n == null || isNaN(n)) return '0';
    return Number(n).toLocaleString();
  }

  /**
   * Clamp a value between min and max.
   * @param {number} val
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  return { getById, qs, qsa, create, setText, formatNumber, clamp };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DOM;
}
