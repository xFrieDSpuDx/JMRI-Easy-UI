// js/controllers/lights/view.js
import { escapeHtml } from "../../ui/dom.js";
// View helpers for the Lights panel.
// - Builds a card element for a light using the shared roster card styles
// - Provides a small inline SVG that visually indicates ON vs OFF

/**
 * Build an inline SVG icon indicating the light's status.
 * Shows a green “?” badge if state is unknown.
 *
 * @param {{ isOff?: boolean, isUnknown?: boolean }} params
 * @returns {string} SVG markup as a string.
 */
function svgLightIcon({ isOff = false, isUnknown = false }) {
  const stateClass = isUnknown ? "unknown" : isOff ? "off" : "on";

  // Badge appears only for unknown state
  const unknownBadge = isUnknown
    ? `
    <g class="badge" aria-hidden="true">
      <!-- question mark -->
      <text class="badge-text" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" x="32" font-size="48" y="35">?</text>
    </g>`
    : "";

  return `
  <svg class="light-icon ${stateClass}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <g class="off-state">
    <path d="M9 18H15" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 21H14" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M16.4999 11.5C17.4997 10.5 17.9765 9.48689 17.9999 8C18.0479 4.95029 16 3 11.9999 3C10.8324 3 9.83119 3.16613 8.99988 3.47724" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8.99985 15C9 13 8.5 12.5 7.49985 11.5C6.4997 10.5 6.02324 9.48689 5.99985 8C5.99142 7.46458 6.0476 6.96304 6.1676 6.5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path class="active-outline" d="M3 3L21 21" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <g class="on-state">
    <path class="active-outline" d="M9 18H15" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path class="active-outline" d="M10 21H14" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path class="active-outline" d="M9.00082 15C9.00098 13 8.50098 12.5 7.50082 11.5C6.50067 10.5 6.02422 9.48689 6.00082 8C5.95284 4.95029 8.00067 3 12.0008 3C16.001 3 18.0488 4.95029 18.0008 8C17.9774 9.48689 17.5007 10.5 16.5008 11.5C15.501 12.5 15.001 13 15.0008 15" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  ${unknownBadge}
  </svg>`;
}

/**
 * Create a roster-style card for a single light.
 *
 * @param {object} record - Normalised light data.
 * @param {string} [record.title] - Preferred display title (usually userName).
 * @param {string} [record.address] - The light's address/name.
 * @param {string} [record.normalisedState] - "On" | "Off" | "Unknown".
 * @param {string} [record.comment] - Optional comment/note.
 * @param {boolean} [record.isOff] - True if OFF.
 * @param {boolean} [record.isUnknown] - True if state is unknown.
 *
 * @param {{ onEdit?: (record: object) => void, onDelete?: (record: object) => void, onToggle?: (record: object) => void }} [handlers={}]
 * @returns {HTMLElement} A fully populated <article class="card"> element.
 */
export function createLightCard(record, handlers = {}) {
  const cardElement = document.createElement("article");
  cardElement.className = "card";

  const titleText = record.title || "(unnamed)";
  const subtitleParts = [];
  if (record.address) subtitleParts.push(record.address);
  if (record.normalisedState || record.normalizedState) {
    subtitleParts.push(record.normalisedState || record.normalizedState);
  }
  const subtitleText = subtitleParts.join(" · ");

  cardElement.innerHTML = `
    <div class="card-img" aria-hidden="true" data-act="toggle">
      ${svgLightIcon(record)}
    </div>
    <div class="card-body card-body-light">
      <div class="card-title">${escapeHtml(titleText)}</div>
      <div class="card-sub">${escapeHtml(subtitleText)}</div>
      ${record.comment ? `<div class="card-sub">${escapeHtml(record.comment)}</div>` : ""}
    </div>
  `;

  cardElement.querySelector('[data-act="toggle"]')?.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onToggle?.(record);
  });

  cardElement.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onEdit?.(record);
  });

  return cardElement;
}
