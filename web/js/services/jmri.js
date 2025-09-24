// js/services/jmri.js
import { getJSON, postJSON, postForm, postMultipart } from "./api.js";

/* =====================================================================================
 * Constants (JMRI / DCC specifics)
 * ===================================================================================== */

/** CV register numbers used for address reads/writes. */
const cvRegister = {
  shortAddress: 1,
  longAddrMsb: 17,
  longAddrLsb: 18,
  config: 29, // CV29
};

/** Bit flags within CV29. */
const cv29Flags = {
  longAddressMode: 0x20, // bit 5
};

/** NMRA long address base for CV17. */
const cv17Base = 192;

/**
 * Resolve the roster file name for a given logical roster ID.
 *
 * @param {string} locoId
 * @returns {Promise<string|null>} Resolved file name (e.g., "ABC123.xml") or null.
 */
export async function resolveFileNameById(locoId) {
  const roster = await getRoster();
  const match = (roster || []).find((rosterEntry) => (rosterEntry?.id || "") === locoId);
  return match?.fileName || null;
}

/* =====================================================================================
 * Railroad / Roster
 * ===================================================================================== */

/**
 * Get the friendly name of the currently loaded JMRI railroad.
 * Falls back to "My Railroad" if unavailable.
 *
 * Endpoint: /json/railroad → usually: [{ type:'railroad', data:{ name:'...' } }]
 *
 * @returns {Promise<string>}
 */
export async function getRailroadName() {
  try {
    const payload = await getJSON("/json/railroad");
    const item = Array.isArray(payload) ? payload.find((x) => x && x.type === "railroad") : null;
    return item?.data?.name || "My Railroad";
  } catch {
    return "My Railroad";
  }
}

/**
 * Fetch the full roster list.
 *
 * Endpoint: /api/roster
 *
 * @param {{ fresh?: boolean }} [opts]
 * @returns {Promise<any>}
 */
export async function getRoster(opts = {}) {
  const fresh = !!opts.fresh;
  const url = fresh ? `/api/roster?t=${Date.now()}` : "/api/roster";
  return getJSON(url);
}

/**
 * Fetch saved decoder information for a roster ID.
 *
 * @param {string} rosterId
 * @returns {Promise<any>}
 */
export async function getDecoder(rosterId) {
  const url = `/api/roster/decoder?id=${encodeURIComponent(rosterId)}`;
  return getJSON(url);
}

/**
 * Delete a roster entry by file name (e.g., "ABC123.xml").
 *
 * Endpoint: POST /api/roster/delete (form: file=<fileName>)
 *
 * @param {string} fileName
 * @returns {Promise<any|string>}
 */
export async function deleteRoster(fileName) {
  const form = new URLSearchParams();
  form.set("file", fileName);
  return postForm("/api/roster/delete", form);
}

/**
 * Create or update a roster entry. The server decides add/update based on `file`.
 *
 * Endpoint: POST /api/roster/add
 *
 * @param {string} fileName
 * @param {{ id:string, address:string, road:string, number:string, owner:string, model:string, image?:string }} record
 * @returns {Promise<any|string>}
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

  return postForm("/api/roster/add", form);
}

/**
 * Create or update the loco decoder values.
 *
 * @param {string} rosterId
 * @param {{ family:string, model:string, manufacturer?:string, mfgId?:number, mfgName?:string, productId?:number, modelId?:string }} decoder
 * @returns {Promise<any|string>}
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
  if (mfgId !== null && typeof mfgId !== "undefined") form.append("mfgId", String(mfgId));
  if (productId !== null && typeof productId !== "undefined") form.append("productId", String(productId));
  if (mfgName !== null && typeof mfgName !== "undefined") form.append("mfgName", String(mfgName));
  if (modelId !== null && typeof modelId !== "undefined") form.append("modelId", String(modelId));

  return postForm("/api/roster/decoder/save", form);
}

/**
 * Upload/replace a roster image by logical ID (JMRI roster id, not file name).
 *
 * Endpoint: POST /api/roster/image?id=<id> (multipart: field "image")
 *
 * @param {string} id
 * @param {File} file
 * @returns {Promise<any|string>}
 */
