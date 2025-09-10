// js/controllers/turnouts/view.js
import { escapeHtml } from "../../ui/dom.js";
// View helpers for the Turnouts panel.
// - Builds a card element for a turnout using the shared roster card styles
// - Provides a small inline SVG that visually indicates CLOSED vs THROWN

/**
 * Build an inline SVG icon indicating the turnout's route.
 * Shows a green “?” badge if state is unknown.
 *
 * @param {{ isThrown?: boolean, isUnknown?: boolean }} params
 * @returns {string} SVG markup as a string.
 */
function svgTurnoutIcon({ isThrown = false, isUnknown = false }) {
  const stateClass = isUnknown ? "unknown" : isThrown ? "thrown" : "closed";

  // Badge appears only for unknown state
  const unknownBadge = isUnknown
    ? `
    <g class="badge" aria-hidden="true">
      <!-- question mark -->
      <text class="badge-text" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" x="32" font-size="48" y="35">?</text>
    </g>`
    : "";

  return `
<svg class="turnout-icon ${stateClass}" viewBox="0 0 64 40" width="64" height="40" aria-hidden="true">
  <g fill="none" stroke-width="4" stroke-linecap="round">
    <!-- straight route -->
    <path class="trk base"    d="M4 20 H60" />
    <!-- diverging route -->
    <path class="trk diverge" d="M4 20 Q30 4 60 4" />
  </g>
  ${unknownBadge}
</svg>`;
}

/**
 * Create a roster-style card for a single turnout.
 *
 * @param {object} record - normalised turnout data.
 * @param {string} [record.title] - Preferred display title (usually userName).
 * @param {string} [record.address] - The turnout's address/name.
 * @param {string} [record.normalisedState] - "Closed" | "Thrown" | "Unknown".
 * @param {string} [record.comment] - Optional comment/note.
 * @param {boolean} [record.isThrown] - True if THROWN.
 *
 * @param {object} [handlers]
 * @param {(record: object) => void} [handlers.onEdit] - Called when Edit is clicked.
 * @param {(record: object) => void} [handlers.onDelete] - Called when Delete is clicked.
 *
 * @returns {HTMLElement} A fully populated <article class="card"> element.
 */
export function createTurnoutCard(record, handlers = {}) {
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
      ${svgTurnoutIcon(record)}
    </div>
    <div class="card-body card-body-turnout">
      <div class="card-title">${escapeHtml(titleText)}</div>
      <div class="card-sub">${escapeHtml(subtitleText)}</div>
      ${
        record.comment
          ? `<div class="card-sub">${escapeHtml(record.comment)}</div>`
          : ""
      }
    </div>
  `;

  cardElement
    .querySelector('[data-act="toggle"]')
    ?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      handlers.onToggle?.(record);
    });

  cardElement.addEventListener("click", (ev) => {
    ev.stopPropagation();
    handlers.onEdit?.(record);
  });

  return cardElement;
}
