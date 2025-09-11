// js/ui/dom.js
import { renderRailroadName } from "./header.js";

/**
 * Escape a string for safe HTML insertion.
 *
 * @param {unknown} value - Any value; will be stringified.
 * @returns {string} Escaped HTML string.
 */
export function escapeHtml(value) {
  return (value ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Initialize DOM-driven UI bits that need initial data.
 *
 * @returns {Promise<void>}
 */
export async function initDom() {
  await renderRailroadName();
}

/**
 * Query a single element within an optional root.
 *
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {HTMLElement|null}
 */
export function query(selector, root = document) {
  return root.querySelector(selector);
}

/**
 * Set the value of an input-like element selected by CSS selector.
 *
 * @param {string} selector
 * @param {string} [value=""]
 * @returns {void}
 */
export function setInputValue(selector, value = "") {
  const element = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (query(selector));
  if (element) element.value = value;
}

/**
 * Get the trimmed value of an input-like element selected by CSS selector.
 *
 * @param {string} selector
 * @returns {string}
 */
export function getInputValue(selector) {
  const element = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (query(selector));
  return element?.value?.trim() ?? "";
}

/**
 * Determine whether a checkbox/radio element is checked. Accepts a selector or element.
 *
 * @param {string | HTMLInputElement} selectorOrElement
 * @returns {boolean}
 */
export function isElementChecked(selectorOrElement) {
  const element =
    typeof selectorOrElement === "string"
      ? /** @type {HTMLInputElement | null} */ (query(selectorOrElement))
      : selectorOrElement;
  return !!element?.checked;
}

/**
 * Set the src of an <img> (or img-like) element selected by CSS selector.
 *
 * @param {string} selector
 * @param {string} [src=""]
 * @returns {void}
 */
export function setImageSource(selector, src = "") {
  const element = /** @type {HTMLImageElement | null} */ (query(selector));
  if (element) element.src = src || "";
}

/**
 * Build a roster icon URL for a given roster ID, with cache-busting.
 *
 * @param {string} id
 * @returns {string}
 */
export function buildRosterIconUrlForId(id) {
  const trimmedId = (id || "").trim();
  if (!trimmedId) return "";
  return `/api/roster/icon?id=${encodeURIComponent(trimmedId)}&v=${Date.now()}`;
}
