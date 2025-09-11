// js/controllers/roster/selectors.js
// Centralized DOM selectors and lookups for the Roster panel.

/**
 * CSS selectors for key Roster UI elements.
 * - panel: the entire Roster panel section
 * - list:  the card list container inside the panel
 * - addButton: the “Add Loco” button in the top bar
 */
export const ROSTER_SELECTORS = Object.freeze({
  panel: "#panelRoster",
  list: "#rosterList",
  addButton: "#addBtn",
});

/**
 * Query and return the key elements for the Roster panel.
 *
 * @param {ParentNode} [root=document] - Root to query within.
 * @returns {{
 *   panelElement: HTMLElement|null,
 *   listElement: HTMLElement|null,
 *   addButton: HTMLButtonElement|null
 * }}
 */
export function queryRosterElements(root = document) {
  return {
    panelElement: root.querySelector(ROSTER_SELECTORS.panel),
    listElement: root.querySelector(ROSTER_SELECTORS.list),
    addButton: root.querySelector(ROSTER_SELECTORS.addButton),
  };
}
