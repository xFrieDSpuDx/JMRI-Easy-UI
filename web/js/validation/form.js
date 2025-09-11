// js/validation/form.js

/**
 * Create a normalized snapshot of a form’s current values.
 * - Handles inputs, textareas, selects (incl. multiple)
 * - Radios are grouped by name; value is the checked one (or "")
 * - Checkboxes use boolean checked
 * - Hidden and standard inputs included
 * - Skips elements with [data-dirty-ignore]
 * - By default ignores disabled fields; pass includeDisabled:true to include them
 *
 * @param {HTMLFormElement} form - The form element to snapshot.
 * @param {{ trim?: boolean, includeDisabled?: boolean, includeFiles?: boolean }} [options]
 *   - trim: Trim string values (default true)
 *   - includeDisabled: Include disabled fields (default false)
 *   - includeFiles: Include file inputs (as file names) (default false)
 * @returns {Record<string, unknown>} A plain object of field values keyed by name/id.
 */
export function snapshotForm(
  form,
  { trim = true, includeDisabled = false, includeFiles = false } = {}
) {
  const snapshot = {};
  if (!form) return snapshot;

  /* Prefer a stable key: name → id → auto */
  const keyFor = (element, index) => {
    if (element.name) return element.name;
    if (element.id) return `#${element.id}`;
    return `__field_${index}`;
  };

  // Track radio groups we’ve handled so we set one key per group
  const seenRadioGroups = new Set();

  const elements = Array.from(form.elements || []);
  elements.forEach((element, index) => {
    if (!element || element.matches?.("[data-dirty-ignore]")) return;
    if (!includeDisabled && element.disabled) return;

    const type = (element.type || "").toLowerCase();
    const tag = (element.tagName || "").toLowerCase();
    const key = keyFor(element, index);

    if (type === "radio") {
      if (!element.name) return; // ignore nameless radios
      if (seenRadioGroups.has(element.name)) return;
      seenRadioGroups.add(element.name);

      const checked = form.querySelector(
        `input[type="radio"][name="${CSS.escape(element.name)}"]:checked`
      );
      snapshot[element.name] = checked ? checked.value : "";
      return;
    }

    if (type === "checkbox") {
      snapshot[key] = !!element.checked;
      return;
    }

    if (tag === "select" && element.multiple) {
      const selectedValues = Array.from(element.selectedOptions || []).map(
        (optionElement) => optionElement.value
      );
      snapshot[key] = selectedValues;
      return;
    }

    if (type === "file") {
      if (!includeFiles) return; // usually excluded from dirty compare
      const fileNames = Array.from(element.files || []).map((fileItem) => fileItem.name);
      snapshot[key] = fileNames;
      return;
    }

    // Default: string value
    let value = element.value ?? "";
    if (trim && typeof value === "string") value = value.trim();
    snapshot[key] = value;
  });

  return snapshot;
}

/**
 * Track whether a form is "dirty" (different from its baseline snapshot).
 * Calls onDirtyChange(dirty:boolean) whenever the dirty state changes.
 *
 * @param {{ form: HTMLFormElement, onDirtyChange?: (dirty: boolean) => void }} params
 * @returns {{
 *   isDirty: () => boolean,
 *   refresh: () => boolean,
 *   resetBaseline: () => void,
 *   detach: () => void,
 *   getSnapshot: () => Record<string, unknown>
 * }}
 */
export function trackFormDirty({ form, onDirtyChange } = {}) {
  if (!form) {
    return {
      isDirty: () => false,
      refresh: () => false,
      resetBaseline: () => {},
      detach: () => {},
      getSnapshot: () => ({}),
    };
  }

  let baseline = snapshotForm(form);
  let lastDirty = false;

  const computeDirty = () => {
    const current = snapshotForm(form);
    const dirty = JSON.stringify(current) !== JSON.stringify(baseline);
    if (dirty !== lastDirty) {
      lastDirty = dirty;
      onDirtyChange?.(dirty);
    }
    return dirty;
  };

  const handler = () => computeDirty();

  // initial eval + listeners
  computeDirty();
  form.addEventListener("input", handler);
  form.addEventListener("change", handler);

  return {
    isDirty: () => lastDirty,
    refresh: () => computeDirty(),
    resetBaseline: () => {
      baseline = snapshotForm(form);
      computeDirty();
    },
    detach: () => {
      form.removeEventListener("input", handler);
      form.removeEventListener("change", handler);
    },
    getSnapshot: () => snapshotForm(form),
  };
}

/**
 * Convert an arbitrary string into a safe file base (no extension),
 * preserving letters, numbers, underscores, hyphens, and dots.
 *
 * @param {string} id - Source identifier to sanitize.
 * @returns {string} A safe, non-empty filename base (e.g., "unnamed" if empty).
 */
export function toSafeFileBase(id) {
  return (
    String(id)
      .trim()
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unnamed"
  );
}
