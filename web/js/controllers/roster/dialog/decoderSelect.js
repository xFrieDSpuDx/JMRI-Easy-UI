import { identifyDecoderFromLoco, getDecoder } from "../../../services/jmri.js";
import { showToast } from "../../../ui/toast.js";
import { busyWhile } from "../../../ui/busy.js";

/* =========================================================
 * Primary actions
 * ========================================================= */

/**
 * Handle click on “Read from Loco”.
 * - Reads the decoder from the programming track.
 * - Populates the select with unique candidates + variants.
 * - Updates placeholder to “N Options Found...”.
 * - Tries to auto-select the saved/“preferred” decoder (if any).
 *
 * @param {HTMLSelectElement} selectElement - The <select> element to populate.
 * @returns {Promise<void>} A promise that resolves after the UI is updated.
 */
export async function onClickReadDccChip(selectElement) {
  try {
    await busyWhile(async () => {
      const dccChipList = await identifyDecoderFromLoco();

      // Use any preferred selection captured by preload (if present)
      const preferred = {
        family: (selectElement?.dataset?.preferredFamily || "").trim(),
        model: (selectElement?.dataset?.preferredModel || "").trim(),
      };

      populateDecoderSelectWithDccChipList(selectElement, dccChipList, preferred);
    }, "Reading DCC Decoder...");
  } catch (err) {
    // If you have a toast util in scope; otherwise remove this
    showToast?.(err?.message || "Failed to read DCC decoder");
  }
}

/**
 * Preload the decoder selection when the dialog opens.
 * - Clears the select and shows a neutral placeholder.
 * - Attempts to load the saved decoder for this roster entry.
 * - If found, inserts it as a single option, selects it,
 *   and stores “preferred” family/model on the select so
 *   onClickReadDccChip can auto-select it later.
 *
 * @param {HTMLSelectElement} selectElement - The <select> to initialize.
 * @param {string} rosterId - The roster entry ID to fetch a saved decoder for.
 * @returns {Promise<boolean>} True if a saved decoder was added; otherwise false.
 */
export async function preloadDecoderSelection(selectElement, rosterId) {
  if (!selectElement || !rosterId) return false;

  // Always start with an empty select + neutral placeholder
  resetDecoderSelect(selectElement, "Read from Loco to find decoder...");

  // Try to load the saved decoder from your backend
  let decoderResponse;
  try {
    decoderResponse = await getDecoder(rosterId);
  } catch {
    return false; // keep neutral placeholder
  }

  const saved = decoderResponse?.decoder;
  if (!saved) return false;

  // Attach modelId (if identify payload present)
  saved.modelId = decoderResponse?.identify?.modelId;

  const manufacturerName = (saved.manufacturer || "").trim();
  const familyName = (saved.family || "").trim();
  const modelName = (saved.model || "").trim();

  // Nothing meaningful to add
  if (!manufacturerName && !familyName && !modelName) return false;

  // Add a single option for the saved decoder
  updatePlaceholderCount(selectElement, 1);
  const savedOption = createDecoderOptionElement({
    manufacturer: manufacturerName,
    family: familyName,
    model: modelName,
    isVariant: false,
    mfgId: saved.manufacturerId,
    mfgName: saved.manufacturer,
    productId: saved.productId,
    modelId: saved.modelId,
    value: "saved", // explicit value
  });

  selectElement.appendChild(savedOption);
  savedOption.selected = true;
  selectElement.disabled = false;

  // Stash “preferred” so the read flow can auto-select later
  selectElement.dataset.preferredFamily = familyName;
  selectElement.dataset.preferredModel = modelName;

  return true;
}

/* =========================
 * Normalization utilities
 * ========================= */

/**
 * Collapse internal whitespace and trim ends.
 *
 * @param {unknown} value - Any input to normalize into a clean string.
 * @returns {string} A trimmed, single-spaced string.
 */
function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a case-insensitive, stable key for de-duplicating by manufacturer+family+model.
 *
 * @param {string} manufacturer - The manufacturer name.
 * @param {string} family - The decoder family name.
 * @param {string} model - The model name.
 * @returns {string} A normalized dedupe key.
 */
function makeOptionKey(manufacturer, family, model) {
  return [
    cleanText(manufacturer).toLowerCase(),
    cleanText(family).toLowerCase(),
    cleanText(model).toLowerCase(),
  ].join("|");
}

/* =========================================
 * Build flat, duplicate-free option metadata
 * ========================================= */

