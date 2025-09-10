// js/services/jmri.js
import { getJSON, postJSON, postForm, postMultipart } from "./api.js";

/* =====================================================================================
 * Constants (JMRI / DCC specifics)
 * ===================================================================================== */
const CV = {
  SHORT_ADDRESS: 1,
  LONG_ADDR_MSB: 17,
  LONG_ADDR_LSB: 18,
  CONFIG: 29, // CV29
};

const CV29_FLAGS = {
  LONG_ADDRESS_MODE: 0x20, // bit 5
};

const CV17_BASE = 192; // NMRA long address base for CV17

export async function resolveFileNameById(locoId) {
  const roster = await getRoster();
  const match = (roster || []).find((r) => (r?.id || "") === locoId);
  return match?.fileName || null;
}

/* =====================================================================================
 * Railroad / Roster
 * ===================================================================================== */

/**
 * Get the friendly name of the currently loaded JMRI railroad.
 * Falls back to "My Railroad" if unavailable.
 *
 * Endpoint: /json/railroad  → usually an array like [{ type: 'railroad', data: { name: '...' } }]
 */
export async function getRailroadName() {
  try {
    const payload = await getJSON("/json/railroad");

    // Prefer the item with type === 'railroad'
    const item = Array.isArray(payload)
      ? payload.find((x) => x && x.type === "railroad")
      : null;

    return item?.data?.name || "My Railroad";
  } catch {
    return "My Railroad";
  }
}

/**
 * Fetch the full roster list.
 *
 * Endpoint: /api/roster
 */
export async function getRoster(opts = {}) {
  const fresh = !!opts.fresh;
  const url = fresh ? `/api/roster?t=${Date.now()}` : "/api/roster";
  return await getJSON(url);
}

export async function getDecoder(rosterId) {
  const url = `/api/roster/decoder?id=${encodeURIComponent(rosterId)}`;
  return await getJSON(url);
}

/**
 * Delete a roster entry by file name (e.g., "ABC123.xml").
 *
 * Endpoint: POST /api/roster/delete (form: file=<fileName>)
 */
export async function deleteRoster(fileName) {
  const form = new URLSearchParams();
  form.set("file", fileName);
  return await postForm("/api/roster/delete", form);
}

/**
 * Create or update a roster entry.
 * The server decides add/update based on `file`.
 *
 * Endpoint: POST /api/roster/add
 */
export async function saveRosterEntry(fileName, record) {
  const form = new URLSearchParams();
  form.set("file", fileName);
  form.set("id", record.id || "");
  form.set("address", record.address || "");
  form.set("road", record.road || "");
  form.set("number", record.number || "");
  form.set("owner", record.owner || "");
  form.set("model", record.model || "");

  // Include only if caller decided an image string should be sent
  if (Object.prototype.hasOwnProperty.call(record, "image")) {
    form.set("image", record.image || "");
  }

  return await postForm("/api/roster/add", form);
}

/**
 * Create or update the loco decoder values
 *
 */
export async function saveRosterDecoder(
  rosterId,
  { family, model, manufacturer, mfgId, mfgName, productId, modelId }
) {
  if (!rosterId) throw new Error("Missing rosterId");
  if (!family || !model) throw new Error("Missing family/model");

  const form = new URLSearchParams({
    id: rosterId,
    family,
    model,
  });

  if (manufacturer) form.append("manufacturer", manufacturer);
  if (mfgId != null) form.append("mfgId", String(mfgId));
  if (productId != null) form.append("productId", String(productId));
  if (mfgName != null) form.append("mfgName", String(mfgName));
  if (modelId != null) form.append("modelId", String(modelId));

  return await postForm("/api/roster/decoder/save", form);
}
/**
 * Upload/replace a roster image by logical ID (JMRI roster id, not file name).
 *
 * Endpoint: POST /api/roster/image?id=<id> (multipart: field "image")
 */
export async function uploadRosterImage(id, file) {
  const formData = new FormData();
  formData.append("image", file, file.name); // if JMRI expects "image"
  return await postMultipart(
    `/api/roster/image?id=${encodeURIComponent(id)}`,
    formData
  );
}

