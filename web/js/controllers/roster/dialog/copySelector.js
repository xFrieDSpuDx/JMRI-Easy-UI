import { escapeHtml } from "../../../ui/dom.js";
import { showToast } from "../../../ui/toast.js";
import { fetchRoster } from "../data.js";
import { openLocoDialog } from "../dialog.js";
import { refreshRoster } from "../index.js";

/**
 * Build a unique ID suggestion based on a base ID and a set of existing IDs.
 * If the base already exists, appends/increments a numeric suffix.
 *
 * @param {string} locoId - The starting ID value to base the suggestion on.
 * @param {Set<string>} existingIdSet - A set of existing IDs (case-insensitive).
 * @returns {string} A unique ID suggestion, or an empty string if no base provided.
 */
function buildUniqueIdSuggestion(locoId, existingIdSet) {
  const base = String(locoId || "").trim();
  if (!base) return "";

  const exists = (id) => existingIdSet.has(String(id).toLowerCase());
  if (!exists(base)) return base;

  const matchedId = base.match(/^(.*?)(\d+)$/);
  const stem = matchedId ? matchedId[1] : `${base}-`;
  let numberPostfix = matchedId ? parseInt(matchedId[2], 10) + 1 : 2;
  let candidate = `${stem}${numberPostfix}`;

  while (exists(candidate)) {
    numberPostfix += 1;
    candidate = `${stem}${numberPostfix}`;
  }

  return candidate;
}

/**
 * Create a Set of existing IDs (lowercased) from a normalized roster.
 *
 * @param {Array<object>} records - Roster records that may contain an `id` field.
 * @returns {Set<string>} A set of lowercased IDs.
 */
function collectExistingIdSet(records) {
  const recordSet = new Set();
  for (const record of records || []) {
    if (record?.id) {
      recordSet.add(String(record.id).toLowerCase());
    }
  }
  return recordSet;
}

/**
 * Build the icon URL for a given roster entry ID.
 *
 * @param {string} id - The roster entry ID.
 * @returns {string} A cache-busted icon URL.
 */
function buildIconUrl(id) {
  return `/api/roster/icon?id=${encodeURIComponent(id)}&v=${Date.now()}`;
}

/**
 * Open the "create" loco dialog prefilled with data from a source record (except ID).
 *
 * @param {object} source - The source roster record to copy from.
 * @param {Array<object>} allRecords - All roster records (for unique ID suggestion).
 * @returns {void}
 */
function openCopyFromRecord(source, allRecords) {
  if (!source) return;

  const existingIds = collectExistingIdSet(allRecords);
  const suggestedId = buildUniqueIdSuggestion(source.id, existingIds);

  const prefill = {
    id: suggestedId,
    address: source.address || "",
    road: source.road || "",
    number: source.number || "",
    model: source.model || "",
    owner: source.owner || "",
    file: "",
    imageUrl: source.imageUrl || "",
  };

  openLocoDialog("create", prefill, () => refreshRoster(), true);
}

/* ---------- Popover rendering & behavior ---------- */

const copyState = {
  root: null,
  anchor: null,
  records: [],
  filtered: [],
};

/**
 * Ensure the popover DOM structure exists and wire basic interactions.
 *
 * @returns {{ entryItem: HTMLElement, copyPopup: HTMLElement, search: HTMLInputElement, listContainer: HTMLElement, closeButton: HTMLButtonElement }} References to created DOM elements.
 */
function ensureCopyPopoverElements() {
  if (copyState.root) return copyState.root;

  const entryItem = document.createElement("div");
  entryItem.className = "copy-entryItem";
  entryItem.hidden = true;

  const copyPopup = document.createElement("div");
  copyPopup.className = "copy-popover";
  copyPopup.role = "tabpanel";
  copyPopup.hidden = true;
  copyPopup.innerHTML = `
    <div class="copy-head">
      <input class="copy-search" type="search" placeholder="Search by ID, road, number, model, owner" aria-label="Search locos">
      <button class="copy-close" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="copy-list" role="listbox" aria-label="Locos"></div>
  `;

  document.body.appendChild(entryItem);
  document.body.appendChild(copyPopup);

  const search = copyPopup.querySelector(".copy-search");
  const listContainer = copyPopup.querySelector(".copy-list");
  const closeButton = copyPopup.querySelector(".copy-close");

  copyState.root = { entryItem, copyPopup, search, listContainer, closeButton };

  // Close behaviors
  const closePopover = () => {
    entryItem.hidden = true;
    copyPopup.hidden = true;
    copyPopup.removeAttribute("style");
    copyState.anchor = null;
  };

  entryItem.addEventListener("click", closePopover);
  closeButton?.addEventListener("click", closePopover);

  // Search behavior
  search.addEventListener("input", () => {
    renderCopyListItems(filterRosterRecordsBySearchTerm(copyState.records, search.value));
  });

  return copyState.root;
}

