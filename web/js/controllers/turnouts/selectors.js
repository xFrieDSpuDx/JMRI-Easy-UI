// js/controllers/turnouts/selectors.js
// Centralized DOM selectors for the Turnouts panel.
//
// Usage patterns:
//   import { TURNOUTS_SEL } from "./selectors.js";
//   const listEl = document.querySelector(TURNOUTS_SEL.list);
//
//   // Or, get strongly named elements in one call:
//   import { queryTurnoutsElements } from "./selectors.js";
//   const { panelElement, listElement, addButtonElement } = queryTurnoutsElements();

 /** Readable selector map for Turnouts-related elements. */
export const TURNOUTS_SELECTORS = Object.freeze({
  panel:     "#panelTurnouts",
  list:      "#turnoutsList",
  addButton: "#turnoutsAddBtn",
});

/**
 * Query and return the key Turnouts elements.
 *
 * @param {ParentNode} [root=document] - Optional root node to scope the queries.
 * @returns {{
 *   panelElement: Element|null,
 *   listElement: Element|null,
 *   addButtonElement: Element|null
 * }}
 */
export function queryTurnoutsElements(root = document) {
  const query = (selector) => root.querySelector(selector);

  return {
    panelElement:     query(TURNOUTS_SELECTORS.panel),
    listElement:      query(TURNOUTS_SELECTORS.list),
    addButtonElement: query(TURNOUTS_SELECTORS.addButton),
  };
}
