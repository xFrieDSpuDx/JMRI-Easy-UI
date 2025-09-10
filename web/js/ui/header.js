// js/ui/header.js
import { getRailroadName } from "../services/jmri.js";

/**
 * Fetch railroad name from server and render into the header element.
 * Falls back to "My Railroad" on error.
 */
export async function renderRailroadName(selector = "#railroadName") {
  const headerElement = document.querySelector(selector);
  if (!headerElement) return;
  try {
    headerElement.textContent = await getRailroadName();
  } catch {
    headerElement.textContent = "My Railroad";
  }
}
