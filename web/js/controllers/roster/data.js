// js/controllers/roster/data.js
// Fetch & normalize roster entries for the Roster panel + create/update/delete.

/* --------------------------------- Imports -------------------------------- */
import {
  LOCO_DIALOG_SELECTORS,
  closeDialog,
} from "./dialog.js";
import {
  getInfoTabSnapshot,
  getPickedImageFile,
  decideImagePersistence,
  getExistingImageSrc,
} from "./dialog/infoTab.js";
import { getChosenDecoderFromSelect } from "./dialog/decoderSelect.js";
import { saveFunctionsTab } from "./dialog/functionsTab.js";
import { busyWhile } from "../../ui/busy.js";
import { showToast } from "../../ui/toast.js";
import { query, setInputValue, getInputValue } from "../../ui/dom.js";
import {
  getRoster,
  saveRosterEntry,
  deleteRoster,
  resolveFileNameById,
  uploadRosterImage,
  uploadRosterXml,
  saveRosterDecoder,
} from "../../services/jmri.js";
import {
  DCC_RULES_REQUIRED,
  getDccAddressError,
} from "../../validation/dcc.js";
import { toSafeFileBase } from "../../validation/form.js";
import { refreshRoster } from "./index.js";

let xmlPickerEl = null;

/* ----------------------------- Data Fetching ------------------------------ */
/**
 * Load roster from your servlet:
 *   GET /api/roster → [{ id, fileName, address, road, number, owner, model }]
 */
export async function fetchRoster() {
  const rawRoster = await getRoster({ fresh: true });
  // const rawRoster = await getJSON("/api/roster");
  return Array.isArray(rawRoster)
    ? rawRoster.map(toRosterRecord).filter(Boolean)
    : [];
}

/* ---------------------------- Normalization -------------------------------- */
/**
 * Map raw roster entry → UI-friendly record (keeps original in `data`).
 * - title: id
 * - address: DCC address (string)
 * - lines: road/number/model/owner (for subs)
 * - imageUrl: /api/roster/icon?id=<id>
 */
export function toRosterRecord(entry) {
  if (!entry || typeof entry !== "object") return null;

  const id = toSafeString(entry.id);
  const fileName = toSafeString(entry.fileName);
  const address = toSafeString(entry.address);
  const road = toSafeString(entry.road);
  const number = toSafeString(entry.number);
  const model = toSafeString(entry.model);
  const owner = toSafeString(entry.owner);

  // Simple icon URL; your server already handles placeholder/SVG fallback.
  const imageUrl = id ? `/api/roster/icon?id=${encodeURIComponent(id)}` : "";

  return {
    // Display
    title: id,
    address,
    road,
    number,
    model,
    owner,
    imageUrl,

    // ids/files we’ll need later
    id,
    file: fileName,

    // keep original
    data: entry,
  };
}

function toSafeString(value) {
  return value == null ? "" : String(value);
}

/* ------------------------------ Save / Delete ------------------------------ */
/**
 * Save handler: validates, persists roster entry, resolves file name, uploads image.
 */
export async function handleSave(onSaved) {
  const formValues = getInfoTabSnapshot();

  if (!formValues.id) {
    showToast("ID is required");
    return;
  }

  const dccAddressError = getDccAddressError(
    formValues.address,
    DCC_RULES_REQUIRED
  );
  if (dccAddressError) {
    showToast?.(dccAddressError);
    return;
  }

  try {
    await busyWhile(async () => {
      // Maintain the same variable lifecycle; we just use clearer names.
      let resolvedFileName = formValues.file;

      // Decide image persistence (kept identical in behavior)
      const { fileToUpload, imageField } = await decideImagePersistence({
        pickedFile: getPickedImageFile(),
        existingSrc: getExistingImageSrc(),
        rosterId: formValues.id,
      });

      // Build initial filename (unchanged logic)
      const proposedFileName =
        formValues.file || `${toSafeFileBase(formValues.id)}.xml`;

      // Build payload exactly as before, optionally including image field
      const savePayload = {
        ...formValues,
        file: proposedFileName,
        ...(typeof imageField !== "undefined" ? { image: imageField } : {}),
      };

      // 1) Create/update the roster entry with basic fields
      await saveRosterEntry(savePayload.file, savePayload);

      // 2) Resolve canonical file name (first-save case)
      resolvedFileName = await resolveFileNameById(formValues.file);
      if (resolvedFileName) {
        setInputValue(LOCO_DIALOG_SELECTORS.file, resolvedFileName);
      }

      // 3) Upload image if one is present
      if (fileToUpload) {
        await uploadRosterImage(savePayload.id, fileToUpload);
      }

      // 4) Save loco decoder
      const decoderSelect = query(LOCO_DIALOG_SELECTORS.decoderSelect)
      const chosenDecoder = getChosenDecoderFromSelect(decoderSelect);

      if (chosenDecoder) {
        await saveRosterDecoder(savePayload.id, chosenDecoder);
      }

      // 5) Save functions
      await saveFunctionsTab(savePayload);
    }, "Saving…");

    closeDialog();
    showToast("Saved");
    onSaved?.();
  } catch (err) {
    showToast(err?.message || "Save failed");
  }
}

/**
 * Delete handler: deletes by file name, then closes dialog and toasts.
 */
export async function handleDelete(onSaved) {
  const fileNameToDelete = getInputValue(LOCO_DIALOG_SELECTORS.file);

  if (!fileNameToDelete) {
    showToast("Missing file to delete");
    return;
  }

  try {
    await busyWhile(async () => {
      await deleteRoster(fileNameToDelete);
    }, "Deleting…");

    closeDialog();
    showToast("Deleted");
    onSaved?.();
  } catch (err) {
    showToast(err?.message || "Delete failed");
  }
}

/* ------------------------------ Upload XML ------------------------------ */

function ensureXmlPicker() {
  if (xmlPickerEl) return xmlPickerEl;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".xml,application/xml,text/xml";
  input.hidden = true;
  document.body.appendChild(input);

  input.addEventListener("change", async () => {
    const xmlFile = input.files?.[0];
    input.value = "";

    if (!xmlFile) return;

    const isXml =
      xmlFile.type === "application/xml" ||
      xmlFile.type === "text/xml" ||
      /\.xml$/i.test(xmlFile.name);
    if (!isXml) {
      showToast("Please select an XML file");
      return;
    }

    // --- build a safe filename (sanitize base, keep .xml) ---
    const originalName = xmlFile.name || "unnamed.xml";
    const base = originalName.replace(/\.[^.]+$/g, ""); // strip extension
    const safeBase = toSafeFileBase(base); // your helper
    const safeName = `${safeBase}.xml`;

    try {
      await busyWhile(async () => {
        await uploadRosterXml(xmlFile, safeName);
        showToast("XML uploaded");
        const records = await fetchRoster();
        refreshRoster();
      }, "Uploading XML…");
    } catch (err) {
      showToast(err?.message || "Upload failed");
    }
  });

  xmlPickerEl = input;
  return xmlPickerEl;
}

export function startXmlUploadFlow() {
  const picker = ensureXmlPicker();
  picker.click();
}
