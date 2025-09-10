// js/controllers/turnouts/index.js
// Controller for the Turnouts panel.
// - Initializes on first view
// - Loads data from JMRI via data.js
// - Renders turnouts using the shared roster-style card grid
// - Wires Add / Edit / Delete actions (lightweight prompt flows for now)

import { getTurnouts } from "../../services/jmri.js";
import {
  updateTurnout,
  deleteTurnout,
  normaliseTurnouts,
} from "./data.js";
import {
  TURNOUTS_SELECTORS as SEL,
  queryTurnoutsElements,
} from "./selectors.js";
import { busyWhile } from "../../ui/busy.js";
import { createTurnoutCard } from "./view.js";
import { openTurnoutDialog, initTurnoutDialog, closeDialog } from "./dialog.js";
import { showToast } from "../../ui/toast.js";
import { query } from "../../ui/dom.js";

/** Constants */
const PANEL_NAME = "turnouts";
const MSG_LOADING = "Loading turnouts…";
const MSG_DELETING = "Deleting…";

/** Module-scoped state for this controller */
const controllerState = {
  initialized: false,
  items: [],
};

/** Safe toast helper (uses your global showToast if present) */
function toast(message) {
  try {
    // eslint-disable-next-line no-undef
    showToast?.(message);
  } catch {}
}

/**
 * Fetch the latest turnouts from the data layer and cache them.
 *
 * @returns {Promise<Array>} The normalised turnout list.
 */
async function fetchTurnoutsData() {
  const list = await getTurnouts();
  const normalisedList = normaliseTurnouts(list);
  controllerState.items = normalisedList;

  return normalisedList;
}

/**
 * Render a list of turnout records into the panel list container.
 *
 * @param {Array} list - normalised turnout records.
 */
function renderTurnoutList(list) {
  const containerElement = query(SEL.list);
  if (!containerElement) return;

  containerElement.innerHTML = "";

  (list || []).forEach((record) => {
    const cardElement = createTurnoutCard(record, {
      onToggle: () => onToggleTurnout(record),
      onEdit: () => onEditTurnout(record),
      onDelete: () => onDeleteTurnout(record),
    });
    containerElement.appendChild(cardElement);
  });

  // Optional: simple empty state if no items
  if (!list || list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `
      <div class="empty-title">No turnouts yet</div>
      <div class="empty-subtitle">Add a turnout to get started.</div>
    `;
    containerElement.appendChild(empty);
  }
}

/**
 * Render the Turnouts panel the first time it becomes visible.
 * Subsequent calls are no-ops unless you explicitly reset the controller state.
 */
export async function renderTurnoutsOnce() {
  if (controllerState.initialized) return;
  controllerState.initialized = true;

  // Show an empty grid immediately; fill once data arrives.
  renderTurnoutList([]);

  try {
    await busyWhile(async () => {
      const list = await fetchTurnoutsData();
      renderTurnoutList(list);
    }, MSG_LOADING);
  } catch {
    // Intentionally silent: keep the empty state if loading fails.
  }
}

/**
 * Handle panel switch events; lazily initializes this panel on first show.
 *
 * @param {CustomEvent} event - panel:changed event with detail: { name: string }
 */
function handlePanelChanged(event) {
  if (event?.detail?.name === PANEL_NAME) {
    renderTurnoutsOnce();
  }
}

function refreshList() {
  return busyWhile(async () => {
    const list = await fetchTurnoutsData();
    renderTurnoutList(list);
  }, "Loading turnouts…");
}

function onAddTurnout() {
  openTurnoutDialog("create", null, () => {
    refreshList();
  });
}

function onAddSequentialTurnout() {
  openTurnoutDialog("sequential", null, () => {
    refreshList();
  });
}

function onEditTurnout(record) {
  openTurnoutDialog("edit", record, () => {
    refreshList();
  });
}

/** Delete a turnout (confirm-based flow) */
export async function onDeleteTurnout(record) {
  const systemName = record.name || record.address || record.data?.name;
  if (!systemName) return;

  const ok = confirm(
    `Delete turnout "${record.title || systemName}"?\nThis cannot be undone.`
  );
  if (!ok) return;

  try {
    await busyWhile(async () => {
      const deleteResponse = await deleteTurnout(systemName);
      const list = await fetchTurnoutsData();
      renderTurnoutList(list);
    }, MSG_DELETING);
    toast("Turnout deleted");
  } catch {
    toast("Delete failed");
  } finally {
    closeDialog();
  }
}

/**
 * Initialize the Turnouts controller:
 * - Subscribes to panel changes
 * - Wires up Add button
 * - If the Turnouts panel is already visible (e.g., deep link), render immediately
 */
export function initTurnouts() {
  document.addEventListener("panel:changed", handlePanelChanged);
  initSplitMenu();
  initTurnoutDialog();

  const { panelElement } = queryTurnoutsElements();
  if (panelElement && !panelElement.hasAttribute("hidden")) {
    renderTurnoutsOnce();
  }
}

/** Wire the “Add Turnout button and split menu */
function initSplitMenu() {
  const { addButtonElement } = queryTurnoutsElements();
  const toggle = document.getElementById("addTurnoutMore");
  const menu   = document.getElementById("addTurnoutMenu");

  if (!toggle || !menu || !addButtonElement) return;

  addButtonElement.addEventListener("click", () => {
    onAddTurnout();
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

    if (action === "single") {
      onAddTurnout();
    }
    if (action === "sequential") {
      onAddSequentialTurnout();
    }
  });
}

/**
 * Compute the raw JMRI state value we need to send to achieve the desired
 * logical state, taking `inverted` into account.
 *  - Normal:   Closed=2, Thrown=4
 *  - Inverted: Closed=4, Thrown=2
 */
function computeRawState(targetThrown, inverted) {
  if (targetThrown) {
    return inverted ? 2 : 4;
  }
  // target closed
  return inverted ? 4 : 2;
}

/** Toggle a single turnout between Closed and Thrown (Unknown → Thrown). */
async function onToggleTurnout(record) {
  const systemName = record.name || record.address || record.data?.name;
  if (!systemName) return;

  // Decide desired logical target: if currently thrown → close, else → throw.
  // If unknown, default to Thrown.
  const currentlyThrown = !!record.isThrown;
  const currentlyClosed = !!record.isClosed;
  const targetThrown = currentlyClosed ? true : !currentlyThrown;

  const targetRaw = computeRawState(targetThrown, !!record.inverted);

  try {
      await updateTurnout(systemName, { state: targetRaw });
      // Refresh list after change
      const list = await fetchTurnoutsData();
      renderTurnoutList(list);
    // Optional toast if you like:
    try {
      showToast?.(`Turnout ${targetThrown ? "Thrown" : "Closed"}`);
    } catch {}
  } catch {
    try {
      showToast?.("Toggle failed");
    } catch {}
  }
}
