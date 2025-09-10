// js/controllers/roster/dialog/functionsTab.js
// Functions tab: add/edit loco functions one-by-one, delete per row,
// and copy functions from another roster entry via <select id="fnCopySelect">.

import {
  getFunctions,
  saveFunctions,
  getRoster,
} from "../../../services/jmri.js";
import { showToast } from "../../../ui/toast.js";
import { escapeHtml } from "../../../ui/dom.js";

/* ----------------------------- Selectors ----------------------------- */
const FUNCTION_SELECTORS = {
  list: "#fnList", // <ul class="fn-list">
  addButton: "#fnAdd", // "Add Function" button
  copySelect: "#fnCopySelect", // <select> used to copy from another loco
};

const MAX_FUNCTION_NUMBER = 28;

/* -------------------------------- State ------------------------------- */
let currentRosterFileName = ""; // e.g., "MyLoco.xml"
let hasBoundDomEvents = false;

/** Source of truth for render & save. */
let functionRowModels = []; // [{ num, label, lockable }]

/* ------------------------------ Utilities ----------------------------- */
function select(selector, rootElement = document) {
  return rootElement.querySelector(selector);
}

function clampNumber(minValue, value, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function sortFunctionRowsByNumber() {
  functionRowModels.sort((left, right) => Number(left.num) - Number(right.num));
}

/** Return first free function number in [0..28], or null if all used. */
function findNextFreeFunctionNumber() {
  const usedNumbersSet = new Set(
    functionRowModels.map((row) => Number(row.num))
  );
  for (
    let functionNumber = 0;
    functionNumber <= MAX_FUNCTION_NUMBER;
    functionNumber += 1
  ) {
    if (!usedNumbersSet.has(functionNumber)) return functionNumber;
  }
  return null;
}

/** Return desired if free; otherwise the next free slot (or null if none). */
function findUniqueFunctionNumber(desiredFunctionNumber) {
  const usedNumbersSet = new Set(
    functionRowModels.map((row) => Number(row.num))
  );
  if (!usedNumbersSet.has(desiredFunctionNumber)) return desiredFunctionNumber;

  for (let n = desiredFunctionNumber + 1; n <= MAX_FUNCTION_NUMBER; n += 1) {
    if (!usedNumbersSet.has(n)) return n;
  }
  for (let n = 0; n < desiredFunctionNumber; n += 1) {
    if (!usedNumbersSet.has(n)) return n;
  }
  return null;
}

/* ------------------------------- Render ------------------------------- */
function renderSingleFunctionRow(functionRowModel) {
  const deleteIconSvg =
    '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    "</svg>";

  return `
    <li class="fn-card" data-fn-num="${functionRowModel.num}">
      <div class="fn-row">
        <div class="fn-num">
          <input
            type="number"
            class="fn-num-input"
            inputmode="numeric" pattern="\\d*"
            min="0" max="${MAX_FUNCTION_NUMBER}"
            value="${functionRowModel.num}"
            aria-label="Function number"
          >
        </div>

        <div class="fn-label">
          <input
            type="text"
            class="fn-label-input"
            value="${escapeHtml(functionRowModel.label || "")}"
            placeholder="Label (e.g. Horn)"
            aria-label="Function label"
          >
        </div>

        <div class="fn-lock">
          <label class="row row--stack" style="gap:6px">
            <span>Lockable</span>
            <input type="checkbox" class="fn-lock-input" ${
              functionRowModel.lockable ? "checked" : ""
            }>
          </label>
        </div>

        <div class="fn-actions">
          <button
            type="button"
            class="icon-btn fn-delete-btn"
            aria-label="Delete function"
            title="Delete"
            style="padding:4px;border:0;background:transparent;color:#a62622"
          >
            ${deleteIconSvg}
          </button>
        </div>
      </div>
    </li>
  `;
}

function renderFunctionsList() {
  const functionsListElement = select(FUNCTION_SELECTORS.list);
  if (!functionsListElement) return;

  sortFunctionRowsByNumber();
  functionsListElement.innerHTML = functionRowModels
    .map(renderSingleFunctionRow)
    .join("");
}

/* ----------------------------- Copy support --------------------------- */
/**
 * Populate the "Copy from…" select with only those roster entries
 * that already have at least one function defined. Excludes the current loco.
 */
async function populateCopySourceSelect() {
  const copySelectElement = select(FUNCTION_SELECTORS.copySelect);
  if (!copySelectElement) return;

  // Reset options
  copySelectElement.innerHTML = "";
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = "Copy functions from…";
  copySelectElement.appendChild(placeholderOption);

  let rosterEntries = [];
  try {
    const rawRoster = await getRoster({ fresh: false });
    rosterEntries = Array.isArray(rawRoster) ? rawRoster : [];
  } catch {
    // If roster cannot be fetched, leave the select in placeholder state.
    return;
  }

  // Resolve id + file for each entry (support both raw and normalized shapes)
  const normalizedEntries = rosterEntries
    .map((entry) => {
      const fileName =
        entry.fileName || entry.file || entry.data?.fileName || "";
      const displayId =
        entry.id || entry.title || entry.name || entry.data?.name || "";
      return { fileName, displayId };
    })
    .filter((e) => e.fileName && e.displayId);

  // Exclude the current file (if known)
  const candidateEntries = normalizedEntries.filter(
    (e) => e.fileName !== currentRosterFileName
  );

  // Load functions per candidate with a small concurrency limit
  const candidatesWithFunctions = await fetchCandidatesWithFunctions(
    candidateEntries,
    4
  );

  // Sort by displayId for a predictable UI
  candidatesWithFunctions.sort((left, right) =>
    String(left.displayId).localeCompare(String(right.displayId), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );

  for (const candidate of candidatesWithFunctions) {
    const option = document.createElement("option");
    option.value = candidate.fileName; // we'll copy by fileName
    const countLabel = ` (${candidate.functionCount})`;
    option.textContent = `${candidate.displayId}${countLabel}`;
    copySelectElement.appendChild(option);
  }
}

/** Fetch functions for each candidate with concurrency control; keep those with count > 0. */
async function fetchCandidatesWithFunctions(entries, maxConcurrent = 4) {
  const results = [];
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < entries.length) {
      const indexForThisWorker = currentIndex++;
      const entry = entries[indexForThisWorker];
      try {
        const functionsForEntry = await getFunctions(entry.fileName);
        if (Array.isArray(functionsForEntry) && functionsForEntry.length > 0) {
          results.push({
            fileName: entry.fileName,
            displayId: entry.displayId,
            functionCount: functionsForEntry.length,
          });
        }
      } catch {
        // Ignore failures for individual entries to keep UI resilient
      }
    }
  }

  const workerCount = Math.max(1, Math.min(maxConcurrent, entries.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/** Copy functions from the selected source into the current in-memory model. */
async function copyFunctionsFromSelectedSource() {
  const copySelectElement = select(FUNCTION_SELECTORS.copySelect);
  if (!copySelectElement) return;
  const sourceFileName = copySelectElement.value;
  if (!sourceFileName) return;

  if (functionRowModels.length > 0) {
    const confirmReplace = window.confirm(
      "Replace current functions with those from the selected loco?"
    );
    if (!confirmReplace) return;
  }

  try {
    const sourceFunctions = await getFunctions(sourceFileName);
    const nextModels = (Array.isArray(sourceFunctions) ? sourceFunctions : [])
      .map((item) => ({
        num: Number(item.num),
        label: item.label ?? "",
        lockable: Boolean(item.lockable),
      }))
      .filter(
        (row) =>
          Number.isFinite(row.num) &&
          row.num >= 0 &&
          row.num <= MAX_FUNCTION_NUMBER
      );

    functionRowModels = nextModels;
    renderFunctionsList();
    showToast?.("Functions copied");
  } catch (error) {
    showToast?.(error?.message || "Failed to copy functions");
  }
}

/* ------------------------------ DOM Events ---------------------------- */
function addNewFunctionRow() {
  const nextFreeFunctionNumber = findNextFreeFunctionNumber();
  if (nextFreeFunctionNumber == null) {
    showToast?.("All function numbers (0-28) are already used");
    return;
  }
  functionRowModels.push({
    num: nextFreeFunctionNumber,
    label: "",
    lockable: false,
  });
  renderFunctionsList();
}

function deleteFunctionRowByCard(cardElement) {
  const cardFunctionNumber = Number(cardElement.dataset.fnNum);
  functionRowModels = functionRowModels.filter(
    (row) => Number(row.num) !== cardFunctionNumber
  );
  renderFunctionsList();
}

function updateRowNumberWithUniqueness(cardElement, numberInputElement) {
  const originalFunctionNumber = Number(cardElement.dataset.fnNum);
  const rowIndex = functionRowModels.findIndex(
    (row) => Number(row.num) === originalFunctionNumber
  );
  if (rowIndex < 0) return;

  const rowModel = functionRowModels[rowIndex];
  const requestedNumber = Number(numberInputElement.value);

  if (!Number.isFinite(requestedNumber)) {
    numberInputElement.value = String(rowModel.num);
    return;
  }

  const clampedRequested = clampNumber(0, requestedNumber, MAX_FUNCTION_NUMBER);

  // Temporarily free this row’s number to check uniqueness correctly.
  const previousNumber = rowModel.num;
  rowModel.num = "__TEMP__";
  const uniqueNumber = findUniqueFunctionNumber(clampedRequested);
  rowModel.num = previousNumber;

  if (uniqueNumber == null) {
    numberInputElement.value = String(previousNumber);
    showToast?.("No free function numbers available (0-28)");
    return;
  }

  rowModel.num = uniqueNumber;
  cardElement.dataset.fnNum = String(uniqueNumber);
  numberInputElement.value = String(uniqueNumber);

  renderFunctionsList(); // keep list sorted
}

function updateRowLabel(cardElement, textInputElement) {
  const cardFunctionNumber = Number(cardElement.dataset.fnNum);
  const rowModel = functionRowModels.find(
    (row) => Number(row.num) === cardFunctionNumber
  );
  if (!rowModel) return;

  rowModel.label = textInputElement.value.trim();
}

function updateRowLockable(cardElement, checkboxElement) {
  const cardFunctionNumber = Number(cardElement.dataset.fnNum);
  const rowModel = functionRowModels.find(
    (row) => Number(row.num) === cardFunctionNumber
  );
  if (!rowModel) return;

  rowModel.lockable = Boolean(checkboxElement.checked);
}

function onFunctionsListClick(event) {
  const cardElement = event.target.closest(".fn-card");
  if (!cardElement) return;

  // Delete button
  if (event.target.closest(".fn-delete-btn")) {
    deleteFunctionRowByCard(cardElement);
  }
}

function onFunctionsListChange(event) {
  const cardElement = event.target.closest(".fn-card");
  if (!cardElement) return;

  if (event.target.classList.contains("fn-num-input")) {
    updateRowNumberWithUniqueness(cardElement, event.target);
    return;
  }
  if (event.target.classList.contains("fn-label-input")) {
    updateRowLabel(cardElement, event.target);
    return;
  }
  if (event.target.classList.contains("fn-lock-input")) {
    updateRowLockable(cardElement, event.target);
    return;
  }
}

function onCopySelectChange() {
  copyFunctionsFromSelectedSource();
}

function bindFunctionsDomEventsOnce() {
  if (hasBoundDomEvents) return;
  hasBoundDomEvents = true;

  const functionsListElement = select(FUNCTION_SELECTORS.list);
  const addFunctionButton = select(FUNCTION_SELECTORS.addButton);
  const copySelectElement = select(FUNCTION_SELECTORS.copySelect);

  addFunctionButton?.addEventListener("click", addNewFunctionRow);
  functionsListElement?.addEventListener("click", onFunctionsListClick);
  functionsListElement?.addEventListener("change", onFunctionsListChange);
  copySelectElement?.addEventListener("change", onCopySelectChange);
}

/* ------------------------------ Public API ---------------------------- */
export async function loadFunctionsTab(record) {
  bindFunctionsDomEventsOnce();

  functionRowModels = [];
  currentRosterFileName = record?.file || record?.data?.fileName || "";

  // Populate the "copy from" select regardless of whether this loco has a file yet.
  await populateCopySourceSelect();

  // If brand-new (no file yet), show an empty, usable list and return.
  if (!currentRosterFileName) {
    renderFunctionsList();
    return;
  }

  try {
    const serverFunctions = await getFunctions(currentRosterFileName);
    functionRowModels = (Array.isArray(serverFunctions) ? serverFunctions : [])
      .map((serverFunction) => ({
        num: Number(serverFunction.num),
        label: serverFunction.label ?? "",
        lockable: Boolean(serverFunction.lockable),
      }))
      .filter(
        (row) =>
          Number.isFinite(row.num) &&
          row.num >= 0 &&
          row.num <= MAX_FUNCTION_NUMBER
      );

    renderFunctionsList();
  } catch (error) {
    functionRowModels = [];
    renderFunctionsList();
    showToast?.(error?.message || "Failed to load functions");
  }
}

export async function saveFunctionsTab(record) {
  const rosterFileName = record?.file || currentRosterFileName || "";
  if (!rosterFileName) return;

  sortFunctionRowsByNumber();
  const payload = functionRowModels.map((row) => ({
    num: Number(row.num),
    label: row.label || "",
    lockable: Boolean(row.lockable),
  }));

  await saveFunctions(rosterFileName, payload);
}
