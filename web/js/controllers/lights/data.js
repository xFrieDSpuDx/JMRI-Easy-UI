// js/services/lights.js

import { jmriJsonCalls } from "../../services/api.js";
import { _panelsFileCache as panelsFileCache, storeUserConfig } from "../../services/jmri.js";

/**
 * @typedef {object} NormalisedLight
 * @property {string} title
 * @property {string} address
 * @property {string} comment
 * @property {number} [state]
 * @property {"On"|"Off"|"Unknown"} normalisedState
 * @property {boolean} isOff
 * @property {boolean} isOn
 * @property {boolean} isUnknown
 * @property {string} name
 * @property {string} userName
 * @property {Record<string, any>} data
 */

/**
 * Normalise any of the common JMRI JSON shapes into a simple array,
 * then map each entry to a view-friendly structure.
 *
 * Shapes seen in the wild:
 * - Array of items
 * - { data: [...] }
 * - { lights: [...] }
 * - { list: [...] }
 * - { items: [...] }
 * - { <name>: {...}, <name>: {...}, ... }  (dictionary keyed by name)
 *
 * @param {unknown} rawPayload
 * @returns {Array<NormalisedLight>}
 */
export function normaliseLights(rawPayload) {
  /** @type {any[] | null} */
  let items = null;

  if (Array.isArray(rawPayload)) {
    items = rawPayload;
  } else if (rawPayload && typeof rawPayload === "object") {
    // @ts-ignore - narrow at runtime
    if (Array.isArray(rawPayload.data)) {
      // @ts-ignore
      items = rawPayload.data;
      // @ts-ignore
    } else if (Array.isArray(rawPayload.lights)) {
      // @ts-ignore
      items = rawPayload.lights;
      // @ts-ignore
    } else if (Array.isArray(rawPayload.list)) {
      // @ts-ignore
      items = rawPayload.list;
      // @ts-ignore
    } else if (Array.isArray(rawPayload.items)) {
      // @ts-ignore
      items = rawPayload.items;
    } else {
      // Dictionary keyed by name → use the values
      // @ts-ignore
      items = Object.values(rawPayload);
    }
  }

  return (items || []).map(toLightRecord).filter(Boolean);
}

/**
 * Convert a single raw light object into a UI-friendly record while
 * preserving all original fields under `data`.
 *
 * Display rules:
 * - title   = userName
 * - address = name
 * - comment = comment (if present)
 * - state flags derived from `state`
 *
 * JMRI numeric state notes (typical):
 *   Off = 4, On = 2
 *   Some layouts treat 0 as Unknown.
 *
 * @param {any} source - Raw light item as returned by JMRI.
 * @returns {NormalisedLight | null}
 */
export function toLightRecord(source) {
  if (!source) return null;

  // Preserve everything the server provided (prefer nested `data`, else the whole source)
  const rawData = (source.data && typeof source.data === "object" ? source.data : source) || {};

  // Core fields used for display
  const name = rawData.name || "";
  const userName = rawData.userName || "";
  const comment = rawData.comment || "";

  // State → "On" / "Off" / "Unknown"
  const rawState = rawData.state;
  let normalisedState = "Unknown";
  let isOff = false;
  let isOn = false;
  let isUnknown = true;

  // Typical JMRI constants:
  // Off = 4, On = 2.
  if (rawState === 4) {
    normalisedState = "Off";
    isOff = true;
    isUnknown = false;
  } else if (rawState === 2) {
    normalisedState = "On";
    isOn = true;
    isUnknown = false;
  }

  /** @type {NormalisedLight} */
  const record = {
    // Display fields
    title: userName,
    address: name,
    comment,

    // State
    state: rawState,
    normalisedState,
    isOff,
    isOn,
    isUnknown,

    // IDs we may need later
    name,
    userName,

    // Original payload
    data: rawData,
  };

  return record;
}

/**
 * Create a new light (JMRI: PUT /json/light/:systemName).
 *
 * @param {{ systemName:string, userName?:string, comment?:string }} input
 * @returns {Promise<NormalisedLight>} Normalised light record.
 */
export async function createLight(input) {
  const systemName = String(input.systemName || "").trim();
  if (!systemName) throw new Error("System Name is required");

  // Build payload; include only non-nullish fields.
  const payload = {
    name: systemName,
    ...(input.userName != null ? { userName: input.userName } : {}),
    ...(input.comment != null ? { comment: input.comment } : {}),
  };

  const path = `/json/light/${encodeURIComponent(systemName)}`;

  // 1) Create with PUT (some JMRI versions ignore extras here)
  const created = await jmriJsonCalls("PUT", path, payload);

  // 2) If we sent any extras, apply them with a POST so userName sticks
  const sentExtras =
    Object.prototype.hasOwnProperty.call(payload, "userName") ||
    Object.prototype.hasOwnProperty.call(payload, "comment");

  const finalRaw = sentExtras ? await jmriJsonCalls("POST", path, payload) : created;

  await storeUserConfig(panelsFileCache);

  return toLightRecord(finalRaw);
}

/**
 * Update an existing light (JMRI: POST /json/light/:systemName).
 * Note: This does not rename the system name (JMRI typically treats name as immutable).
 *
 * @param {string} systemName
 * @param {{ userName?:string, comment?:string, state?:number }} fields
 * @returns {Promise<NormalisedLight | null>} Updated normalised record.
 */
export async function updateLight(systemName, fields) {
  const name = String(systemName || "").trim();
  if (!name) throw new Error("System Name is required");

  const payload = {
    name,
    ...(fields.userName != null ? { userName: fields.userName } : {}),
    ...(fields.comment != null ? { comment: fields.comment } : {}),
    ...(fields.state != null ? { state: fields.state } : {}),
  };

  const raw = await jmriJsonCalls("POST", `/json/light/${encodeURIComponent(name)}`, payload);
  return toLightRecord(raw);
}

/**
 * Delete a light (JMRI: DELETE /json/light/:systemName).
 *
 * @param {string} systemName
 * @returns {Promise<void>}
 */
export async function deleteLight(systemName) {
  const name = String(systemName || "").trim();
  if (!name) throw new Error("System Name is required");
  await jmriJsonCalls("DELETE", `/api/lights/${encodeURIComponent(name)}`);
}