export async function uploadRosterXml(file, filenameOverride) {
  const formData = new FormData();
  formData.append("file", file, filenameOverride);
  return await postMultipart("/api/roster/add", formData);
}

/* =====================================================================================
 * Functions (F0–F28)
 * ===================================================================================== */

/**
 * Get functions for a given roster file (e.g., "ABC123.xml").
 *
 * Endpoint: /api/roster/fn/list?file=<file>
 */
export async function getFunctions(fileName) {
  return await getJSON(
    `/api/roster/fn/list?file=${encodeURIComponent(fileName)}`
  );
}

/**
 * Save functions for a given roster file.
 *
 * Endpoint: POST /api/roster/fn/save
 * Form arrays: num[], label[], lockable[], img[], imgSel[]
 */
export async function saveFunctions(fileName, items) {
  const form = new URLSearchParams();
  form.set("file", fileName);

  for (const it of items) {
    form.append("num[]", String(it.num ?? ""));
    form.append("label[]", String(it.label ?? ""));
    form.append("lockable[]", it.lockable ? "true" : "false");
    form.append("img[]", String(it.img ?? ""));
    form.append("imgSel[]", String(it.imgSel ?? ""));
  }

  return await postForm("/api/roster/fn/save", form);
}

/* =====================================================================================
 * CV Read Helpers (address detection)
 * ===================================================================================== */

/**
 * Read CVs required to derive the decoder address and return the address as a string.
 * Returns "" if the address cannot be determined.
 *
 * Reads: CV1 (short), CV17/18 (long components), CV29 (mode flag)
 *
 * Endpoint: /api/jmri/read?list=1,17,18,29
 */
export async function readAddressFromTrack() {
  const data = await getJSON("/api/jmri/read?list=1,17,18,29");

  // JMRI may return { ok, values:{...} } or just { ... } — normalise:
  const values = data?.values ?? data ?? {};

  const cv29 = Number(values[String(CV.CONFIG)]);
  if (!Number.isFinite(cv29)) return "";

  const longMode =
    (cv29 & CV29_FLAGS.LONG_ADDRESS_MODE) === CV29_FLAGS.LONG_ADDRESS_MODE;

  if (longMode) {
    const msb17 = Number(values[String(CV.LONG_ADDR_MSB)]); // CV17
    const lsb18 = Number(values[String(CV.LONG_ADDR_LSB)]); // CV18
    if (!Number.isFinite(msb17) || !Number.isFinite(lsb18)) return "";
    const longAddress = 256 * (msb17 - CV17_BASE) + lsb18; // ← missing '+' fixed
    return String(longAddress);
  } else {
    const cv1 = Number(values[String(CV.SHORT_ADDRESS)]);
    return Number.isFinite(cv1) ? String(cv1) : "";
  }
}

/* =====================================================================================
 * Write CVs (address programming) to track
 * ===================================================================================== */

/**
 * Ask the server to write the DCC address (server computes CV1/17/18/29).
 * @param {number|string} newAddress  Desired DCC address (1..9999)
 * @param {{ mode?: 'ops'|'service', currentAddress?: number, currentLong?: boolean }} opts
 */
export async function writeAddressToTrack(newAddress, opts = {}) {
  const mode = opts.mode === "ops" ? "ops" : "service"; // default service
  const addr = Number(newAddress);
  if (!Number.isFinite(addr) || addr <= 0 || addr > 9999) {
    throw new Error("Invalid DCC address");
  }

  const body = new URLSearchParams();
  body.set("mode", mode);
  body.set("newAddress", String(addr));

  // For ops mode, server needs the CURRENT address/long to reach the loco.
  if (mode === "ops") {
    const curr = Number(opts.currentAddress);
    const isLong =
      typeof opts.currentLong === "boolean" ? opts.currentLong : curr >= 128;
    if (!Number.isFinite(curr) || curr <= 0) {
      throw new Error(
        "Ops mode requires { currentAddress, currentLong } to reach the decoder"
      );
    }
    body.set("address", String(curr));
    body.set("long", String(!!isLong));
  }

  // Use the existing POST helper; URLSearchParams sets the correct content-type
  const res = await postForm("/api/jmri/writeAddress", body);
  if (!res || res.ok !== true) {
    throw new Error((res && res.message) || "Address write failed");
  }
  return res; // { ok:true, wrote:{ ... } }
}

