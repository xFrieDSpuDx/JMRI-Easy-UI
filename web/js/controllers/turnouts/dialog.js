// js/controllers/turnouts/dialog.js
// Turnout dialog (create + edit) with shared DCC validation
//
// #toSystemName holds the numeric DCC address only.
// On create: systemName = <selectedPrefix> + <digits>.
// On edit: we show the numeric part (readonly) and never rename.

import { onDeleteTurnout } from "./index.js";
import { busyWhile } from "../../ui/busy.js";
import { createTurnout, updateTurnout } from "./data.js";
import { getPrefixes } from "../../services/prefixes.js";
import { showToast } from "../../ui/toast.js";
import { resetDialogTabsAndScroll } from "../../ui/tabs.js";
import { query, getInputValue, isElementChecked } from "../../ui/dom.js";
import {
  DCC_RULES_REQUIRED,
  getDccAddressError,
  setupLiveDccValidation,
} from "../../validation/dcc.js";

/* ============================================================================
 * Selectors & Constants
 * ========================================================================== */

/** Dialog element selectors. */
const TURNOUT_DIALOG_SELECTORS = {
  dialog: "#turnoutDialog",
  form: "#turnoutForm",
  title: "#turnoutDialogTitle",
  prefix: "#toPrefixSelect",
  system: "#toSystemName",
  user: "#toUserName",
  comment: "#toComment",
  inverted: "#toInverted",
  state: "#toState",
  save: "#turnoutSave",
  cancel: "#turnoutCancel",
  close: "#turnoutClose",
  delete: "#turnoutDelete",
  countRow: "#toCountRow",
  count: "#toCount",
};

/** Busy message shown while saving. */
const savingMessage = "Saving…";

/* State */
let onSavedCallback = null;
/** @type {"create"|"edit"|"sequential"} */
let dialogMode = "edit"; // default
/** @type {string[]} */
let knownSystemNamePrefixes = []; // e.g., ["LT","IT","MT"]
/** @type {null | (() => void)} */
let detachAddressValidation = null;

// Stored handlers so we can remove before re-adding
/** @type {null | (() => void)} */ let boundSaveHandler = null;
/** @type {null | (() => void)} */ let boundCancelHandler = null;
/** @type {null | (() => void)} */ let boundDeleteHandler = null;

/* ============================================================================
 * Prefix Helpers
 * ========================================================================== */

/**
 * Fetch prefixes and populate the <select>. Also cache the known prefixes.
 *
 * @returns {Promise<Array<{systemPrefix:string, systemNamePrefix:string, connectionName?:string}>>}
 */
async function populatePrefixSelect() {
  const prefixSelect = query(TURNOUT_DIALOG_SELECTORS.prefix);
  if (!prefixSelect) return [];

  const prefixList = await getPrefixes("turnout"); // [{systemPrefix, systemNamePrefix, connectionName}, ...]
  knownSystemNamePrefixes = Array.isArray(prefixList)
    ? prefixList.map((prefixObject) => prefixObject.systemNamePrefix).filter(Boolean)
    : [];

  prefixSelect.innerHTML = "";
  for (const connection of prefixList) {
    const option = document.createElement("option");
    option.value = connection.systemNamePrefix; // e.g., "D"
    option.textContent = connection.connectionName
      ? `${connection.systemNamePrefix} — ${connection.connectionName}`
      : connection.systemNamePrefix;
    prefixSelect.appendChild(option);
  }

  return prefixList;
}

/**
 * Which known prefix does the given system name start with (if any)?
 *
 * @param {string} systemName
 * @returns {string|null}
 */
function detectSystemPrefix(systemName) {
  if (!systemName) return null;
  for (const prefix of knownSystemNamePrefixes) {
    if (systemName.startsWith(prefix)) return prefix;
  }
  return null;
}

/**
 * Extract the numeric DCC address from a full system name.
 *
 * @param {string} systemName
 * @param {string|null} detectedPrefix
 * @returns {string}
 */
function extractDigitsFromSystemName(systemName, detectedPrefix) {
  const source = (systemName || "").trim();
  if (!source) return "";

  let remainder = source;
  if (detectedPrefix && source.startsWith(detectedPrefix)) {
    remainder = source.slice(detectedPrefix.length);
  } else {
    // common pattern like "LT123"
    remainder = source.replace(/^[A-Za-z]+/, "");
  }

  const match = remainder.match(/\d+/);
  return match ? match[0] : "";
}

/* ============================================================================
 * Form I/O
 * ========================================================================== */

/**
 * Populate the form inputs from a record.
 *
 * @param {object|null} record
 * @param {string|null} detectedPrefixForEdit
 * @returns {void}
 */
