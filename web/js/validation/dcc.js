// js/validation/dcc.js
// Reusable DCC address validation + UI helpers

/* ===================== Public API ===================== */
/** Shared, canonical DCC address rules */
export const DCC_RULES_REQUIRED = Object.freeze({
  required: true,
  digitsOnly: true,
  maxDigits: 4,
  min: 1,
  max: 9999,
});

export const DCC_RULES_OPTIONAL = Object.freeze({
  required: false,
  digitsOnly: true,
  maxDigits: 4,
  min: 1,
  max: 9999,
});

/**
 * Validate a DCC address string against simple rules.
 * @param {string} raw - user input (any string)
 * @param {object} rules
 * @param {boolean} [rules.required=true]  - whether a value is mandatory
 * @param {boolean} [rules.digitsOnly=true]- restrict to 0–9
 * @param {number}  [rules.maxDigits=4]    - max number of digits
 * @param {number}  [rules.min=1]          - min numeric value (if present)
 * @param {number}  [rules.max=9999]       - max numeric value (if present)
 * @returns {string|null} error message or null if valid
 */
export function getDccAddressError(raw, rules = {}) {
  const {
    required = true,
    digitsOnly = true,
    maxDigits = 4,
    min = 1,
    max = 9999,
  } = rules;

  const value = String(raw ?? "").trim();

  if (required && !value) return "DCC Address is required";
  if (!required && !raw) return null;

  if (digitsOnly && !/^\d+$/.test(value)) return "Use digits only (0-9)";
  if (maxDigits && value.length > maxDigits) return `Max ${maxDigits} digits`;

  const num = Number(value);
  if (Number.isNaN(num)) return "DCC Address must be numeric";
  if (num < min || num > max)
    return `DCC Address must be between ${min} and ${max}`;

  return null;
}

/**
 * Ensure an inline error element exists *after* the input (returns it).
 * @param {HTMLInputElement} input
 * @param {string} errorId
 * @param {string} [className="fn-error"]
 * @returns {HTMLElement}
 */
export function ensureInlineErrorAfter(input, errorId, className = "fn-error") {
  let el = document.getElementById(errorId);
  if (!el) {
    el = document.createElement("div");
    el.id = errorId;
    el.className = className;
    el.setAttribute("role", "alert");
    el.setAttribute("aria-live", "polite");
    input.insertAdjacentElement("afterend", el);
  }
  return el;
}

/** Boolean convenience */
export function isDccAddressValid(value, rules = DCC_RULES_REQUIRED) {
  return getDccAddressError(value, rules) == null;
}

/**
 * Apply useful numeric attributes to an input (UX polish).
 * @param {HTMLInputElement} input
 * @param {number} [maxDigits=4]
 */
export function applyNumericInputAttributes(input, maxDigits = 4) {
  if (!input) return;
  input.setAttribute("inputmode", "numeric");
  input.setAttribute("pattern", "\\d*");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("maxlength", String(maxDigits));
}

/**
 * Render validation state to UI (aria-invalid, inline message, disable save).
 * @param {object} opts
 * @param {HTMLInputElement} opts.input
 * @param {HTMLElement}      [opts.errorEl]
 * @param {HTMLButtonElement}[opts.saveButton]
 * @param {HTMLButtonElement}[opts.writeDccButton]
 * @param {object}           [opts.rules]
 * @param {boolean}          [opts.disableSaveWhenInvalid=true]
 * @returns {boolean} true if valid, false otherwise
 */
export function renderDccValidation({
  input,
  errorEl,
  saveButton,
  writeDccButton,
  rules = {},
  disableSaveWhenInvalid = true,
}) {
  if (!input) return true;

  const msg = getDccAddressError(input.value, rules);
  if (errorEl) errorEl.textContent = msg || "";
  input.setAttribute("aria-invalid", msg ? "true" : "false");

  if (saveButton && disableSaveWhenInvalid) {
    saveButton.disabled = !!msg;
    if (writeDccButton) writeDccButton.disabled = !!msg;
  }

  return !msg;
}

/**
 * Attach live validation to an input (and run once immediately).
 * @param {object} opts
 * @param {HTMLInputElement}  opts.input
 * @param {HTMLButtonElement} [opts.saveButton]
 * @param {object}            [opts.rules]
 * @param {string}            [opts.errorId="dccAddressError"]
 * @param {boolean}           [opts.disableSaveWhenInvalid=true]
 * @returns {() => void} detach function
 */
export function setupLiveDccValidation({
  input,
  saveButton,
  writeDccButton,
  rules = {},
  errorId = "dccAddressError",
  disableSaveWhenInvalid = true,
}) {
  if (!input) return () => {};

  applyNumericInputAttributes(input, rules.maxDigits ?? 4);
  const errorEl = ensureInlineErrorAfter(input, errorId);

  const onInput = () =>
    renderDccValidation({
      input,
      errorEl,
      saveButton,
      writeDccButton,
      rules,
      disableSaveWhenInvalid,
    });

  // initial + live
  onInput();
  input.addEventListener("input", onInput);

  // detach
  return () => input.removeEventListener("input", onInput);
}