export async function uploadRosterImage(id, file) {
  const formData = new FormData();
  formData.append("image", file, file.name);
  return postMultipart(`/api/roster/image?id=${encodeURIComponent(id)}`, formData);
}

/**
 * Upload a roster XML file (with optional safe filename override).
 *
 * @param {File} file
 * @param {string} filenameOverride
 * @returns {Promise<any|string>}
 */
export async function uploadRosterXml(file, filenameOverride) {
  const formData = new FormData();
  formData.append("file", file, filenameOverride);
  return postMultipart("/api/roster/add", formData);
}

/* =====================================================================================
 * Functions (F0–F28)
 * ===================================================================================== */

/**
 * Get functions for a given roster file (e.g., "ABC123.xml").
 *
 * Endpoint: /api/roster/fn/list?file=<file>
 *
 * @param {string} fileName
 * @returns {Promise<any>}
 */
export async function getFunctions(fileName) {
  return getJSON(`/api/roster/fn/list?file=${encodeURIComponent(fileName)}`);
}

/**
 * Save functions for a given roster file.
 *
 * Endpoint: POST /api/roster/fn/save
 * Form arrays: num[], label[], lockable[], img[], imgSel[]
 *
 * @param {string} fileName
 * @param {Array<{num:number, label:string, lockable:boolean, img?:string, imgSel?:string}>} items
 * @returns {Promise<any|string>}
 */
export async function saveFunctions(fileName, items) {
  const form = new URLSearchParams();
  form.set("file", fileName);

  for (const item of items) {
    form.append("num[]", String(item.num ?? ""));
    form.append("label[]", String(item.label ?? ""));
    form.append("lockable[]", item.lockable ? "true" : "false");
    form.append("img[]", String(item.img ?? ""));
    form.append("imgSel[]", String(item.imgSel ?? ""));
  }

  return postForm("/api/roster/fn/save", form);
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
 *
 * @returns {Promise<string>}
 */
export async function readAddressFromTrack() {
  const data = await getJSON("/api/jmri/read?list=1,17,18,29");

  // JMRI may return { ok, values:{...} } or just { ... } — normalise:
  const values = data?.values ?? data ?? {};

  const cv29 = Number(values[String(cvRegister.config)]);
  if (!Number.isFinite(cv29)) return "";

  const longMode = (cv29 & cv29Flags.longAddressMode) === cv29Flags.longAddressMode;

  if (longMode) {
    const msb17 = Number(values[String(cvRegister.longAddrMsb)]); // CV17
    const lsb18 = Number(values[String(cvRegister.longAddrLsb)]); // CV18
    if (!Number.isFinite(msb17) || !Number.isFinite(lsb18)) return "";
    const longAddress = 256 * (msb17 - cv17Base) + lsb18;
    return String(longAddress);
  }

  const cv1 = Number(values[String(cvRegister.shortAddress)]);
  return Number.isFinite(cv1) ? String(cv1) : "";
}

/* =====================================================================================
 * Write CVs (address programming) to track
 * ===================================================================================== */

/**
 * Ask the server to write the DCC address (server computes CV1/17/18/29).
 *
 * @param {number|string} newAddress  Desired DCC address (1..9999)
 * @param {{ mode?: "ops"|"service", currentAddress?: number, currentLong?: boolean }} [opts]
 * @returns {Promise<any>} Server response (expected shape: { ok:true, wrote:{...} }).
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
    const isLong = typeof opts.currentLong === "boolean" ? opts.currentLong : curr >= 128;
    if (!Number.isFinite(curr) || curr <= 0) {
      throw new Error("Ops mode requires { currentAddress, currentLong } to reach the decoder");
    }
    body.set("address", String(curr));
    body.set("long", String(!!isLong));
  }

  const res = await postForm("/api/jmri/writeAddress", body);
  if (!res || res.ok !== true) {
    throw new Error((res && res.message) || "Address write failed");
  }
  return res; // { ok:true, wrote:{ ... } }
}

/**
 * Low-level CV write helper.
 *
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
 * @param {{ mode?: "ops"|"service", address?: number, long?: boolean }} [opts]
 * @returns {Promise<void>}
 */
export async function writeCVs(valuesByCv, opts = {}) {
  const mode = opts.mode === "service" ? "service" : "ops";
  const cvNumbers = Object.keys(valuesByCv)
    .map(Number)
    .sort((left, right) => left - right);
  if (!cvNumbers.length) return;

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
  form.set("list", cvNumbers.join(","));
  for (const cvNumber of cvNumbers) {
    form.set(`v[${cvNumber}]`, String(valuesByCv[cvNumber]));
  }

  const result = await postForm("/api/jmri/write", form);
  if (result && result.ok === false) {
    throw new Error(result.message || "Write failed");
  }
}

/* =====================================================================================
 * Read Decoder from Programming Track
 * ===================================================================================== */

/**
 * Fetch the full decoder catalog known to the backend.
 *
 * @returns {Promise<any[]>}
 */
export async function getDecoderCatalog() {
  const response = await fetch("/api/decoder/identify?all=1"); // adjust if needed
  if (!response.ok) throw new Error("Failed to load decoder catalog");
  return response.json();
}

/**
 * Identify decoder from loco (read from track/ops).
 * dccAddress is optional; backend may auto-detect via current programmer.
 *
 * @param {{ dccAddress?: number|string }} [params]
 * @returns {Promise<any>} Identification payload.
 */
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
    } catch (error) {
      console.warn(error);
    }
    throw new Error(details || "Failed to read decoder");
  }
  return response.json();
}