function setFormValuesFromRecord(record, detectedPrefixForEdit = null) {
  const systemInput = query(TURNOUT_DIALOG_SELECTORS.system);
  const userInput = query(TURNOUT_DIALOG_SELECTORS.user);
  const commentInput = query(TURNOUT_DIALOG_SELECTORS.comment);
  const invertedInput = query(TURNOUT_DIALOG_SELECTORS.inverted);
  const stateSelect = query(TURNOUT_DIALOG_SELECTORS.state);

  const fullSystemName = record?.name || record?.address || record?.data?.name || "";

  systemInput.value = extractDigitsFromSystemName(fullSystemName, detectedPrefixForEdit);
  userInput.value = record?.userName || record?.title || "";
  commentInput.value = record?.comment || "";
  invertedInput.checked = !!record?.inverted;
  stateSelect.value = ""; // unchanged by default
}

/**
 * Collect form values from the dialog inputs.
 *
 * @returns {{ dccDigits:string, selectedPrefix:string, userName:string, comment:string, inverted:boolean, stateChoice:string }}
 */
function collectFormValues() {
  return {
    dccDigits: getInputValue(TURNOUT_DIALOG_SELECTORS.system),
    selectedPrefix: getInputValue(TURNOUT_DIALOG_SELECTORS.prefix),
    userName: getInputValue(TURNOUT_DIALOG_SELECTORS.user),
    comment: getInputValue(TURNOUT_DIALOG_SELECTORS.comment),
    inverted: isElementChecked(TURNOUT_DIALOG_SELECTORS.inverted),
    stateChoice: getInputValue(TURNOUT_DIALOG_SELECTORS.state), // "", "closed", "thrown"
  };
}

/**
 * Map desired logical state → JMRI raw value, honouring inversion.
 *
 * @param {string} stateChoice - "", "closed", or "thrown".
 * @param {boolean} inverted
 * @returns {number|null} JMRI raw state or null if no choice.
 */
function convertStateToRaw(stateChoice, inverted) {
  if (!stateChoice) return null;
  const wantsThrown = stateChoice === "thrown";
  // Normal: Closed=2, Thrown=4. Inverted flips them.
  return wantsThrown ? (inverted ? 2 : 4) : inverted ? 4 : 2;
}

/* ============================================================================
 * Sequential Helpers
 * ========================================================================== */

/**
 * Read and clamp the sequential count (1..64).
 *
 * @returns {number}
 */
function getSequentialCount() {
  const countValue = Number(query(TURNOUT_DIALOG_SELECTORS.count)?.value ?? 1);
  return Number.isFinite(countValue) && countValue > 0 ? Math.min(countValue, 64) : 1;
}

/**
 * Show/hide the sequential row in the form.
 *
 * @param {boolean} visible
 * @returns {void}
 */
function toggleSequentialRow(visible) {
  const row = query(TURNOUT_DIALOG_SELECTORS.countRow);
  if (row) row.hidden = !visible;
}

/* ============================================================================
 * Dialog Chrome
 * ========================================================================== */

/**
 * Set the dialog title text.
 *
 * @param {string} text
 * @returns {void}
 */
function setDialogTitle(text) {
  const titleElement = query(TURNOUT_DIALOG_SELECTORS.title);
  if (titleElement) titleElement.textContent = text;
}

/**
 * Open the dialog and reset tabs/scroll.
 *
 * @returns {void}
 */
function openDialog() {
  const dialogElement = query(TURNOUT_DIALOG_SELECTORS.dialog);
  if (dialogElement && !dialogElement.open) dialogElement.showModal();
  // Reset tab and scroll
  resetDialogTabsAndScroll(dialogElement);
}

/**
 * Close the dialog.
 *
 * @returns {void}
 */
export function closeDialog() {
  const dialogElement = query(TURNOUT_DIALOG_SELECTORS.dialog);
  if (!dialogElement) return;
  try {
    if (dialogElement.open) dialogElement.close();
  } catch (error) {
    console.warn(error);
  }
}

/* ============================================================================
 * Save Flow
 * ========================================================================== */

/**
 * Handle Save click for create/edit/sequential modes.
 *
 * @param {object|null} existingRecord
 * @returns {Promise<void>}
 */
async function handleSave(existingRecord) {
  const form = collectFormValues();
  const isCreateMode = ["create", "sequential"].includes(dialogMode);

  // Validate (create only)
  const validationError = isCreateMode ? validateBeforeCreate(form) : null;
  if (validationError) {
    showToast?.(validationError);
    return;
  }

  const finalSystemName = computeFinalSystemName(existingRecord, form, isCreateMode);
  const desiredStateRaw = computeInitialStateRaw(form);
  const sequentialCount = isCreateMode ? getSequentialCount() : 1;

  try {
    let toastMessage = "Saved";

    await busyWhile(async () => {
      if (isCreateMode && sequentialCount > 1) {
        // Batch create sequential addresses
        toastMessage = await createSequentialTurnouts(form, sequentialCount, desiredStateRaw);
      } else if (isCreateMode) {
        // Single create
        await createSingleTurnout(finalSystemName, form, desiredStateRaw);
      } else {
        // Edit existing
        const targetSystemName = getTargetSystemName(existingRecord, finalSystemName);
        await updateExistingTurnout(targetSystemName, form, desiredStateRaw);
      }
    }, savingMessage);

    closeDialog();
    showToast?.(toastMessage);
    onSavedCallback?.();
  } catch (err) {
    showToast?.(err?.message || "Save failed");
  }
}