/**
 * From `dccChipList`, build a flat array of unique options:
 *  - one for the candidate
 *  - one for each variant (model from the variant string, same family as candidate)
 * Duplicates are removed by (manufacturer, family, model), case-insensitive.
 *
 * @param {object} dccChipList - The identify payload containing candidates and identify info.
 * @param {Array<object>} dccChipList.candidates - Candidate decoder items.
 * @param {object} dccChipList.identify - The identify block (ids and names).
 * @returns {Array<object>} Array of unique option metadata objects.
 */
function buildDecoderOptionMetadataFromDccChipList(dccChipList) {
  const uniqueOptionMetadataList = [];
  const seenKeys = new Set();

  const candidates = Array.isArray(dccChipList?.candidates) ? dccChipList.candidates : [];
  const identifiedValues = dccChipList?.identify ?? {};

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i] || {};

    const manufacturerName = cleanText(candidate.manufacturer);
    const familyName = cleanText(candidate.family);
    const candidateModelName = cleanText(candidate.model);

    // ---- Candidate option ---------------------------------
    const candidateKey = makeOptionKey(manufacturerName, familyName, candidateModelName);
    if (!seenKeys.has(candidateKey)) {
      seenKeys.add(candidateKey);
      uniqueOptionMetadataList.push({
        label: [manufacturerName, familyName, candidateModelName].filter(Boolean).join(" — "),
        manufacturer: manufacturerName,
        family: familyName,
        model: candidateModelName,
        mfgId: identifiedValues.mfgId,
        mfgName: identifiedValues.mfgName,
        productId: identifiedValues.productId,
        modelId: identifiedValues.modelId,
        isVariant: false,
      });
    }

    // ---- Variant options ----------------------------------
    const variants = Array.isArray(candidate.variants) ? candidate.variants : [];
    for (let variantIndex = 0; variantIndex < variants.length; variantIndex++) {
      const variantModelName = cleanText(variants[variantIndex]);
      if (!variantModelName) continue;

      const variantKey = makeOptionKey(manufacturerName, familyName, variantModelName);
      if (seenKeys.has(variantKey)) continue; // skip duplicates globally

      seenKeys.add(variantKey);
      uniqueOptionMetadataList.push({
        label: [manufacturerName, familyName, variantModelName].filter(Boolean).join(" — "),
        manufacturer: manufacturerName,
        family: familyName,
        model: variantModelName,
        mfgId: identifiedValues.mfgId,
        mfgName: identifiedValues.mfgName,
        productId: identifiedValues.productId,
        modelId: identifiedValues.modelId,
        isVariant: true,
      });
    }
  }

  return uniqueOptionMetadataList;
}

/* ======================================
 * Create DOM nodes for the <select> box
 * ====================================== */

/**
 * Create a DocumentFragment containing:
 *  - placeholder: “N Options Found...”
 *  - an <option> for each unique candidate/variant
 *
 * @param {Array<object>} optionMetadataList - Flat list of unique option metadata.
 * @returns {DocumentFragment} A fragment ready to append into a <select>.
 */
function createOptionsFragmentForDecoderSelect(optionMetadataList) {
  const fragment = document.createDocumentFragment();

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.disabled = true;
  placeholderOption.selected = true;
  placeholderOption.textContent = `${optionMetadataList.length} Options Found...`;
  fragment.appendChild(placeholderOption);

  optionMetadataList.forEach((meta, index) => {
    const option = createDecoderOptionElement({
      ...meta,
      value: String(index), // arbitrary UI value; payload is in data-*
    });
    fragment.appendChild(option);
  });

  return fragment;
}

/**
 * Clear and populate a <select> element from dccChipList (duplicates removed).
 * Optionally provide {family, model} to auto-select that choice if present.
 *
 * @param {HTMLSelectElement} selectElement - The target <select> element.
 * @param {object} dccChipList - Identify payload containing candidates and identify info.
 * @param {{family?: string, model?: string}} [preferred] - Preferred family/model to auto-select.
 * @returns {Array<object>} The flattened, unique option metadata array.
 */
function populateDecoderSelectWithDccChipList(
  selectElement,
  dccChipList,
  preferred // { family?: string, model?: string }
) {
  const uniqueOptionMetadataList = buildDecoderOptionMetadataFromDccChipList(dccChipList);
  const fragment = createOptionsFragmentForDecoderSelect(uniqueOptionMetadataList);

  selectElement.innerHTML = "";
  selectElement.appendChild(fragment);
  selectElement.disabled = false;

  // Try to auto-select a preferred family/model if provided
  if (preferred && (preferred.family || preferred.model)) {
    selectOptionByFamilyModel(selectElement, preferred.family, preferred.model);
  }

  return uniqueOptionMetadataList;
}

