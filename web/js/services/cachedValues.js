import {
  getCurrentPanelsFile,
  _panelsFileCache,
  updatePanelsFileCache,
  storeUserConfig,
  getActiveConnection,
} from "./jmri.js";

export let activeConnection;

export async function populateCachedValues() {
  await scheduleStoreToCurrentFile();
  await getInitialActiveConnections();
}

async function scheduleStoreToCurrentFile(delay = 800) {
  if (!_panelsFileCache) {
    let panelsFileCacheValue = "";
    try {
      const info = await getCurrentPanelsFile();
      panelsFileCacheValue = info?.fileName || "AutoStorePanels.xml";
    } catch {
      panelsFileCacheValue = "AutoStorePanels.xml";
    }

    updatePanelsFileCache(panelsFileCacheValue);
  }
  clearTimeout(scheduleStoreToCurrentFile._t);
  scheduleStoreToCurrentFile._t = setTimeout(() => {
    storeUserConfig(_panelsFileCache).catch(() => {});
  }, delay);
}

async function getInitialActiveConnections() {
  const activeConnectionObject = await getActiveConnection();
  populateActiveConnection(activeConnectionObject);
}

export function populateActiveConnection(activeConnectionObject) {
  activeConnection = activeConnectionObject.find(connection => connection.active) ?? null;
}