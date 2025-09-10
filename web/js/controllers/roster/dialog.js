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
import {
  DCC_RULES_REQUIRED,
  setupLiveDccValidation,
} from "../../validation/dcc.js";

// Validation global
let detachAddressValidation = null;

/* ========================================================================== */
/* Selectors                                                                  */
/* ========================================================================== */

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
  imageEl: "#modalRosterImage",
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

function setDialogTitle(mode) {
  const titleEl = query(LOCO_DIALOG_SELECTORS.title);
  if (!titleEl) return;
  titleEl.textContent =
    mode === "create" ? "Add Locomotive" : "Edit Locomotive";
}

function applyIdReadOnlyByMode(mode) {
  const idInput = query(LOCO_DIALOG_SELECTORS.id);
  if (!idInput) return;
  idInput.toggleAttribute("readonly", mode === "edit");
}

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

function showDialog(dialogElement) {
  if (dialogElement && !dialogElement.open) dialogElement.showModal();
}

export function closeDialog() {
  const dialogElement = query(LOCO_DIALOG_SELECTORS.dialog);
  try {
    if (dialogElement?.open) dialogElement.close();
  } catch {
  }

  clearImageMemory()
}

/* ========================================================================== */
/* Public API                                                                 */
/* ========================================================================== */

/**
 * Open the Locomotive dialog.
 *
 * @param {"create"|"edit"} mode
 * @param {object|null} record - Normalised roster record (or null for create).
 * @param {() => void} onSaved - Called after a successful save/delete.
 */
export async function openLocoDialog(mode, record, onSaved, prefill) {
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
  const readDccChip = resetButton(LOCO_DIALOG_SELECTORS.readDccChip);

  // Wire buttons
  saveBtn?.addEventListener("click", () => handleSave(onSaved));
  const closeHandler = () => closeDialog();
  cancelBtn?.addEventListener("click", closeHandler);
  closeBtn?.addEventListener("click", closeHandler);
  deleteBtn?.addEventListener("click", () => handleDelete(onSaved));
  readBtn?.addEventListener("click", onClickReadDcc);
  writeBtn?.addEventListener("click", onClickWriteDcc);
  readDccChip?.addEventListener("click", () => onClickReadDccChip(query(LOCO_DIALOG_SELECTORS.decoderSelect)));

  // Visibility of buttons on load
  if (mode === "edit") deleteBtn.hidden = false;
  else deleteBtn.hidden = true;

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
  try { await loadFunctionsTab(record); } catch {}
  // Open
  showDialog(dialogElement);
  // Reset tab and scroll
  resetDialogTabsAndScroll(dialogElement);
}
