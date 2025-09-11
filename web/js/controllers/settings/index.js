// js/controllers/settings/index.js
// Controller for the Settings panel.
// - Initializes on first view
// - Loads data from JMRI

import { populateActiveConnection, activeConnection } from "../../services/cachedValues.js";
import { getActiveConnection, setActiveConnection } from "../../services/jmri.js";
import { query } from "../../ui/dom.js";
import { busyWhile } from "../../ui/busy.js";
import { SETTINGS_SELECTORS as settingsSelectors } from "./selectors.js";

/** Constants */
const panelName = "settings";
const loadingMessage = "Loading settings…";

/**
 * Initialize the Settings controller:
 * - Subscribes to panel changes
 * - Wires up elements
 * - Checks setting status each time the panel opens
 *
 * @returns {Promise<void>} Resolves after listeners are attached.
 */
export async function initSettings() {
  document.addEventListener("panel:changed", handlePanelChanged);

  const connectionsSelectElement = query(settingsSelectors.connectionsSelect);
  if (connectionsSelectElement) {
    connectionsSelectElement.addEventListener("change", updateActiveConnection);
  }
}

/**
 * Handle panel switch events; lazily initializes this panel on first show.
 *
 * @param {CustomEvent<{name:string}>} event - panel:changed event.
 * @returns {Promise<void>} Resolves after attempts to populate the select.
 */
async function handlePanelChanged(event) {
  if (event?.detail?.name === panelName) {
    try {
      await busyWhile(async () => {
        await populateActiveConnectionSelect();
      }, loadingMessage);
    } catch {
      // Intentionally silent: keep the empty state if loading fails.
    }
  }
}

/**
 * Populate the connections <select> with available JMRI connections and
 * mark the active one as selected.
 *
 * @returns {Promise<void>} Resolves when the select is populated.
 */
async function populateActiveConnectionSelect() {
  const activeConnectionObject = await getActiveConnection();
  populateActiveConnection(activeConnectionObject);

  const connectionSelect = query(settingsSelectors.connectionsSelect);
  if (!connectionSelect) return;

  connectionSelect.innerHTML = "";
  for (const connection of activeConnectionObject) {
    const option = document.createElement("option");
    option.value = connection.systemPrefix;
    option.textContent = connection.userName;

    if (connection.systemPrefix === activeConnection?.systemPrefix) {
      option.selected = true;
    }

    connectionSelect.appendChild(option);
  }
}

/**
 * Update the active connection when the user changes the select.
 *
 * @param {Event} event - Change event from the connections <select>.
 * @returns {Promise<void>} Resolves after the active connection is updated.
 */
async function updateActiveConnection(event) {
  const activeConnectionFromSelect = event?.target?.value || "I";
  await setActiveConnection(activeConnectionFromSelect);
}
