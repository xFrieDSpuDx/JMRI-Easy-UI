// js/controllers/settings/selectors.js
// Centralized DOM selectors for the Settings panel.
//
// Usage:
//   import { SETTINGS_SELECTORS, querySettingsElements } from "./selectors.js";
//   const { panelElement } = querySettingsElements();

/** Readable selector map for Settings-related elements. */
export const SETTINGS_SELECTORS = Object.freeze({
  panel: "#panelSettings",
  connectionsSelect: "#jmriConnectionSelect",
});

/**
 * Query and return the key Settings elements.
 *
 * @param {ParentNode} [root=document] - Optional root node to scope the queries.
 * @returns {{
 *   panelElement: HTMLElement|null,
 *   connectionsElement: HTMLSelectElement|null
 * }}
 */
export function querySettingsElements(root = document) {
  const find = (selector) => /** @type {HTMLElement|null} */ (root.querySelector(selector));

  return {
    panelElement: find(SETTINGS_SELECTORS.panel),
    connectionsElement: /** @type {HTMLSelectElement|null} */ (find(SETTINGS_SELECTORS.connectionsSelect)),
  };
}
