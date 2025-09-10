// js/ui/toast.js

/** Root toast element */
const toastElement = document.getElementById("toast");

/** Timer id for hiding the toast after a delay */
let hideToastTimerId = 0;

/**
 * Show a brief toast message.
 *
 * @param {string} message      - Text to display inside the toast.
 * @param {number} durationMs   - How long to show the toast (milliseconds). Default: 2000ms.
 */
export function showToast(message, durationMs = 2000) {
  if (!toastElement) return;

  toastElement.textContent = message;
  toastElement.classList.add("show");

  // Reset any previous hide timer, then schedule a new one
  clearTimeout(hideToastTimerId);
  hideToastTimerId = setTimeout(() => {
    toastElement.classList.remove("show");
  }, durationMs);
}
