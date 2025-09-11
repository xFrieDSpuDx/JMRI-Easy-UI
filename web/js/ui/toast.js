// js/ui/toast.js

const TOAST_ID = "toast";
const TOAST_DIALOG_ID = "toastLayer";

let hideToastTimerId = 0;

/**
 * Look up the toast dialog and content nodes from the DOM.
 *
 * @returns {{ toastDialog: HTMLDialogElement|null, toastElement: HTMLElement|null }}
 */
function getToastNodes() {
  const toastDialog = /** @type {HTMLDialogElement|null} */ (document.getElementById(TOAST_DIALOG_ID));
  const toastElement = /** @type {HTMLElement|null} */ (document.getElementById(TOAST_ID));

  if (!toastDialog || !toastElement) {
    // Markup was not inserted in the page
    return { toastDialog: null, toastElement: null };
  }
  return { toastDialog, toastElement };
}

/**
 * Show a brief toast message above everything (even modal <dialog>s).
 * Visuals are fully controlled by CSS; JS just toggles classes & opens/closes the dialog.
 *
 * @param {string} message - Text to display inside the toast.
 * @param {number} [durationMs=2000] - Time on screen before hiding (ms).
 * @returns {void}
 */
export function showToast(message, durationMs = 2000) {
  const { toastDialog, toastElement } = getToastNodes();
  if (!toastDialog || !toastElement) return;

  toastElement.textContent = String(message ?? "");

  // Put the toast in the browser's top layer
  if (!toastDialog.open) toastDialog.show();

  // Show via CSS class
  toastElement.classList.add("show");

  clearTimeout(hideToastTimerId);
  hideToastTimerId = setTimeout(() => {
    toastElement.classList.remove("show");

    // Close the dialog after the CSS transition ends (keep in sync with your CSS)
    const TRANSITION_MS = 200;
    setTimeout(() => {
      if (toastDialog.open) toastDialog.close();
    }, TRANSITION_MS);
  }, Number.isFinite(durationMs) ? durationMs : 2000);
}
