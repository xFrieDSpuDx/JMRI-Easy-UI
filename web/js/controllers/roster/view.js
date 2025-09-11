// js/controllers/roster/view.js
// Roster card component (no Delete button; Edit only).

import { escapeHtml } from "../../ui/dom.js";

/**
 * Create a single roster card element.
 *
 * @param {object} rosterRecord - Normalised roster record.
 *   Expected shape (subset):
 *     {
 *       id: string,
 *       title: string,
 *       address: string,
 *       road: string,
 *       number: string,
 *       model: string,
 *       owner: string,
 *       imageUrl: string
 *     }
 * @param {{ onEdit?: (record: object) => void }} [handlers={}] - Optional callbacks.
 * @returns {HTMLElement} The constructed card element.
 */
export function createRosterCard(rosterRecord, handlers = {}) {
  const cardElement = document.createElement("article");
  cardElement.className = "card";
  cardElement.dataset.rosterId = rosterRecord.id;

  const titleText = rosterRecord.title || "(unnamed)";

  // Build the subtitle lines (only include truthy values)
  const subtitleLines = filterTruthy([
    rosterRecord.address && `DCC ${rosterRecord.address}`,
    formatRoadAndNumber(rosterRecord.road, rosterRecord.number),
    rosterRecord.model,
    rosterRecord.owner && `Owner: ${rosterRecord.owner}`,
  ]);

  // Static structure: image area + body (title, subs)
  cardElement.innerHTML = `
    <div class="card-img" aria-hidden="true">
      ${buildImageMarkup(rosterRecord.imageUrl)}
    </div>
    <div class="card-body">
      <div class="card-title">${escapeHtml(titleText)}</div>
      ${subtitleLines.map((line) => `<div class="card-sub">${escapeHtml(line)}</div>`).join("")}
    </div>
  `;

  // Card is clickable; also provide explicit Edit button if present.
  const openEditor = () => handlers.onEdit?.(rosterRecord);

  // Click anywhere on the card to edit
  cardElement.addEventListener("click", openEditor);

  // Prevent card click from firing when Edit button is pressed
  cardElement.querySelector('[data-act="edit"]')?.addEventListener("click", (event) => {
    event.stopPropagation();
    openEditor();
  });

  return cardElement;
}

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

/**
 * Build image markup for the card.
 * - If a URL is provided, render an <img>.
 * - Otherwise, render a semantic placeholder element.
 *
 * @param {string} src - Image source URL.
 * @returns {string} HTML string for the image region.
 */
function buildImageMarkup(src) {
  const cleaned = (src || "").trim();
  if (!cleaned) {
    return "<span class=\"card-img-placeholder\" aria-hidden=\"true\"></span>";
  }
  return `<img class="card-img-media" src="${escapeAttribute(cleaned)}&v=${Date.now()}" alt="" loading="lazy" decoding="async" data-roster-img="">`;
}

/**
 * Format a combined "road number" line.
 * Examples:
 *   ("BNSF", "1234") -> "BNSF 1234"
 *   ("BNSF", "")     -> "BNSF"
 *   ("", "1234")     -> "1234"
 *   ("", "")         -> ""
 *
 * @param {string} road - Road name.
 * @param {string} number - Loco number.
 * @returns {string} Formatted line or empty string.
 */
function formatRoadAndNumber(road, number) {
  const roadText = (road || "").trim();
  const numberText = (number || "").trim();
  if (!roadText && !numberText) return "";
  if (roadText && numberText) return `${roadText} ${numberText}`;
  return roadText || numberText;
}

/**
 * Remove falsy values from an array.
 *
 * @template T
 * @param {T[]} array - Array possibly containing falsy entries.
 * @returns {T[]} A new array with only truthy values.
 */
function filterTruthy(array) {
  return (array || []).filter(Boolean);
}

/**
 * Escape double-quotes for safe attribute interpolation.
 * (Use `escapeHtml` for text nodes; this is only for attributes.)
 *
 * @param {string} value - Attribute value.
 * @returns {string} Escaped value.
 */
function escapeAttribute(value) {
  return String(value).replace(/"/g, "&quot;");
}
