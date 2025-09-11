// js/services/turnouts.js

import { jmriJsonCalls } from "../../services/api.js";
import { _panelsFileCache as panelsFileCache, storeUserConfig } from "../../services/jmri.js";

/**
 * @typedef {object} NormalisedTurnout
 * @property {string} title
 * @property {string} address
 * @property {string} comment
 * @property {number} [state]
 * @property {"Closed"|"Thrown"|"Unknown"} normalisedState
 * @property {boolean} isThrown
 * @property {boolean} isClosed
 * @property {boolean} isUnknown
 * @property {boolean} inverted
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
 * - { turnouts: [...] }
 * - { list: [...] }
 * - { items: [...] }
 * - { <name>: {...}, <name>: {...}, ... }  (dictionary keyed by name)
 *
 * @param {unknown} rawPayload
 * @returns {Array<NormalisedTurnout>}
 */
export function normaliseTurnouts(rawPayload) {
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
    } else if (Array.isArray(rawPayload.turnouts)) {
      // @ts-ignore
      items = rawPayload.turnouts;
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

  return (items || []).map(toTurnoutRecord).filter(Boolean);
}

/**
 * Convert a single raw turnout object into a UI-friendly record while
 * preserving all original fields under `data`.
 *
 * Display rules:
 * - title   = userName
 * - address = name
 * - comment = comment (if present)
 * - state flags derived from `state`, considering `inverted`
 *
 * JMRI numeric state notes (typical):
 *   Thrown = 4, Closed = 2
 *   Some layouts treat 0 as Unknown; `inverted` flips the meaning.
 *
 * @param {any} source - Raw turnout item as returned by JMRI.
 * @returns {NormalisedTurnout | null}
 */
export function toTurnoutRecord(source) {
  if (!source) return null;

  // Preserve everything the server provided (prefer nested `data`, else the whole source)
  const rawData = (source.data && typeof source.data === "object" ? source.data : source) || {};

  // Core fields used for display
  const name = rawData.name || "";
  const userName = rawData.userName || "";
  const comment = rawData.comment || "";
  const isInverted = Boolean(rawData.inverted);

  // State → "Closed" / "Thrown" / "Unknown"
  const rawState = rawData.state;
  let normalisedState = "Unknown";
  let isThrown = false;
  let isClosed = false;
  let isUnknown = true;

  // Typical JMRI constants:
  // Thrown = 4, Closed = 2. The `inverted` flag flips the interpretation.
  if ((rawState === 4 && !isInverted) || (rawState === 2 && isInverted)) {
    normalisedState = "Thrown";
    isThrown = true;
    isUnknown = false;
  } else if ((rawState === 2 && !isInverted) || (rawState === 4 && isInverted)) {
    normalisedState = "Closed";
    isClosed = true;
    isUnknown = false;
  }

  /** @type {NormalisedTurnout} */
  const record = {
    // Display fields
    title: userName,
    address: name,
    comment,

    // State
    state: rawState,
    normalisedState,
    isThrown,
    isClosed,
    isUnknown,
    inverted: isInverted,

    // IDs we may need later
    name,
    userName,

    // Original payload
    data: rawData,
  };

  return record;
}

/**
 * Create a new turnout (JMRI: PUT /json/turnout/:systemName).
 *
 * @param {{ systemName:string, userName?:string, comment?:string, inverted?:boolean }} input
 * @returns {Promise<NormalisedTurnout>} Normalised turnout record.
 */
export async function createTurnout(input) {
  const systemName = String(input.systemName || "").trim();
  if (!systemName) throw new Error("System Name is required");

  // Build payload; include only non-nullish fields.
  const payload = {
    name: systemName,
    ...(input.userName != null ? { userName: input.userName } : {}),
    ...(input.comment != null ? { comment: input.comment } : {}),
    ...(input.inverted != null ? { inverted: !!input.inverted } : {}),
  };

  const path = `/json/turnout/${encodeURIComponent(systemName)}`;

  // 1) Create with PUT (some JMRI versions ignore extras here)
  const created = await jmriJsonCalls("PUT", path, payload);

  // 2) If we sent any extras, apply them with a POST so userName sticks
  const sentExtras =
    Object.prototype.hasOwnProperty.call(payload, "userName") ||
    Object.prototype.hasOwnProperty.call(payload, "comment") ||
    Object.prototype.hasOwnProperty.call(payload, "inverted");

  const finalRaw = sentExtras ? await jmriJsonCalls("POST", path, payload) : created;

  await storeUserConfig(panelsFileCache);

  return toTurnoutRecord(finalRaw);
}

/**
 * Update an existing turnout (JMRI: POST /json/turnout/:systemName).
 * Note: This does not rename the system name (JMRI typically treats name as immutable).
 *
 * @param {string} systemName
 * @param {{ userName?:string, comment?:string, inverted?:boolean, state?:number }} fields
 * @returns {Promise<NormalisedTurnout | null>} Updated normalised record.
 */
export async function updateTurnout(systemName, fields) {
  const name = String(systemName || "").trim();
  if (!name) throw new Error("System Name is required");

  const payload = {
    name,
    ...(fields.userName != null ? { userName: fields.userName } : {}),
    ...(fields.comment != null ? { comment: fields.comment } : {}),
    ...(fields.inverted != null ? { inverted: !!fields.inverted } : {}),
    ...(fields.state != null ? { state: fields.state } : {}),
  };

  const raw = await jmriJsonCalls("POST", `/json/turnout/${encodeURIComponent(name)}`, payload);
  return toTurnoutRecord(raw);
}

/**
 * Delete a turnout (JMRI: DELETE /json/turnout/:systemName).
 *
 * @param {string} systemName
 * @returns {Promise<void>}
 */
export async function deleteTurnout(systemName) {
  const name = String(systemName || "").trim();
  if (!name) throw new Error("System Name is required");
  await jmriJsonCalls("DELETE", `/json/turnout/${encodeURIComponent(name)}`);
}

/**
 * Batch-create N turnouts with sequential DCC addresses.
 * For each created turnout:
 *   - systemName = `${prefix}${base + index}`
 *   - userName   = `${baseUserName} ${base + index}` if baseUserName provided
 *   - comment/inverted copied through
 *   - optional state applied via updateTurnout (same as single-create flow)
 *
 * @param {object} params
 * @param {string} params.prefix
 * @param {number|string} params.baseAddress
 * @param {number|string} params.count
 * @param {string} [params.baseUserName]
 * @param {string} [params.comment]
 * @param {boolean} [params.inverted]
 * @param {number} [params.desiredStateRaw]
 * @returns {Promise<{ created: number[], failed: Array<{address:number, message:string}> }>}
 */
export async function batchCreateTurnouts({
  prefix,
  baseAddress,
  count,
  baseUserName,
  comment,
  inverted,
  desiredStateRaw,
}) {
  /** @type {number[]} */
  const created = [];
  /** @type {Array<{address:number, message:string}>} */
  const failed = [];

  const base = Number(baseAddress);
  const turnoutCount = Math.max(1, Math.trunc(Number(count) || 0));

  for (let index = 0; index < turnoutCount; index++) {
    const address = base + index;
    const systemName = `${prefix}${address}`;
    const userName = baseUserName ? `${baseUserName} ${address}` : undefined;

    try {
      await createTurnout({ systemName, userName, comment, inverted });
      if (desiredStateRaw != null) {
        await updateTurnout(systemName, { state: desiredStateRaw });
      }
      created.push(address);
    } catch (err) {
      failed.push({ address, message: err?.message || "create failed" });
    }
  }

  return { created, failed };
}
