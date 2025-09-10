// js/controllers/settings/selectors.js
// Centralized DOM selectors for the Settings panel.
//
// Usage patterns:
//   import { SETTINGS_SEL } from "./selectors.js";
//   const listEl = document.querySelector(SETTINGS_SEL.list);

/** Readable selector map for Settings-related elements. */
export const SETTINGS_SELECTORS = Object.freeze({
  panel: "#panelTurnouts",
  connectionsSelect: "#jmriConnectionSelect",
});

/**
 * Query and return the key Settings elements.
 *
 * @param {ParentNode} [root=document] - Optional root node to scope the queries.
 * @returns {{
 *   panelElement: Element|null,
 *   connectionsElement: Element|null,
 * }}
 */
export function querySettingsElements(root = document) {
  const query = (selector) => root.querySelector(selector);

  return {
    panelElement: query(SETTINGS_SELECTORS.panel),
    connectionsElement: query(SETTINGS_SELECTORS.connectionsSelect),
  };
}
