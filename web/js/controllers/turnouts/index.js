// js/controllers/turnouts/index.js
// Controller for the Turnouts panel.
// - Initializes on first view
// - Loads data from JMRI via data.js
// - Renders turnouts using the shared roster-style card grid
// - Wires Add / Edit / Delete actions (lightweight prompt flows for now)

/* --------------------------------- Imports -------------------------------- */

// Parent imports
import { getTurnouts } from "../../services/jmri.js";
import { busyWhile } from "../../ui/busy.js";
import { showToast } from "../../ui/toast.js";
import { query } from "../../ui/dom.js";
// Sibling imports
import { updateTurnout, deleteTurnout, normaliseTurnouts } from "./data.js";
import { TURNOUTS_SELECTORS as turnoutsSelectors, queryTurnoutsElements } from "./selectors.js";
import { createTurnoutCard } from "./view.js";
import { openTurnoutDialog, initTurnoutDialog, closeDialog } from "./dialog.js";

/* --------------------------------- State ---------------------------------- */

/** Panel identity used by the shell’s panel switch events. */
const panelName = "turnouts";

/** User-facing busy messages. */
const loadingMessage = "Loading turnouts…";
const deletingMessage = "Deleting…";

/** Module-scoped state for this controller. */
const controllerState = {
  initialized: false,
  items: [],
};

/* --------------------------------- Utils ---------------------------------- */
/**
 * Safe toast helper.
 *
 * @param {string} message - Message to display.
 * @returns {void}
 */
function toast(message) {
  try {
    showToast?.(message);
  } catch (error) {
    console.warn(error);
  }
}

/* =============================== Data layer =============================== */
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

/* ================================ Rendering =============================== */
/**
 * Render a list of turnout records into the panel list container.
 *
 * @param {Array} list - Normalised turnout records.
 * @returns {void}
 */
function renderTurnoutList(list) {
  const containerElement = query(turnoutsSelectors.list);
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

  // Simple empty state if no items
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

/* ============================== Public API =============================== */
/**
 * Render the Turnouts panel the first time it becomes visible.
 * Subsequent calls are no-ops unless you explicitly reset the controller state.
 *
 * @returns {Promise<void>} Resolves after initial render.
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
    }, loadingMessage);
  } catch {
    // Intentionally silent: keep the empty state if loading fails.
  }
}

/* ================================ Wiring ================================= */
/**
 * Handle panel switch events; lazily initializes this panel on first show.
 *
 * @param {CustomEvent<{name:string}>} event - panel:changed event with detail.name.
 * @returns {void}
 */
function handlePanelChanged(event) {
  if (event?.detail?.name === panelName) {
    renderTurnoutsOnce();
  }
}

/**
 * Refresh the list by re-fetching and re-rendering.
 *
 * @returns {Promise<void>} Resolves when refreshed.
 */
function refreshList() {
  return busyWhile(async () => {
    const list = await fetchTurnoutsData();
    renderTurnoutList(list);
  }, loadingMessage);
}

/**
 * Open the dialog to add a single turnout.
 *
 * @returns {void}
 */
function onAddTurnout() {
  openTurnoutDialog("create", null, () => {
    refreshList();
  });
}

/**
 * Open the dialog to add multiple sequential turnouts.
 *
 * @returns {void}
 */
function onAddSequentialTurnout() {
  openTurnoutDialog("sequential", null, () => {
    refreshList();
  });
}

/**
 * Open the dialog to edit a turnout.
 *
 * @param {object} record - The turnout record to edit.
 * @returns {void}
 */
function onEditTurnout(record) {
  openTurnoutDialog("edit", record, () => {
    refreshList();
  });
}

/**
 * Delete a turnout (confirm-based flow).
 *
 * @param {object} record - The turnout record to delete.
 * @returns {Promise<void>} Resolves after delete attempt completes.
 */
export async function onDeleteTurnout(record) {
  const systemName = record.name || record.address || record.data?.name;
  if (!systemName) return;

  const ok = confirm(`Delete turnout "${record.title || systemName}"?\nThis cannot be undone.`);
  if (!ok) return;

  try {
    await busyWhile(async () => {
      await deleteTurnout(systemName);
      const list = await fetchTurnoutsData();
      renderTurnoutList(list);
    }, deletingMessage);
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
 *
 * @returns {void}
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

/**
 * Wire the “Add Turnout” button and split menu.
 *
 * @returns {void}
 */
function initSplitMenu() {
  const { addButtonElement } = queryTurnoutsElements();
  const toggle = document.getElementById("addTurnoutMore");
  const menu = document.getElementById("addTurnoutMenu");

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

/* ============================== Toggle action ============================== */
/**
 * Compute the raw JMRI state value we need to send to achieve the desired
 * logical state, taking `inverted` into account.
 *  - Normal:   Closed=2, Thrown=4
 *  - Inverted: Closed=4, Thrown=2
 *
 * @param {boolean} targetThrown - Desired logical state.
 * @param {boolean} inverted - Whether the turnout is inverted.
 * @returns {number} The raw JMRI state value to send.
 */
function computeRawState(targetThrown, inverted) {
  if (targetThrown) {
    return inverted ? 2 : 4;
  }
  // target closed
  return inverted ? 4 : 2;
}

/**
 * Toggle a single turnout between Closed and Thrown (Unknown → Thrown).
 *
 * @param {object} record - The turnout record.
 * @returns {Promise<void>} Resolves after toggle attempt.
 */
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
    // Optional toast
    try {
      showToast?.(`Turnout ${targetThrown ? "Thrown" : "Closed"}`);
    } catch (error) {
      console.warn(error);
    }
  } catch {
    try {
      showToast?.("Toggle failed");
    } catch (error) {
      console.warn(error);
    }
  }
}
