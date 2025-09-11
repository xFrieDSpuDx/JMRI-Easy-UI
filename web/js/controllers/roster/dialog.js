// js/controllers/roster/dialog.js
// Locomotive dialog controller (create + edit)
// Now with image picking + upload to /api/roster/image

import { initTabs, resetDialogTabsAndScroll } from "../../ui/tabs.js";
import { query } from "../../ui/dom.js";
import { handleSave, handleDelete } from "./data.js";
import {
  loadInfoTab,
  resetInfoTab,
  initInfoImagePicker,
  onClickReadDcc,
  onClickWriteDcc,
  clearImageMemory,
} from "./dialog/infoTab.js";
import { onClickReadDccChip } from "./dialog/decoderSelect.js";
import { loadFunctionsTab } from "./dialog/functionsTab.js";
import { DCC_RULES_REQUIRED, setupLiveDccValidation } from "../../validation/dcc.js";

// Validation global
/** @type {null | (() => void)} */
let detachAddressValidation = null;

/* ========================================================================== */
/* Selectors                                                                  */
/* ========================================================================== */

/**
 * Dialog query selectors used across tabs and actions.
 * (Exported name preserved for compatibility with existing imports.)
 */
export const LOCO_DIALOG_SELECTORS = {
  dialog: "#locoDialog",
  title: "#locoDialogTitle",

  // Info tab fields
  id: "#locoId",
  dcc: "#locoDccAddress",
  road: "#locoRoadName",
  number: "#locoNumber",
  model: "#locoModel",
  owner: "#locoOwner",
  file: "#locoFile",
  imageUrl: "#locoImageUrl",
  decoderSelect: "#locoDecoderSelect",

  // Image pickers (present in your HTML)
  imageEl: "#modalRosterImage",
  dropZone: "#modalImageDrop",
  fileInput: "#modalImageInput",

  // Actions
  save: "#locoSave",
  cancel: "#locoCancel",
  close: "#locoClose",
  delete: "#locoDelete",
  readDcc: "#locoReadAddress",
  writeDcc: "#locoWriteAddress",
  readDccChip: "#locoDecoderRead",
};

/* ========================================================================== */
/* Dialog chrome                                                              */
/* ========================================================================== */

/**
 * Set the dialog title based on mode.
 *
 * @param {"create"|"edit"} mode - Dialog mode.
 * @returns {void}
 */
function setDialogTitle(mode) {
  const titleEl = query(LOCO_DIALOG_SELECTORS.title);
  if (!titleEl) return;
  titleEl.textContent = mode === "create" ? "Add Locomotive" : "Edit Locomotive";
}

/**
 * Make the ID input read-only in edit mode.
 *
 * @param {"create"|"edit"} mode - Dialog mode.
 * @returns {void}
 */
function applyIdReadOnlyByMode(mode) {
  const idInput = query(LOCO_DIALOG_SELECTORS.id);
  if (!idInput) return;
  idInput.toggleAttribute("readonly", mode === "edit");
}

/**
 * Replace a button with a cloned node to reliably remove old listeners.
 *
 * @param {string} selector - CSS selector for the button.
 * @returns {HTMLElement|null} The fresh button element or null if not found.
 */
function resetButton(selector) {
  const button = query(selector);
  if (!button) return null;
  const clone = button.cloneNode(true);
  button.replaceWith(clone);
  return clone;
}

/* ========================================================================== */
/* Open / Close                                                               */
/* ========================================================================== */

/**
 * Open a <dialog> element if not already open.
 *
 * @param {HTMLDialogElement} dialogElement - The dialog element.
 * @returns {void}
 */
function showDialog(dialogElement) {
  if (dialogElement && !dialogElement.open) dialogElement.showModal();
}

/**
 * Close the locomotive dialog and clear transient image state.
 *
 * @returns {void}
 */
export function closeDialog() {
  const dialogElement = query(LOCO_DIALOG_SELECTORS.dialog);
  try {
    if (dialogElement?.open) dialogElement.close();
  } catch (error) {
    console.warn(error);
  }

  clearImageMemory();
}

/* ========================================================================== */
/* Public API                                                                 */
/* ========================================================================== */

/**
 * Open the Locomotive dialog.
 *
 * @param {"create"|"edit"} mode - Dialog mode.
 * @param {object|null} record - Normalized roster record (or null for create).
 * @param {() => void} onSaved - Called after a successful save/delete.
 * @param {boolean} [prefill=false] - If true, keep existing image URL as-is.
 * @returns {Promise<void>} Resolves after the dialog is fully initialized.
 */
export async function openLocoDialog(mode, record, onSaved, prefill = false) {
  const dialogElement = query(LOCO_DIALOG_SELECTORS.dialog);
  if (!dialogElement) return;

  // Title + ID policy
  setDialogTitle(mode);
  applyIdReadOnlyByMode(mode);

  // Prefill or clear
  if (record) {
    loadInfoTab(record, prefill);
  } else {
    resetInfoTab();
  }

  // Tabs
  initTabs(dialogElement);

  // Wire the image pickers (click/drag/drop → preview)
  initInfoImagePicker();

  // Rebind actions idempotently
  const saveBtn = resetButton(LOCO_DIALOG_SELECTORS.save);
  const cancelBtn = resetButton(LOCO_DIALOG_SELECTORS.cancel);
  const closeBtn = resetButton(LOCO_DIALOG_SELECTORS.close);
  const deleteBtn = resetButton(LOCO_DIALOG_SELECTORS.delete);
  const readBtn = resetButton(LOCO_DIALOG_SELECTORS.readDcc);
  const writeBtn = resetButton(LOCO_DIALOG_SELECTORS.writeDcc);
  const readDccChipBtn = resetButton(LOCO_DIALOG_SELECTORS.readDccChip);

  // Wire buttons
  saveBtn?.addEventListener("click", () => handleSave(onSaved));
  const closeHandler = () => closeDialog();
  cancelBtn?.addEventListener("click", closeHandler);
  closeBtn?.addEventListener("click", closeHandler);
  deleteBtn?.addEventListener("click", () => handleDelete(onSaved));
  readBtn?.addEventListener("click", onClickReadDcc);
  writeBtn?.addEventListener("click", onClickWriteDcc);
  readDccChipBtn?.addEventListener("click", () =>
    onClickReadDccChip(query(LOCO_DIALOG_SELECTORS.decoderSelect))
  );

  // Visibility of buttons on load
  if (mode === "edit") {
    deleteBtn.hidden = false;
  } else {
    deleteBtn.hidden = true;
  }

  // Live validation
  const addressInput = query(LOCO_DIALOG_SELECTORS.dcc);
  if (detachAddressValidation) detachAddressValidation();
  detachAddressValidation = setupLiveDccValidation({
    input: addressInput,
    saveButton: query(LOCO_DIALOG_SELECTORS.save),
    writeDccButton: query(LOCO_DIALOG_SELECTORS.writeDcc),
    rules: DCC_RULES_REQUIRED,
    errorId: "rosterSystemNameError",
    disableSaveWhenInvalid: true,
  });

  // Load functions tab
  try {
    await loadFunctionsTab(record);
  } catch (error) {
    console.warn(error);
  }

  // Open
  showDialog(dialogElement);

  // Reset tab and scroll
  resetDialogTabsAndScroll(dialogElement);
}
