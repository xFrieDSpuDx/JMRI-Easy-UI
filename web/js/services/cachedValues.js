// js/services/cachedValues.js

import {
  getCurrentPanelsFile,
  _panelsFileCache as panelsFileCache,
  updatePanelsFileCache,
  storeUserConfig,
  getActiveConnection,
} from "./jmri.js";

/** Default filename used when we cannot read the current panels file. */
const defaultPanelsFilename = "AutoStorePanels.xml";

/** Timeout handle for deferred panel-store writes. */
let scheduledStoreTimeoutId = 0;

/** The currently active JMRI connection (cached for consumers). */
export let activeConnection = null;

/**
 * Populate commonly cached values used across the app.
 * - Schedules a deferred store of user config to the current panels file
 * - Retrieves and caches the active connection
 *
 * @returns {Promise<void>}
 */
export async function populateCachedValues() {
  await schedulePanelsFileStore();
  await fetchAndPopulateActiveConnection();
}

/**
 * Ensure the panels file cache is initialized, then schedule a deferred write
 * of user config to that file. Subsequent calls reset the timer.
 *
 * @param {number} [delay=800] - Delay in milliseconds before writing.
 * @returns {Promise<void>}
 */
async function schedulePanelsFileStore(delay = 800) {
  if (!panelsFileCache) {
    let panelsFileName = "";
    try {
      const info = await getCurrentPanelsFile();
      panelsFileName = info?.fileName || defaultPanelsFilename;
    } catch {
      panelsFileName = defaultPanelsFilename;
    }
    updatePanelsFileCache(panelsFileName);
  }

  clearTimeout(scheduledStoreTimeoutId);
  scheduledStoreTimeoutId = setTimeout(() => {
    // Fire-and-forget; keep UI responsive even if this fails.
    storeUserConfig(panelsFileCache).catch(() => {});
  }, delay);
}

/**
 * Fetch active connections from JMRI and cache the single active one.
 *
 * @returns {Promise<void>}
 */
async function fetchAndPopulateActiveConnection() {
  const activeConnectionList = await getActiveConnection();
  populateActiveConnection(activeConnectionList);
}

/**
 * Derive and cache the active connection from a list of connections.
 *
 * @param {Array<{active?: boolean}>} activeConnectionList - Connections returned by JMRI.
 * @returns {void}
 */
export function populateActiveConnection(activeConnectionList) {
  activeConnection = activeConnectionList.find((connection) => connection.active) ?? null;
}