/* ============================================================================
 * Save helpers
 * ========================================================================== */

/**
 * Validate inputs used on create. Returns error message string or null.
 *
 * @param {{ dccDigits:string, selectedPrefix:string }} form
 * @returns {string|null}
 */
function validateBeforeCreate(form) {
  const addrErr = getDccAddressError(form.dccDigits, DCC_RULES_REQUIRED);
  if (addrErr) return addrErr;
  if (!form.selectedPrefix) return "Select a connection/prefix";
  return null;
}

/**
 * Build the final system name for create; or use the existing record on edit.
 *
 * @param {any} existingRecord
 * @param {{ dccDigits:string, selectedPrefix:string }} form
 * @param {boolean} isCreateMode
 * @returns {string}
 */
function computeFinalSystemName(existingRecord, form, isCreateMode) {
  if (isCreateMode) {
    return `${form.selectedPrefix || ""}${form.dccDigits || ""}`.trim();
  }
  return (
    existingRecord?.name ||
    existingRecord?.address ||
    existingRecord?.data?.name ||
    ""
  ).trim();
}

/**
 * Convert UI state choice to raw, honouring inversion.
 *
 * @param {{ stateChoice:string, inverted:boolean }} form
 * @returns {number|null}
 */
function computeInitialStateRaw(form) {
  return convertStateToRaw(form.stateChoice, form.inverted);
}

/**
 * When editing, find the correct system name target.
 *
 * @param {any} existingRecord
 * @param {string} fallbackSystemName
 * @returns {string}
 */
function getTargetSystemName(existingRecord, fallbackSystemName) {
  return (
    existingRecord?.name ||
    existingRecord?.address ||
    existingRecord?.data?.name ||
    fallbackSystemName
  );
}

/**
 * Friendly-name rule for batch:
 * - no base name → just the DCC address
 * - with base name → first = base only, subsequent = "base DCC"
 *
 * @param {string} baseUserName
 * @param {number} dccAddress
 * @param {boolean} isFirst
 * @returns {string}
 */
function friendlyNameForBatch(baseUserName, dccAddress, isFirst) {
  const name = (baseUserName || "").trim();
  if (!name) return String(dccAddress);
  return isFirst ? name : `${name} ${dccAddress}`;
}

/**
 * Create a single turnout, applying the “no name → use DCC address” rule.
 *
 * @param {string} systemName
 * @param {{ dccDigits:string, userName:string, comment:string, inverted:boolean }} form
 * @param {number|null} desiredStateRaw
 * @returns {Promise<void>}
 */
async function createSingleTurnout(systemName, form, desiredStateRaw) {
  // If no friendly name provided, use the DCC address as the userName
  const userName = (form.userName || "").trim() || String(form.dccDigits || "");

  await createTurnout({
    systemName,
    userName,
    comment: form.comment,
    inverted: form.inverted,
  });

  if (desiredStateRaw !== null) {
    await updateTurnout(systemName, { state: desiredStateRaw });
  }
}

/**
 * Update an existing turnout; state is optional.
 *
 * @param {string} systemName
 * @param {{ userName:string, comment:string, inverted:boolean }} form
 * @param {number|null} desiredStateRaw
 * @returns {Promise<void>}
 */
async function updateExistingTurnout(systemName, form, desiredStateRaw) {
  const updateFields = {
    userName: form.userName,
    comment: form.comment,
    inverted: form.inverted,
  };
  if (desiredStateRaw !== null) updateFields.state = desiredStateRaw;

  await updateTurnout(systemName, updateFields);
}

/**
 * Batch-create N turnouts with sequential DCC addresses. Returns a toast string.
 *
 * @param {{ userName:string, comment:string, inverted:boolean, dccDigits:string, selectedPrefix:string }} form
 * @param {number} count
 * @param {number|null} desiredStateRaw
 * @returns {Promise<string>} Summary message for the toast.
 */