/* =====================================================================================
 * JMRI Turnout Servlet Helpers
 * ===================================================================================== */

/**
 * Fetch the list of turnouts from JMRI.
 *
 * @returns {Promise<any[]>} Raw turnouts payload.
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
 * JMRI Lights Servlet Helpers
 * ===================================================================================== */

/**
 * Fetch the list of turnouts from JMRI.
 *
 * @returns {Promise<any[]>} Raw turnouts payload.
 * @throws {Error} If the endpoint cannot be loaded or returns no usable data.
 */
export async function getLights() {
  let payload = null;
  let lastError = null;

  try {
    payload = await getJSON("/api/lights");
    if (payload) {
      return payload;
    }
  } catch (error) {
    lastError = error;
  }

  // If we reach here, we didn't get usable data.
  throw lastError || new Error("No light data");
}

/* =====================================================================================
 * JMRI Stores Helpers
 * ===================================================================================== */

export let _panelsFileCache = null;

/**
 * Update the cached panels file name.
 *
 * @param {string} value
 * @returns {void}
 */
export function updatePanelsFileCache(value) {
  _panelsFileCache = value;
}

/**
 * Get the currently configured panels file info.
 *
 * @returns {Promise<any>}
 */
export async function getCurrentPanelsFile() {
  return getJSON("/api/store/user/file");
}

/**
 * Ask the server to store the current user configuration.
 *
 * @param {string} [fileName]
 * @returns {Promise<any|string>}
 */
export async function storeUserConfig(fileName) {
  const url = fileName ? `/api/store/user?file=${encodeURIComponent(fileName)}` : "/api/store/user";
  return postJSON(url);
}

/* =====================================================================================
 * JMRI Active Connection Helpers
 * ===================================================================================== */

/**
 * Get the list of available JMRI connections (with active flag).
 *
 * @returns {Promise<Array>} Connections payload.
 */
export async function getActiveConnection() {
  return getJSON("/api/connections");
}

/**
 * Select the active JMRI connection by system prefix.
 *
 * @param {string} connectionPrefix
 * @returns {Promise<any|string>}
 */
export async function setActiveConnection(connectionPrefix) {
  return postJSON(`/api/connections/select?systemPrefix=${connectionPrefix}`);
}
