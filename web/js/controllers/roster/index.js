// js/controllers/roster/index.js
// Controller for the Roster panel: fetch → render → wire UI.

import { fetchRoster, startXmlUploadFlow } from "./data.js";
import { createRosterCard } from "./view.js";
import { ROSTER_SELECTORS as SEL, queryRosterElements } from "./selectors.js";
import { busyWhile } from "../../ui/busy.js";
import { showToast } from "../../ui/toast.js";
import { openLocoDialog } from "./dialog.js";
import { openCopySelector } from "./dialog/copySelector.js";

/** Panel identity used by the shell’s panel switch events. */
const PANEL_NAME = "roster";

/** User-facing busy message while the roster loads. */
const LOADING_MESSAGE = "Loading roster…";

/** Module-scoped state for this controller. */
const controllerState = {
  initialized: false,
  items: [],
};

/* ============================================================================
 * DOM helpers
 * ========================================================================== */

/** Return the roster list container element (already present in index.html). */
function getListContainer() {
  const { listElement } = queryRosterElements();
  return listElement || null;
}

/* ============================================================================
 * Rendering
 * ========================================================================== */

/**
 * Render roster cards into the list container.
 * Cards are clickable and have an explicit “Edit” button; both open the dialog.
 *
 * @param {Array<object>} rosterList
 */
function renderRosterList(rosterList) {
  const container = getListContainer();
  if (!container) return;

  container.innerHTML = "";

  (rosterList || []).forEach((record) => {
    const card = createRosterCard(record, {
      onEdit: () => openLocoDialog("edit", record, () => refreshRoster()),
    });
    container.appendChild(card);
  });

  // Simple empty state
  if (!rosterList || rosterList.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-title">No locomotives yet</div>
        <div class="empty-subtitle">Add a locomotive to get started.</div>
      </div>
    `;
  }
}

/* ============================================================================
 * Data loading
 * ========================================================================== */

/** Fetch latest roster and re-render; caches into controller state. */
async function loadAndRenderRoster() {
  const list = await fetchRoster();
  controllerState.items = list;
  renderRosterList(list);
}

/* ============================================================================
 * Public API
 * ========================================================================== */

/**
 * Lazy render: first time this panel is shown (or when directly visible on load).
 */
export async function renderRosterOnce() {
  if (controllerState.initialized) return;
  controllerState.initialized = true;

  // Show empty grid immediately; fill with data when ready.
  renderRosterList([]);

  try {
    await busyWhile(loadAndRenderRoster, LOADING_MESSAGE);
  } catch {
    // Leave empty state; optional toast if you want.
  }
}

/** Explicit refresh hook (useful after dialog save). */
export async function refreshRoster() {
  try {
    await busyWhile(loadAndRenderRoster, "Refreshing…");
  } catch {
    showToast("Refresh failed");
  }
}

/* ============================================================================
 * Wiring
 * ========================================================================== */

/** Handle panel switch events: initialise on first show. */
function handlePanelChanged(event) {
  if (event?.detail?.name === PANEL_NAME) {
    renderRosterOnce();
  }
}

/** Wire the “Add Loco” button and split menu */
function initSplitMenu() {
  const { addButton } = queryRosterElements();
  const toggle = document.getElementById("addLocoMore");
  const menu   = document.getElementById("addLocoMenu");

  if (!toggle || !menu || !addButton) return;

  addButton.addEventListener("click", () => {
    openLocoDialog("create", null, () => refreshRoster(), false);
  });

  const openMenu = () => {
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    document.addEventListener("click", onDocClick, { capture: true });
  };

  const closeMenu = () => {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocClick, { capture: true });
  };

  const onDocClick = (event) => {
    if (menu.contains(event.target) || toggle.contains(event.target)) return;
    closeMenu();
  };

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    menu.hidden ? openMenu() : closeMenu();
  });

  menu.addEventListener("click", (event) => {
    const btn = event.target.closest(".menu-item");
    if (!btn) return;
    const action = btn.dataset.action;
    closeMenu();

    if (action === "manual") {
      openLocoDialog("create", null, () => refreshRoster(), false);
    }
    if (action === "copy") {
      openCopySelector(document.getElementById("addLocoMore"));
    }
    if (action === "upload") {
      startXmlUploadFlow();
    }
  });
}

/**
 * Init entry point for the Roster panel.
 * - Subscribes to panel changes
 * - Wires “Add Loco”
 * - If Roster is already visible, renders immediately
 */
export function initRoster() {
  document.addEventListener("panel:changed", handlePanelChanged);
  initSplitMenu();

  const { panelElement } = queryRosterElements();
  if (panelElement && !panelElement.hasAttribute("hidden")) {
    renderRosterOnce();
  }
}
