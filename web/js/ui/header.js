// js/ui/header.js
import { getRailroadName } from "../services/jmri.js";

/**
 * Fetch the railroad name from the server and render it into the header element.
 * Falls back to "My Railroad" on error.
 *
 * @param {string} [selector="#railroadName"] - CSS selector for the header element.
 * @returns {Promise<void>}
 */
export async function renderRailroadName(selector = "#railroadName") {
  const headerElement = document.querySelector(selector);
  if (!headerElement) return;

  try {
    const name = await getRailroadName();
    headerElement.textContent = name || "My Railroad";
  } catch {
    headerElement.textContent = "My Railroad";
  }
}
