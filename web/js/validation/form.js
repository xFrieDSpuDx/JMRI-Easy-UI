// js/validation/form.js

/**
 * Create a normalized snapshot of a form’s current values.
 * - Handles inputs, textareas, selects (incl. multiple)
 * - Radios are grouped by name; value is the checked one (or "")
 * - Checkboxes use boolean checked
 * - Hidden and standard inputs included
 * - Skips elements with [data-dirty-ignore]
 * - By default ignores disabled fields; pass includeDisabled:true to include them
 */
export function snapshotForm(
  form,
  { trim = true, includeDisabled = false, includeFiles = false } = {}
) {
  const snapshot = {};
  if (!form) return snapshot;

  /** Prefer a stable key: name → id → auto */
  const keyFor = (el, index) => {
    if (el.name) return el.name;
    if (el.id) return `#${el.id}`;
    return `__field_${index}`;
  };

  // Track radio groups we’ve handled so we set one key per group
  const seenRadioGroups = new Set();

  const elements = Array.from(form.elements || []);
  elements.forEach((el, index) => {
    if (!el || el.matches?.("[data-dirty-ignore]")) return;
    if (!includeDisabled && el.disabled) return;

    const type = (el.type || "").toLowerCase();
    const tag = (el.tagName || "").toLowerCase();
    const key = keyFor(el, index);

    if (type === "radio") {
      if (!el.name) return; // ignore nameless radios
      if (seenRadioGroups.has(el.name)) return;
      seenRadioGroups.add(el.name);

      const checked = form.querySelector(
        `input[type="radio"][name="${CSS.escape(el.name)}"]:checked`
      );
      snapshot[el.name] = checked ? checked.value : "";
      return;
    }

    if (type === "checkbox") {
      snapshot[key] = !!el.checked;
      return;
    }

    if (tag === "select" && el.multiple) {
      const selected = Array.from(el.selectedOptions || []).map((o) => o.value);
      snapshot[key] = selected;
      return;
    }

    if (type === "file") {
      if (!includeFiles) return; // usually excluded from dirty compare
      const files = Array.from(el.files || []).map((f) => f.name);
      snapshot[key] = files;
      return;
    }

    // Default: string value
    let value = el.value ?? "";
    if (trim && typeof value === "string") value = value.trim();
    snapshot[key] = value;
  });

  return snapshot;
}

/**
 * Track whether a form is "dirty" (different from its baseline snapshot).
 * Calls onDirtyChange(dirty:boolean) on any change.
 *
 * Returns { isDirty, refresh, resetBaseline, detach, getSnapshot }.
 */
export function trackFormDirty({ form, onDirtyChange } = {}) {
  if (!form) {
    return {
      isDirty: () => false,
      refresh: () => {},
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

// Makes sure the file name is safe to save
export function toSafeFileBase(id) {
  return (
    String(id)
      .trim()
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unnamed"
  );
}