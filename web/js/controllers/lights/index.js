// js/controllers/lights/index.js
// Controller for the Lights panel.
// - Initializes on first view
// - Loads data from JMRI via data.js
// - Renders lights using the shared roster-style card grid
// - Wires Add / Edit / Delete actions (lightweight prompt flows for now)

/* --------------------------------- Imports -------------------------------- */

// Parent imports
import { getLights } from "../../services/jmri.js";
import { busyWhile } from "../../ui/busy.js";
import { showToast } from "../../ui/toast.js";
import { query } from "../../ui/dom.js";
// Sibling imports
import { updateLight, deleteLight, normaliseLights } from "./data.js";
import { LIGHTS_SELECTORS as lightsSelectors, queryLightsElements } from "./selectors.js";
import { createLightCard } from "./view.js";
import { openLightDialog, initLightDialog, closeDialog } from "./dialog.js";

/* --------------------------------- State ---------------------------------- */

/** Panel identity used by the shell’s panel switch events. */
const panelName = "lights";

/** User-facing busy messages. */
const loadingMessage = "Loading lights…";
const deletingMessage = "Deleting…";

/** Module-scoped state for this controller. */
const lightControllerState = {
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
 * Fetch the latest lights from the data layer and cache them.
 *
 * @returns {Promise<Array>} The normalised light list.
 */
export async function fetchLightsData() {
  const list = await getLights();
  const normalisedList = normaliseLights(list);
  lightControllerState.items = normalisedList;

  return normalisedList;
}

/* ================================ Rendering =============================== */
/**
 * Render a list of light records into the panel list container.
 *
 * @param {Array} list - Normalised light records.
 * @returns {void}
 */
function renderLightList(list) {
  const containerElement = query(lightsSelectors.list);
  if (!containerElement) return;

  containerElement.innerHTML = "";

  (list || []).forEach((record) => {
    const cardElement = createLightCard(record, {
      onToggle: () => onToggleLight(record),
      onEdit: () => onEditLight(record),
      onDelete: () => onDeleteLight(record),
    });
    containerElement.appendChild(cardElement);
  });

  // Simple empty state if no items
  if (!list || list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `
      <div class="empty-title">No lights yet</div>
      <div class="empty-subtitle">Add a light to get started.</div>
    `;
    containerElement.appendChild(empty);
  }
}

/* ============================== Public API =============================== */
/**
 * Render the Lights panel the first time it becomes visible.
 * Subsequent calls are no-ops unless you explicitly reset the controller state.
 *
 * @returns {Promise<void>} Resolves after initial render.
 */
export async function renderLightsOnce() {
  if (lightControllerState.initialized) return;
  lightControllerState.initialized = true;

  // Show an empty grid immediately; fill once data arrives.
  renderLightList([]);

  try {
    await busyWhile(async () => {
      const list = await fetchLightsData();
      renderLightList(list);
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
    renderLightsOnce();
  }
}

/**
 * Refresh the list by re-fetching and re-rendering.
 *
 * @returns {Promise<void>} Resolves when refreshed.
 */
export async function refreshList() {
  return busyWhile(async () => {
    const list = await fetchLightsData();
    renderLightList(list);
  }, loadingMessage);
}

/**
 * Open the dialog to add a single light.
 *
 * @returns {void}
 */
function onAddLight() {
  openLightDialog("create", null, () => {
    refreshList();
  });
}

/**
 * Open the dialog to add multiple sequential lights.
 *
 * @returns {void}
 */
function onAddSequentialLight() {
  openLightDialog("sequential", null, () => {
    refreshList();
  });
}

/**
 * Open the dialog to edit a light.
 *
 * @param {object} record - The light record to edit.
 * @returns {void}
 */
function onEditLight(record) {
  openLightDialog("edit", record, () => {
    refreshList();
  });
}

/**
 * Delete a light (confirm-based flow).
 *
 * @param {object} record - The light record to delete.
 * @returns {Promise<void>} Resolves after delete attempt completes.
 */
export async function onDeleteLight(record) {
  const systemName = record.name || record.address || record.data?.name;
  if (!systemName) return;

  const ok = confirm(`Delete light "${record.title || systemName}"?\nThis cannot be undone.`);
  if (!ok) return;

  try {
    await busyWhile(async () => {
      await deleteLight(systemName);
      const list = await fetchLightsData();
      renderLightList(list);
    }, deletingMessage);
    toast("Light deleted");
  } catch {
    toast("Delete failed");
  } finally {
    closeDialog();
  }
}

/**
 * Initialize the Lights controller:
 * - Subscribes to panel changes
 * - Wires up Add button
 * - If the Lights panel is already visible (e.g., deep link), render immediately
 *
 * @returns {void}
 */
export function initLights() {
  document.addEventListener("panel:changed", handlePanelChanged);
  initSplitMenu();
  initLightDialog();

  const { panelElement } = queryLightsElements();
  if (panelElement && !panelElement.hasAttribute("hidden")) {
    renderLightsOnce();
  }
}

/**
 * Wire the “Add Light” button and split menu.
 *
 * @returns {void}
 */
function initSplitMenu() {
  const { addButtonElement } = queryLightsElements();
  const toggle = document.getElementById("addLightMore");
  const menu = document.getElementById("addLightMenu");

  if (!toggle || !menu || !addButtonElement) return;

  addButtonElement.addEventListener("click", () => {
    onAddLight();
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
      onAddLight();
    }
    if (action === "sequential") {
      onAddSequentialLight();
    }
  });
}

/* ============================== Toggle action ============================== */
/**
 * Compute the raw JMRI state value we need to send to achieve the desired
 * logical state.
 *  - Normal:   On=2, Off=4
 *
 * @param {boolean} targetOff - Desired logical state.
 * @returns {number} The raw JMRI state value to send.
 */
function computeRawState(targetOff) {
  if (targetOff) return 4;
  // target on
  return 2;
}

/**
 * Toggle a single light between On and Off (Unknown → Off).
 *
 * @param {object} record - The light record.
 * @returns {Promise<void>} Resolves after toggle attempt.
 */
async function onToggleLight(record) {
  const systemName = record.name || record.address || record.data?.name;
  if (!systemName) return;

  // Decide desired logical target: if currently off → on, else → off.
  // If unknown, default to Off.
  const currentlyOff = !!record.isOff;
  const currentlyOn = !!record.isOn;
  const targetOff = currentlyOn ? true : !currentlyOff;

  const targetRaw = computeRawState(targetOff, !!record.inverted);

  try {
    await updateLight(systemName, { state: targetRaw });
    // Refresh list after change
    const list = await fetchLightsData();
    renderLightList(list);
    // Optional toast
    try {
      showToast?.(`Light ${targetOff ? "Off" : "On"}`);
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
