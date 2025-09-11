// js/controllers/turnouts/selectors.js
// Centralized DOM selectors for the Turnouts panel.
//
// Usage:
//   import { TURNOUTS_SELECTORS, queryTurnoutsElements } from "./selectors.js";
//   const { panelElement, listElement, addButtonElement } = queryTurnoutsElements();

/** Readable selector map for Turnouts-related elements. */
export const TURNOUTS_SELECTORS = Object.freeze({
  panel: "#panelTurnouts",
  list: "#turnoutsList",
  addButton: "#turnoutsAddBtn",
});

/**
 * Query and return the key Turnouts elements.
 *
 * @param {ParentNode} [root=document] - Optional root node to scope the queries.
 * @returns {{
 *   panelElement: HTMLElement|null,
 *   listElement: HTMLElement|null,
 *   addButtonElement: HTMLButtonElement|null
 * }}
 */
export function queryTurnoutsElements(root = document) {
  const find = (selector) => /** @type {HTMLElement|null} */ (root.querySelector(selector));

  return {
    panelElement: find(TURNOUTS_SELECTORS.panel),
    listElement: find(TURNOUTS_SELECTORS.list),
    addButtonElement: /** @type {HTMLButtonElement|null} */ (find(TURNOUTS_SELECTORS.addButton)),
  };
}