/**
 * Filter roster records by a case-insensitive search term, limiting to 200 results.
 *
 * @param {Array<object>} records - All roster records.
 * @param {string} searchValue - Free-text search input.
 * @returns {Array<object>} Filtered records up to 200 items.
 */
function filterRosterRecordsBySearchTerm(records, searchValue) {
  const term = String(searchValue || "")
    .trim()
    .toLowerCase();
  if (!term) return (records || []).slice(0, 200);

  return (records || [])
    .filter((record) => {
      return [record.id, record.road, record.number, record.model, record.owner].some((value) =>
        (value || "").toLowerCase().includes(term)
      );
    })
    .slice(0, 200);
}

/**
 * Render the filtered list of roster records into the popover list container.
 *
 * @param {Array<object>} records - Records to render.
 * @returns {void}
 */
function renderCopyListItems(records) {
  const { listContainer } = copyState.root;
  copyState.filtered = records;

  listContainer.innerHTML = "";
  if (!records.length) {
    listContainer.innerHTML =
      '<div class="copy-item copy-item-no-results" aria-disabled="true">No matches</div>';
    return;
  }

  records.forEach((rosterEntry) => {
    const listItem = document.createElement("div");
    listItem.className = "copy-item";
    listItem.setAttribute("role", "option");

    listItem.innerHTML = `
      <div class="copy-thumb"><img alt="" src="${buildIconUrl(rosterEntry.id)}"></div>
      <div class="copy-main">
        <div class="copy-title">${escapeHtml(rosterEntry.id)}</div>
        <div class="copy-sub">${escapeHtml(
          [rosterEntry.road, rosterEntry.number, rosterEntry.model, rosterEntry.owner]
            .filter(Boolean)
            .join(" | ")
        )}</div>
      </div>
    `;

    listItem.addEventListener("click", (event) => {
      if (event.target.closest(".copy-choose") || event.currentTarget === listItem) {
        handleRecordChosen(rosterEntry);
      }
    });

    listItem.addEventListener("mouseenter", () => {
      listItem.focus({ preventScroll: true });
    });

    listContainer.appendChild(listItem);
  });
}

/**
 * Handle selection of a roster record from the popover.
 *
 * @param {object} record - The chosen roster record.
 * @returns {void}
 */
function handleRecordChosen(record) {
  const { entryItem, copyPopup } = copyState.root;
  entryItem.hidden = true;
  copyPopup.hidden = true;
  copyPopup.removeAttribute("style");
  copyState.anchor = null;
  openCopyFromRecord(record, copyState.records);
}

/**
 * Position the copy popover relative to its anchor.
 *
 * @param {HTMLElement} anchor - The anchor element that triggers the popover.
 * @param {HTMLElement} copyPopup - The popover element to position.
 * @returns {void}
 */
function positionCopyPopover(anchor, copyPopup) {
  const rect = anchor.getBoundingClientRect();
  const top = rect.bottom + 8;

  copyPopup.style.top = `${top}px`;
  copyPopup.style.right = "10px";
}

/**
 * Open the "Copy From" selector popover. Fetches roster, renders list, and focuses search.
 *
 * @param {HTMLElement} anchorEl - Optional anchor element. Defaults to #addLocoMore.
 * @returns {Promise<void>} Resolves after the popover is opened or an error toast is shown.
 */
export async function openCopySelector(anchorEl) {
  const uiElements = ensureCopyPopoverElements();
  copyState.anchor = anchorEl || document.getElementById("addLocoMore");

  try {
    const records = await fetchRoster();
    copyState.records = records || [];
  } catch (error) {
    showToast(error?.message || "Failed to load roster");
    return;
  }

  uiElements.entryItem.hidden = false;
  uiElements.copyPopup.hidden = false;
  renderCopyListItems(filterRosterRecordsBySearchTerm(copyState.records, ""));
  positionCopyPopover(copyState.anchor, uiElements.copyPopup);
  uiElements.search.value = "";
  uiElements.search.focus({ preventScroll: true });
}