/**
 * Low-level CV write helper.
 * Backend contract (proposed):
 *   POST /api/jmri/write
 *   Form fields:
 *     mode = "ops" | "service"
 *     list = "cv,cv,cv"          (e.g., "1,29" or "17,18,29")
 *     v[cv] = value              (e.g., v[29]=38)
 *
 * Response: { ok: true } or throws on error.
 *
 * @param {Record<number, number>} valuesByCv
 * @param {{ mode?: 'ops'|'service' }} [opts]
 */
export async function writeCVs(valuesByCv, opts = {}) {
  const mode = opts.mode === "service" ? "service" : "ops";
  const cvs = Object.keys(valuesByCv)
    .map(Number)
    .sort((a, b) => a - b);
  if (!cvs.length) return;

  const form = new URLSearchParams();
  form.set("mode", mode);
  if (mode === "ops") {
    const addr = Number(opts.address);
    const isLong = !!opts.long;
    if (!Number.isFinite(addr) || addr <= 0) {
      throw new Error("Ops-mode requires a valid 'address'");
    }
    form.set("address", String(addr));
    form.set("long", String(isLong));
  }
  form.set("list", cvs.join(","));
  for (const cv of cvs) {
    form.set(`v[${cv}]`, String(valuesByCv[cv]));
  }

  // Adjust this path if your backend differs.
  const result = await postForm("/api/jmri/write", form);
  if (result && result.ok === false) {
    throw new Error(result.message || "Write failed");
  }
}

/* =====================================================================================
 * Read Decoder from Programming Track
 * ===================================================================================== */

// ---- Decoder catalog: all decoders known to JMRI ----
export async function getDecoderCatalog() {
  const response = await fetch("/api/decoder/identify?all=1"); // adjust if needed
  if (!response.ok) throw new Error("Failed to load decoder catalog");
  // Expecting an array like:
  // [{ id, name, manufacturer, family }, ...]
  return response.json();
}

// ---- Identify decoder from loco (read from track/ops) ----
// dccAddress is optional; your backend may auto-detect via current programmer.
export async function identifyDecoderFromLoco({ dccAddress } = {}) {
  const response = await fetch("/api/decoder/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dccAddress }),
  });
  if (!response.ok) {
    let details = "";
    try {
      details = await response.text();
    } catch {}
    throw new Error(details || "Failed to read decoder");
  }
  // Expect array of candidates: [{ id, name, manufacturer, family }, ...]
  return response.json();
}

/* =====================================================================================
 * JMRI Turnout Servlet Helpers
 * ===================================================================================== */

/**
 * Fetch the list of turnouts from JMRI and normalise the response.
 *
 * @returns {Promise<Array<normalisedTurnout>>} A list of normalised turnout records.
 * @throws {Error} If the endpoint cannot be loaded or returns no usable data.
 */
export async function getTurnouts() {
  let payload = null;
  let lastError = null;

  try {
    payload = await getJSON("/json/turnouts");
    if (payload) {
      return payload;
    }
  } catch (error) {
    lastError = error;
  }

  // If we reach here, we didn't get usable data.
  throw lastError || new Error("No turnout data");
}

/* =====================================================================================
 * JMRI Stores Helpers
 * ===================================================================================== */
export let _panelsFileCache = null;

export function updatePanelsFileCache(value) {
  _panelsFileCache = value;
}

export async function getCurrentPanelsFile() {
  return await getJSON("/api/store/user/file");
}

export async function storeUserConfig(fileName) {
  const url = fileName
    ? `/api/store/user?file=${encodeURIComponent(fileName)}`
    : "/api/store/user";

  return await postJSON(url);
}

/* =====================================================================================
 * JMRI Active Connection Helpers
 * ===================================================================================== */
export async function getActiveConnection() {
  return await getJSON("/api/connections");
}

export async function setActiveConnection(connectionPrefix) {
  return await postJSON(`/api/connections/select?systemPrefix=${connectionPrefix}`);
}