async function createSequentialTurnouts(form, count, desiredStateRaw) {
  const baseAddress = Number(form.dccDigits);
  if (!Number.isFinite(baseAddress)) throw new Error("Invalid base DCC address");
  const prefix = form.selectedPrefix || "";
  if (!prefix) throw new Error("Select a connection/prefix");

  let createdCount = 0;
  const failures = [];

  for (let index = 0; index < count; index++) {
    const dcc = baseAddress + index;
    const systemName = `${prefix}${dcc}`;
    const userName = friendlyNameForBatch(form.userName, dcc, index === 0);

    try {
      await createTurnout({
        systemName,
        userName,
        comment: form.comment,
        inverted: form.inverted,
      });

      if (desiredStateRaw !== null) {
        await updateTurnout(systemName, { state: desiredStateRaw });
      }
      createdCount += 1;
    } catch (err) {
      failures.push({ dcc, message: err?.message || "create failed" });
    }
  }

  if (failures.length === 0) {
    return `Created ${createdCount} turnouts`;
  }
  if (createdCount === 0) {
    return `No turnouts created (${failures.length} failed)`;
  }
  const sample = failures
    .slice(0, 3)
    .map((failure) => failure.dcc)
    .join(", ");
  return `Created ${createdCount}/${count}; failed: ${
    failures.length
  } (${sample}${failures.length > 3 ? "…" : ""})`;
}

/* ============================================================================
 * Public API
 * ========================================================================== */

/**
 * Open the Turnout dialog.
 *
 * @param {"create"|"edit"|"sequential"} openMode
 * @param {object|null} record
 * @param {() => void} onSaved
 * @returns {Promise<void>}
 */
export async function openTurnoutDialog(openMode, record, onSaved) {
  dialogMode = openMode;
  onSavedCallback = onSaved || null;

  setDialogTitle(["create", "sequential"].includes(openMode) ? "Add Turnout" : "Edit Turnout");

  toggleSequentialRow(openMode === "sequential");
  const countInput = query(TURNOUT_DIALOG_SELECTORS.count);
  if (countInput) countInput.value = "1";

  // Populate prefixes, then fill the form
  try {
    await populatePrefixSelect();
    const prefixSelect = query(TURNOUT_DIALOG_SELECTORS.prefix);

    if (openMode === "edit") {
      const fullSystemName = record?.name || record?.address || record?.data?.name || "";
      const detectedPrefix = detectSystemPrefix(fullSystemName);
      if (prefixSelect && detectedPrefix) prefixSelect.value = detectedPrefix;

      query(TURNOUT_DIALOG_SELECTORS.delete).hidden = false;

      setFormValuesFromRecord(record, detectedPrefix);
    } else {
      if (prefixSelect && prefixSelect.options.length > 0 && !prefixSelect.value) {
        prefixSelect.value = prefixSelect.options[0].value;
      }
      query(TURNOUT_DIALOG_SELECTORS.delete).hidden = true;

      setFormValuesFromRecord(null, null); // address empty; user types digits
    }
  } catch {
    setFormValuesFromRecord(openMode === "edit" ? record : null, null);
  }

  // In edit mode, DCC field remains readonly (no accidental rename)
  const addressInput = query(TURNOUT_DIALOG_SELECTORS.system);
  if (addressInput) {
    addressInput.toggleAttribute("readonly", openMode === "edit");
  }

  // Live validation (create mode only; disables Save while invalid)
  if (detachAddressValidation) detachAddressValidation();
  detachAddressValidation = setupLiveDccValidation({
    input: addressInput,
    saveButton: query(TURNOUT_DIALOG_SELECTORS.save),
    rules: DCC_RULES_REQUIRED,
    errorId: "turnoutSystemNameError",
    disableSaveWhenInvalid: true,
  });

  openDialog();

  // Rebind actions idempotently
  query(TURNOUT_DIALOG_SELECTORS.save)?.removeEventListener("click", boundSaveHandler);
  query(TURNOUT_DIALOG_SELECTORS.delete)?.removeEventListener("click", boundDeleteHandler);
  query(TURNOUT_DIALOG_SELECTORS.cancel)?.removeEventListener("click", boundCancelHandler);
  query(TURNOUT_DIALOG_SELECTORS.close)?.removeEventListener("click", boundCancelHandler);

  boundSaveHandler = () => handleSave(record);
  boundDeleteHandler = () => onDeleteTurnout(record, true);
  boundCancelHandler = () => closeDialog();

  query(TURNOUT_DIALOG_SELECTORS.delete)?.addEventListener("click", boundDeleteHandler);
  query(TURNOUT_DIALOG_SELECTORS.save)?.addEventListener("click", boundSaveHandler);
  query(TURNOUT_DIALOG_SELECTORS.cancel)?.addEventListener("click", boundCancelHandler);
  query(TURNOUT_DIALOG_SELECTORS.close)?.addEventListener("click", boundCancelHandler);
}

/**
 * Optional init hook (reserved for future enhancements).
 *
 * @returns {void}
 */
export function initTurnoutDialog() {}
