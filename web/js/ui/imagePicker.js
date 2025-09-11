// js/ui/imagePicker.js

/** The most recently selected image file (after optional downscaling). */
let selectedImageFile = null;

/** Last object URL used for the preview, so we can revoke it and avoid leaks. */
let lastPreviewObjectUrl = null;

/**
 * Downscale an image file to fit within given bounds while preserving aspect ratio.
 *
 * @param {File} file                 - Source image file.
 * @param {number} [maxWidth=1024]    - Max output width in pixels.
 * @param {number} [maxHeight=512]    - Max output height in pixels.
 * @param {number} [quality=0.8]      - JPEG quality (0–1).
 * @param {string} [mimeType="image/jpeg"] - Target MIME type.
 * @returns {Promise<File>}           - The original file or a new downscaled file.
 */
async function downscaleImageToBounds(
  file,
  maxWidth = 1024,
  maxHeight = 512,
  quality = 0.8,
  mimeType = "image/jpeg"
) {
  // Try to decode efficiently; fall back to returning the original file
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const { width, height } = bitmap;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  if (scale >= 1) return file; // already small enough

  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));

  // If toBlob failed, return the original file as a safe fallback
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const newName = `${baseName}.jpg`;
  return new File([blob], newName, { type: mimeType });
}

/**
 * Set the preview <img> element to display the given file (via object URL).
 *
 * @param {HTMLImageElement} imgEl - The preview image element.
 * @param {File} file              - The image file to preview.
 * @returns {void}
 */
function setPreviewImage(imgEl, file) {
  const url = URL.createObjectURL(file);
  if (lastPreviewObjectUrl) URL.revokeObjectURL(lastPreviewObjectUrl);
  lastPreviewObjectUrl = url;
  imgEl.src = url;
}

/**
 * Initialize a click/drag-drop image picker with live preview and optional callback.
 *
 * @param {object}   options
 * @param {string}   [options.wrapSel="#modalImageDrop"]   - Drop zone / clickable wrapper selector.
 * @param {string}   [options.imgSel="#modalRosterImage"]  - Preview <img> selector.
 * @param {string}   [options.inputSel="#modalImageInput"] - Hidden <input type="file"> selector.
 * @param {(file: File) => void} [options.onChange]        - Called with the chosen (possibly downscaled) File.
 * @returns {void}
 */
export function initImagePicker({
  wrapSel = "#modalImageDrop",
  imgSel = "#modalRosterImage",
  inputSel = "#modalImageInput",
  onChange,
} = {}) {
  const dropZoneEl = document.querySelector(wrapSel);
  const previewImgEl = document.querySelector(imgSel);
  const fileInputEl = document.querySelector(inputSel);
  if (!dropZoneEl || !previewImgEl || !fileInputEl) return;

  // Click to open file picker
  dropZoneEl.addEventListener("click", () => fileInputEl.click());

  // File input change
  fileInputEl.addEventListener("change", async () => {
    const picked = fileInputEl.files?.[0];
    if (!picked) return;

    const resized = await downscaleImageToBounds(picked);
    selectedImageFile = resized;
    setPreviewImage(previewImgEl, resized);

    // Reflect the (possibly resized) file back into the input
    const fileListTransfer = new DataTransfer();
    fileListTransfer.items.add(resized);
    fileInputEl.files = fileListTransfer.files;

    onChange?.(resized);
  });

  // Drag & drop
  let dragDepth = 0;

  dropZoneEl.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth += 1;
    dropZoneEl.classList.add("drag");
  });

  dropZoneEl.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  dropZoneEl.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropZoneEl.classList.remove("drag");
  });

  dropZoneEl.addEventListener("drop", async (event) => {
    event.preventDefault();
    dragDepth = 0;
    dropZoneEl.classList.remove("drag");

    const files = Array.from(event.dataTransfer?.files || []);
    const firstImage = files.find((foundFile) => foundFile.type.startsWith("image/"));
    if (!firstImage) return;

    const resized = await downscaleImageToBounds(firstImage);
    selectedImageFile = resized;
    setPreviewImage(previewImgEl, resized);

    // Reflect into the hidden input so form handlers can read it
    const fileListTransfer = new DataTransfer();
    fileListTransfer.items.add(resized);
    fileInputEl.files = fileListTransfer.files;

    onChange?.(resized);
  });
}

/**
 * Get the most recently chosen image file (after optional downscaling).
 *
 * @returns {File|null}
 */
export function getPickedImageFile() {
  return selectedImageFile;
}
