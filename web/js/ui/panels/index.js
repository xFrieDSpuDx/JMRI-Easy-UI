// js/ui/panels/index.js

/** @typedef {"roster"|"turnouts"|"settings"} PanelName */

/** Map of logical panel names to their element IDs. */
const PANEL_IDS = {
  roster: "panelRoster",
  turnouts: "panelTurnouts",
  lights: "panelLights",
  settings: "panelSettings",
};

/** Map of logical panel names to their corresponding nav button IDs. */
const NAV_IDS = {
  roster: "navRoster",
  turnouts: "navTurnouts",
  lights: "navLights",
  settings: "navSettings",
};

/**
 * Shorthand for document.getElementById.
 *
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function byId(id) {
  return document.getElementById(id);
}

/**
 * Show the requested panel, update nav state, and broadcast a "panel:changed" event.
 *
 * @param {PanelName} name - The logical panel name to display.
 * @returns {void}
 */
export function showPanel(name) {
  const wantedPanel = String(name || "roster");

  // Toggle panels
  for (const key of Object.keys(PANEL_IDS)) {
    const panelElement = byId(PANEL_IDS[key]);
    if (!panelElement) continue;
    if (key === wantedPanel) {
      panelElement.removeAttribute("hidden");
    } else {
      panelElement.setAttribute("hidden", "");
    }
  }

  // Toggle nav state
  for (const key of Object.keys(NAV_IDS)) {
    const navButton = byId(NAV_IDS[key]);
    if (!navButton) continue;
    navButton.classList.toggle("active", key === wantedPanel);
    navButton.setAttribute("aria-current", key === wantedPanel ? "page" : "false");
  }

  // Broadcast
  document.dispatchEvent(new CustomEvent("panel:changed", { detail: { name: wantedPanel } }));
}

/**
 * One-time wiring for panel navigation + initial panel.
 *
 * - Click on a .nav-btn[data-view] switches panels
 * - URL hash (#roster / #turnouts / #settings) switches panels
 * - On load, selects the panel from hash or defaults to "roster"
 *
 * @returns {void}
 */
export function initPanels() {
  // Click nav → show panel
  document.addEventListener("click", (event) => {
    const navButton = event.target.closest(".nav-btn[data-view]");
    if (!navButton) return;
    const viewName = navButton.getAttribute("data-view");
    if (!viewName) return;
    showPanel(/** @type {PanelName} */ (viewName));
  });

  // Hash routing (#roster / #turnouts / #settings)
  window.addEventListener("hashchange", () => {
    const viewName = window.location.hash.replace(/^#/, "");
    if (Object.prototype.hasOwnProperty.call(PANEL_IDS, viewName)) {
      showPanel(/** @type {PanelName} */ (viewName));
    }
  });

  // Initial panel
  const initialPanelName = window.location.hash.replace(/^#/, "") || "roster";
  showPanel(Object.prototype.hasOwnProperty.call(PANEL_IDS, initialPanelName) ? initialPanelName : "roster");
}
