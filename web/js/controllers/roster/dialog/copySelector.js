import { fetchRoster } from "../data.js";
import { openLocoDialog } from "../dialog.js";
import { showToast } from "../../../ui/toast.js";
import { escapeHtml } from "../../../ui/dom.js";
import { refreshRoster } from "../index.js";

/** Build a unique ID suggestion based on a base id and a set of existing ids. */
function buildUniqueIdSuggestion(locoId, existingIdSet) {
  const base = String(locoId || "").trim();
  if (!base) return "";
  const exists = (id) => existingIdSet.has(String(id).toLowerCase());

  if (!exists(base)) return base;

  const matchedId = base.match(/^(.*?)(\d+)$/);
  let stem = matchedId ? matchedId[1] : `${base}-`;
  let numberPostfix = matchedId ? parseInt(matchedId[2], 10) + 1 : 2;
  let candidate = `${stem}${numberPostfix}`;

  while (exists(candidate)) {
    numberPostfix += 1;
    candidate = `${stem}${numberPostfix}`;
  }
  return candidate;
}

/** Return a Set of existing ids (lowercased) from normalized roster. */
function toIdSet(records) {
  const recordSet = new Set();
  for (const record of records || []) {
    if (record?.id) recordSet.add(String(record.id).toLowerCase());
  }
  return recordSet;
}

function iconUrl(id) {
  return `/api/roster/icon?id=${encodeURIComponent(id)}&v=${Date.now()}`;
}

/** Open the create dialog prefilled from a source record (except ID). */
function openCopyFromRecord(source, allRecords) {
  if (!source) return;

  const existingIds = toIdSet(allRecords);
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

let copyState = {
  root: null,
  anchor: null,
  records: [],
  filtered: [],
  activeIndex: 0,
};

function ensureCopyDom() {
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
  copyState.root = {
    entryItem,
    copyPopup,
    search: copyPopup.querySelector(".copy-search"),
    list: copyPopup.querySelector(".copy-list"),
    close: copyPopup.querySelector(".copy-close"),
  };

  const search = copyPopup.querySelector(".copy-search");
  const list = copyPopup.querySelector(".copy-list");
  const closeBtn = copyPopup.querySelector(".copy-close");

  copyState.root = { entryItem, copyPopup, search, list, closeBtn };

  // Close behaviors
  const closePopover = () => {
    entryItem.hidden = true;
    copyPopup.hidden = true;
    copyPopup.removeAttribute("style");
    copyState.anchor = null;
  };

  entryItem.addEventListener("click", closePopover);
  closeBtn?.addEventListener("click", closePopover);

  // Search
  search.addEventListener("input", () => {
    renderCopyList(filterRecords(copyState.records, search.value));
  });

  return copyState.root;
}

function filterRecords(records, searchValue) {
  const term = String(searchValue || "")
    .trim()
    .toLowerCase();
  if (!term) return records.slice(0, 200);
  return records
    .filter((results) => {
      return [
        results.id,
        results.road,
        results.number,
        results.model,
        results.owner,
      ].some((value) => (value || "").toLowerCase().includes(term));
    })
    .slice(0, 200);
}

function renderCopyList(list) {
  const { list: ul } = copyState.root;
  copyState.filtered = list;

  ul.innerHTML = "";
  if (!list.length) {
    ul.innerHTML = `<div class="copy-item copy-item-no-results" aria-disabled="true">No matches</div>`;
    return;
  }

  list.forEach((rosterEntry) => {
    const li = document.createElement("div");
    li.className = "copy-item";
    li.setAttribute("role", "option");

    li.innerHTML = `
      <div class="copy-thumb"><img alt="" src="${iconUrl(
        rosterEntry.id
      )}"></div>
      <div class="copy-main">
        <div class="copy-title">${escapeHtml(rosterEntry.id)}</div>
        <div class="copy-sub">${escapeHtml(
          [
            rosterEntry.road,
            rosterEntry.number,
            rosterEntry.model,
            rosterEntry.owner,
          ]
            .filter(Boolean)
            .join(" | ")
        )}</div>
      </div>
    `;

    li.addEventListener("click", (event) => {
      if (event.target.closest(".copy-choose") || event.currentTarget === li)
        onChoose(rosterEntry);
    });
    li.addEventListener("mouseenter", () => {
      li.focus({ preventScroll: true });
    });

    ul.appendChild(li);
  });
}

function onChoose(record) {
  const { entryItem, copyPopup } = copyState.root;
  entryItem.hidden = true;
  copyPopup.hidden = true;
  copyPopup.removeAttribute("style");
  copyState.anchor = null;
  openCopyFromRecord(record, copyState.records);
}

function positionPopover(anchor, copyPopup) {
  const rect = anchor.getBoundingClientRect();
  const top = rect.bottom + 8;

  copyPopup.style.top = `${top}px`;
  copyPopup.style.right = "10px";
}

export async function openCopySelector(anchorEl) {
  const ui = ensureCopyDom();
  copyState.anchor = anchorEl || document.getElementById("addLocoMore");

  try {
    const records = await fetchRoster();
    copyState.records = records || [];
  } catch (error) {
    showToast(error?.message || "Failed to load roster");
    return;
  }

  ui.entryItem.hidden = false;
  ui.copyPopup.hidden = false;
  renderCopyList(filterRecords(copyState.records, ""));
  positionPopover(copyState.anchor, ui.copyPopup);
  ui.search.value = "";
  ui.search.focus({ preventScroll: true });
}
