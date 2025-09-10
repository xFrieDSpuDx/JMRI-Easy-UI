// js/controllers/roster/dialog/infoTab.js
import {
  readAddressFromTrack,
  writeAddressToTrack,
} from "../../../services/jmri.js";
import { LOCO_DIALOG_SELECTORS } from "../dialog.js";
import { preloadDecoderSelection, resetDecoderSelect } from "./decoderSelect.js";
import { busyWhile } from "../../../ui/busy.js";
import { showToast } from "../../../ui/toast.js";
import { query, setInputValue, setImageSource, buildRosterIconUrlForId } from "../../../ui/dom.js";

/* -------------------------- Public API: load -------------------------- */
/**
 * Populate the Info tab from a normalised record.
 * Keeps behavior identical to your working version.
 */
export function loadInfoTab(record, prefill) {
  const locoId = record?.id || record?.title || "";
  const dccAddress = record?.address || "";
  const roadName = record?.road || "";
  const locoNumber = record?.number || "";
  const locoModel = record?.model || "";
  const locoOwner = record?.owner || "";
  const fileName = record?.file || record?.data?.fileName || "";
  const imageSrc =
    record?.imageUrl + `&v=${Date.now()}` || buildRosterIconUrlForId(locoId);
  const dccDecoder = preloadDecoderSelection(query(LOCO_DIALOG_SELECTORS.decoderSelect), locoId);

  if (prefill) existingImageUrl = record?.imageUrl || "";
  else {
    existingImageUrl = locoId
      ? `/api/roster/icon?id=${encodeURIComponent(locoId)}`
      : record?.imageUrl || "";
  }

  setInputValue(LOCO_DIALOG_SELECTORS.id, locoId);
  setInputValue(LOCO_DIALOG_SELECTORS.dcc, dccAddress);
  setInputValue(LOCO_DIALOG_SELECTORS.road, roadName);
  setInputValue(LOCO_DIALOG_SELECTORS.number, locoNumber);
  setInputValue(LOCO_DIALOG_SELECTORS.model, locoModel);
  setInputValue(LOCO_DIALOG_SELECTORS.owner, locoOwner);
  setInputValue(LOCO_DIALOG_SELECTORS.file, fileName);
  setInputValue(LOCO_DIALOG_SELECTORS.imageUrl, imageSrc);
  setImageSource(LOCO_DIALOG_SELECTORS.imageEl, imageSrc);
}

/**
 * Clear Info tab fields (used for Create).
 */
export function resetInfoTab() {
  setInputValue(LOCO_DIALOG_SELECTORS.id, "");
  setInputValue(LOCO_DIALOG_SELECTORS.dcc, "");
  setInputValue(LOCO_DIALOG_SELECTORS.road, "");
  setInputValue(LOCO_DIALOG_SELECTORS.number, "");
  setInputValue(LOCO_DIALOG_SELECTORS.model, "");
  setInputValue(LOCO_DIALOG_SELECTORS.owner, "");
  setInputValue(LOCO_DIALOG_SELECTORS.file, "");
  setInputValue(LOCO_DIALOG_SELECTORS.imageUrl, "");
  setImageSource(LOCO_DIALOG_SELECTORS.imageEl, "");
  resetDecoderSelect(query(LOCO_DIALOG_SELECTORS.decoderSelect), "Read from Loco to find decoder...");
}

/* ----------------------- Public API: collect -------------------------- */
/**
 * Collect all Info tab values into a single object.
 */
export function collectInfoForm() {
  const id = query(LOCO_DIALOG_SELECTORS.id)?.value?.trim() || "";
  const dcc = query(LOCO_DIALOG_SELECTORS.dcc)?.value?.trim() || "";
  const road = query(LOCO_DIALOG_SELECTORS.road)?.value?.trim() || "";
  const number = query(LOCO_DIALOG_SELECTORS.number)?.value?.trim() || "";
  const model = query(LOCO_DIALOG_SELECTORS.model)?.value?.trim() || "";
  const owner = query(LOCO_DIALOG_SELECTORS.owner)?.value?.trim() || "";
  const file = query(LOCO_DIALOG_SELECTORS.file)?.value?.trim() || "";
  const imageUrl = query(LOCO_DIALOG_SELECTORS.imageUrl)?.value?.trim() || "";

  return { id, address: dcc, road, number, model, owner, file, imageUrl };
}

/* -------------------- Image selection & preview ----------------------- */
let pickedImageFile = null;
let existingImageUrl = "";

export function clearImageMemory() {
  pickedImageFile = null;
  existingImageUrl = "";
}
/**
 * Wire the image drop / picker once (idempotent).
 */