/**
 * Get the chosen decoder data from the select.
 *
 * @param {HTMLSelectElement} selectElement - The <select> element to read.
 * @returns {null|{ family: string, model: string, manufacturer: string, isVariant: boolean, mfgId?: string, productId?: string, mfgName?: string, modelId?: string }} The chosen decoder payload, or null if none selected.
 */
export function getChosenDecoderFromSelect(selectElement) {
  const chosen = selectElement.selectedOptions?.[0];
  if (!chosen || !chosen.value) return null;

  const mfgId = chosen?.dataset?.mfgId ?? undefined;
  const productId = chosen?.dataset?.productId ?? undefined;
  const mfgName = chosen?.dataset?.mfgName ?? undefined;
  const modelId = chosen?.dataset?.modelId ?? undefined;

  return {
    family: chosen.dataset.family || "",
    model: chosen.dataset.model || "",
    manufacturer: chosen.dataset.manufacturer || "",
    isVariant: chosen.dataset.isVariant === "true",
    mfgId,
    productId,
    mfgName,
    modelId,
  };
}

/* ---------------------------
 * Helper functions (local)
 * --------------------------- */

/**
 * Remove all options and insert a placeholder row.
 *
 * @param {HTMLSelectElement} selectElement - The select element to reset.
 * @param {string} placeholderText - Placeholder text to display.
 * @returns {void}
 */
export function resetDecoderSelect(selectElement, placeholderText) {
  selectElement.innerHTML = "";
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.dataset.placeholder = "true";
  placeholderOption.disabled = true;
  placeholderOption.selected = true;
  placeholderOption.textContent = placeholderText;
  selectElement.appendChild(placeholderOption);
  selectElement.disabled = false; // keep enabled so the UI feels responsive
}

/**
 * Update the placeholder text to “N Options Found...”.
 *
 * @param {HTMLSelectElement} selectElement - The select element containing the placeholder option.
 * @param {number} count - The number of options found.
 * @returns {void}
 */
function updatePlaceholderCount(selectElement, count) {
  const placeholder = selectElement.querySelector('option[data-placeholder="true"]');
  if (placeholder) {
    placeholder.textContent = `${count} Options Found...`;
  }
}

/**
 * Create a single <option> element carrying all the decoder metadata.
 *
 * @param {object} params - The option configuration.
 * @param {string} [params.manufacturer] - Manufacturer name.
 * @param {string} [params.family] - Family name.
 * @param {string} [params.model] - Model name.
 * @param {boolean} [params.isVariant=false] - Whether this entry is a variant.
 * @param {string|number} [params.mfgId] - Manufacturer ID.
 * @param {string|number} [params.productId] - Product ID.
 * @param {string} [params.mfgName] - Manufacturer display name.
 * @param {string|number} [params.modelId] - Model ID.
 * @param {string} [params.value="opt"] - The <option> value attribute.
 * @returns {HTMLOptionElement} The populated option element.
 */
function createDecoderOptionElement({
  manufacturer = "",
  family = "",
  model = "",
  isVariant = false,
  mfgId,
  productId,
  mfgName,
  modelId,
  value = "opt",
}) {
  const option = document.createElement("option");
  option.value = value; // UI value; rely on data-* for payload
  option.textContent = [manufacturer, family, model].filter(Boolean).join(" — ") || "Saved Decoder";

  // Attach payload for later save
  option.dataset.manufacturer = manufacturer;
  option.dataset.family = family;
  option.dataset.model = model;
  option.dataset.isVariant = String(!!isVariant);
  if (mfgId !== null && mfgId !== undefined) option.dataset.mfgId = String(mfgId);
  if (productId !== null && productId !== undefined) option.dataset.productId = String(productId);
  if (mfgName !== null && mfgName !== undefined) option.dataset.mfgName = String(mfgName);
  if (modelId !== null && modelId !== undefined) option.dataset.modelId = String(modelId);

  return option;
}

/**
 * Select the first option that matches family+model (case-insensitive).
 *
 * @param {HTMLSelectElement} selectElement - The select element to search within.
 * @param {string} [family] - Family name to match (optional).
 * @param {string} [model] - Model name to match (optional).
 * @returns {boolean} True if a matching option was selected; otherwise false.
 */
function selectOptionByFamilyModel(selectElement, family, model) {
  const targetFamily = (family || "").toLowerCase().trim();
  const targetModel = (model || "").toLowerCase().trim();
  for (const opt of selectElement.options) {
    if (!opt.value) continue; // skip placeholder
    const optFamily = (opt.dataset.family || "").toLowerCase();
    const optModel = (opt.dataset.model || "").toLowerCase();
    if (
      (targetFamily ? optFamily === targetFamily : true) &&
      (targetModel ? optModel === targetModel : true)
    ) {
      opt.selected = true;
      return true;
    }
  }
  return false;
}
