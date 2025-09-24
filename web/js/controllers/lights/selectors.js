// js/controllers/lights/selectors.js
// Centralized DOM selectors for the Lights panel.
//
// Usage:
//   import { LIGHTS_SELECTORS, queryLightsElements } from "./selectors.js";
//   const { panelElement, listElement, addButtonElement } = queryLightsElements();

/** Readable selector map for Lights-related elements. */
export const LIGHTS_SELECTORS = Object.freeze({
  panel: "#panelLights",
  list: "#lightsList",
  addButton: "#lightsAddBtn",
});

/**
 * Query and return the key Lights elements.
 *
 * @param {ParentNode} [root=document] - Optional root node to scope the queries.
 * @returns {{
 *   panelElement: HTMLElement|null,
 *   listElement: HTMLElement|null,
 *   addButtonElement: HTMLButtonElement|null
 * }}
 */
export function queryLightsElements(root = document) {
  const find = (selector) => /** @type {HTMLElement|null} */ (root.querySelector(selector));

  return {
    panelElement: find(LIGHTS_SELECTORS.panel),
    listElement: find(LIGHTS_SELECTORS.list),
    addButtonElement: /** @type {HTMLButtonElement|null} */ (find(LIGHTS_SELECTORS.addButton)),
  };
}