export function initInfoImagePicker() {
  const dropZoneEl = query(LOCO_DIALOG_SELECTORS.dropZone);
  const fileInputEl = query(LOCO_DIALOG_SELECTORS.fileInput);
  const imageEl = query(LOCO_DIALOG_SELECTORS.imageEl);
  if (!dropZoneEl || !fileInputEl || !imageEl) return;

  // Idempotent: clear existing listeners by cloning input (cheap & clean)
  fileInputEl.replaceWith(fileInputEl.cloneNode(true));
  const freshInputEl = query(LOCO_DIALOG_SELECTORS.fileInput);

  // Click to open file picker
  dropZoneEl.addEventListener("click", () => freshInputEl?.click());

  // Drag & drop hover states
  ["dragenter", "dragover"].forEach((event) =>
    dropZoneEl.addEventListener(event, (subEvent) => {
      subEvent.preventDefault();
      subEvent.stopPropagation();
      dropZoneEl.classList.add("drag");
    })
  );
  ["dragleave", "drop"].forEach((event) =>
    dropZoneEl.addEventListener(event, (subEvent) => {
      subEvent.preventDefault();
      subEvent.stopPropagation();
      dropZoneEl.classList.remove("drag");
    })
  );

  // File dropped
  dropZoneEl.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) previewPickedImageFile(file, imageEl);
  });

  // File chosen via input
  freshInputEl.addEventListener("change", () => {
    const file = freshInputEl.files?.[0];
    if (file) previewPickedImageFile(file, imageEl);
  });
}

function previewPickedImageFile(file, imageEl) {
  pickedImageFile = file;
  const objectUrl = URL.createObjectURL(file);
  imageEl.src = objectUrl;
  // (no revoke here; dialog lifecycle keeps it safe)
}

/** Return the file the user picked (or null). */
export function getPickedImageFile() {
  return pickedImageFile;
}

/** Return the current preview <img> src (for persistence decision). */
export function getExistingImageSrc() {
  return existingImageUrl || "";
}

/* ----------------------- Persistence decisions ------------------------ */

/** Convert a relative/absolute path to an absolute same-origin URL. */
function toAbsoluteSameOriginUrl(pathOrUrl) {
  try {
    return new URL(pathOrUrl, window.location.origin).toString();
  } catch {
    return "";
  }
}

/**
 * Fetch an image URL (e.g., the preview src) and wrap it as a File for upload.
 * Returns null if it can't be fetched. The filename comes from rosterId and blob mime.
 */
async function fetchUrlAsFile(imageUrl, rosterId) {
  if (!imageUrl) return null;
  const absoluteUrl = toAbsoluteSameOriginUrl(imageUrl);
  if (!absoluteUrl) return null;

  try {
    const res = await fetch(absoluteUrl, { credentials: "same-origin" });
    if (!res.ok) return null;

    const blob = await res.blob();
    const mime = blob.type || "image/jpeg";
    const ext =
      mime === "image/png"
        ? "png"
        : mime === "image/webp"
        ? "webp"
        : mime === "image/gif"
        ? "gif"
        : mime === "image/svg+xml"
        ? "svg"
        : "jpg";

    const safeId = (rosterId || "image").replace(/[^\w.-]+/g, "_");
    return new File([blob], `${safeId}.${ext}`, { type: mime });
  } catch {
    return null;
  }
}

/**
 * Decide how to persist the image on save.
 * - If a new file is picked: upload that file; omit image string
 * - Else if preview shows a non-blob URL: fetch+wrap and upload that; omit image string
 * - Else: no image → send image: "" to clear
 *
 * @param {Object} params
 * @param {File|null} params.pickedFile
 * @param {string} params.existingSrc
 * @param {string} params.rosterId
 * @returns {Promise<{fileToUpload: File|null, imageField: string|undefined}>}
 */
export async function decideImagePersistence({
  pickedFile,
  existingSrc,
  rosterId,
}) {
  // New file wins
  if (pickedFile) {
    return { fileToUpload: pickedFile, imageField: undefined };
  }

  const isBlobPreview = existingSrc.startsWith("blob:");
  if (existingSrc && !isBlobPreview) {
    const fileFromPreview = await fetchUrlAsFile(existingSrc, rosterId);
    if (fileFromPreview) {
      return { fileToUpload: fileFromPreview, imageField: undefined };
    }
    // Fallback: if fetch fails, send the string (optional; can return "" instead)
    return { fileToUpload: null, imageField: existingSrc };
  }

  // No image at all → clear
  return { fileToUpload: null, imageField: "" };
}

/* ----------------------- Basic record validation ---------------------- */

// Compatibility alias to minimize churn
export function getInfoTabSnapshot() {
  return collectInfoForm();
}

/* Read / Write from loco */
export async function onClickReadDcc() {
  try {
    await busyWhile(async () => {
      const address = await readAddressFromTrack();

      if (address != null && String(address).trim() !== "") {
        // Write the value
        setInputValue(LOCO_DIALOG_SELECTORS.dcc, String(address).trim());

        // Re-trigger live validation so Save button state updates
        const inputEl = query(LOCO_DIALOG_SELECTORS.dcc);
        inputEl?.dispatchEvent(new Event("input", { bubbles: true }));

        showToast("DCC address read");
      } else {
        showToast("No address detected");
      }
    }, "Reading DCC Address...");
  } catch (err) {
    showToast(err?.message || "Failed to read DCC address");
  }
}

export async function onClickWriteDcc() {
  try {
    await busyWhile(async () => {
      const address = collectInfoForm().address;
      await writeAddressToTrack(address, { mode: "service" });

      showToast("DCC address written");
    }, "Writing DCC Address...");
  } catch (err) {
    showToast(err?.message || "Failed to read DCC address");
  }
}
