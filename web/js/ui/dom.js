// js/ui/dom.js
import { renderRailroadName } from "./header.js";

/** Shorthand for querySelector. */
export const queryOne = (selector, root = document) =>
  root.querySelector(selector);

/** Shorthand for querySelectorAll (returns a real Array). */
export const queryAll = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

/**
 * Escape a string for safe HTML insertion.
 *
 * @param {unknown} text - Any value; will be stringified.
 * @returns {string} Escaped HTML string.
 */
export function escapeHtml(value) {
  return (value ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function initDom() {
  await renderRailroadName();
}

export function query(selector, root = document) {
  return root.querySelector(selector);
}

export function setInputValue(selector, value = "") {
  const element = query(selector);
  if (element) element.value = value;
}

export function getInputValue(selector) {
  return query(selector)?.value?.trim() ?? "";
}

export function isElementChecked(element) {
  return !!element?.checked;
}

export function setImageSource(selector, src = "") {
  const element = query(selector);
  if (element) element.src = src || "";
};

export function buildRosterIconUrlForId(id) {
  const trimmed = (id || "").trim() + `&v=${Date.now()}`;
  return trimmed ? `/api/roster/icon?id=${encodeURIComponent(trimmed)}` : "";
}