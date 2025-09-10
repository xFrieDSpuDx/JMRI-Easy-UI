// js/controllers/settings/index.js
// Controller for the Settings panel.
// - Initializes on first view
// - Loads data from JMRI
import {
  populateActiveConnection,
  activeConnection,
} from "../../services/cachedValues.js";
import { getActiveConnection, setActiveConnection } from "../../services/jmri.js";
import { query } from "../../ui/dom.js";
import { busyWhile } from "../../ui/busy.js";
import {
  SETTINGS_SELECTORS as SEL,
  querySettingsElements,
} from "./selectors.js";

/** Constants */
const PANEL_NAME = "settings";
const MSG_LOADING = "Loading settings…";
/**
 * Initialize the Settings controller:
 * - Subscribes to panel changes
 * - Wires up elements
 * - Check setting status every time on open
 */
export async function initSettings() {
  document.addEventListener("panel:changed", handlePanelChanged);

  const connectionsSelectElement = query(SEL.connectionsSelect);
  if (connectionsSelectElement) {
    connectionsSelectElement.addEventListener("change", updateActiveConnection);
  }
}

/**
 * Handle panel switch events; lazily initializes this panel on first show.
 *
 * @param {CustomEvent} event - panel:changed event with detail: { name: string }
 */
async function handlePanelChanged(event) {
  if (event?.detail?.name === PANEL_NAME) {
    try {
      await busyWhile(async () => {
        await populateActiveConnectionSelect();
      }, MSG_LOADING);
    } catch {
      // Intentionally silent: keep the empty state if loading fails.
    }
  }
}

async function populateActiveConnectionSelect() {
  let activeConnectionObject = await getActiveConnection();
  populateActiveConnection(activeConnectionObject);

  const connectionSelect = query(SEL.connectionsSelect);
  if (!connectionSelect) return [];

  connectionSelect.innerHTML = "";
  for (const connection of activeConnectionObject) {
    const option = document.createElement("option");
    option.value = connection.systemPrefix;
    option.textContent = connection.userName;

    if (connection.systemPrefix === activeConnection.systemPrefix) {
      option.selected = true;
    }

    connectionSelect.appendChild(option);
  }
}

async function updateActiveConnection(event) {
    const activeConnection = event?.target?.value || "I";
    await setActiveConnection(activeConnection);
}