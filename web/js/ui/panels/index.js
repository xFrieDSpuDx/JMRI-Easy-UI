// js/ui/panels/index.js
const PANEL_IDS = {
  roster:   "panelRoster",
  turnouts: "panelTurnouts",
  settings: "panelSettings",
};

const NAV_IDS = {
  roster:   "navRoster",
  turnouts: "navTurnouts",
  settings: "navSettings",
};

function byId(id) { return document.getElementById(id); }

export function showPanel(name) {
  const wanted = String(name || "roster");

  // Toggle panels
  for (const key of Object.keys(PANEL_IDS)) {
    const el = byId(PANEL_IDS[key]);
    if (!el) continue;
    if (key === wanted) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "");
  }

  // Toggle nav state
  for (const key of Object.keys(NAV_IDS)) {
    const btn = byId(NAV_IDS[key]);
    if (!btn) continue;
    btn.classList.toggle("active", key === wanted);
    btn.setAttribute("aria-current", key === wanted ? "page" : "false");
  }

  // Broadcast
  document.dispatchEvent(new CustomEvent("panel:changed", { detail: { name: wanted } }));
}

/** One-time wiring for panel navigation + initial panel. */
export function initPanels() {
  // Click nav → show panel
  document.addEventListener("click", (ev) => {
    const navBtn = ev.target.closest(".nav-btn[data-view]");
    if (!navBtn) return;
    const name = navBtn.getAttribute("data-view");
    if (!name) return;
    showPanel(name);
  });

  // Hash routing (#roster / #turnouts)
  window.addEventListener("hashchange", () => {
    const name = location.hash.replace(/^#/, "");
    if (PANEL_IDS[name]) showPanel(name);
  });

  // Initial panel
  const initial = location.hash.replace(/^#/, "") || "roster";
  showPanel(PANEL_IDS[initial] ? initial : "roster");
}
