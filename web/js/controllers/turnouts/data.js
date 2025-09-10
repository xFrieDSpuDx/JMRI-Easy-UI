// js/services/turnouts.js
import { jmriJsonCalls } from "../../services/api.js";
import { _panelsFileCache, storeUserConfig } from "../../services/jmri.js";
/**
 * normalise any of the common JMRI JSON shapes into a simple array,
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
 * @returns {Array<normalisedTurnout>}
 */
export function normaliseTurnouts(rawPayload) {
  let items = null;

  if (Array.isArray(rawPayload)) {
    items = rawPayload;
  } else if (rawPayload && typeof rawPayload === "object") {
    if (Array.isArray(rawPayload.data)) {
      items = rawPayload.data;
    } else if (Array.isArray(rawPayload.turnouts)) {
      items = rawPayload.turnouts;
    } else if (Array.isArray(rawPayload.list)) {
      items = rawPayload.list;
    } else if (Array.isArray(rawPayload.items)) {
      items = rawPayload.items;
    } else {
      // Dictionary keyed by name → use the values
      items = Object.values(rawPayload);
    }
  }

  return (items || []).map(toTurnoutRecord).filter(Boolean);
}

/**
 * Convert a single raw turnout object into a UI-friendly record while
 * preserving all original fields under `data`.
 *
 * Display rules (as requested):
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
 * @returns {normalisedTurnout | null}
 */
export function toTurnoutRecord(source) {
  if (!source) return null;

  // Preserve everything the server provided (prefer nested `data`, else the whole source)
  const rawData =
    source.data && typeof source.data === "object" ? source.data : {};

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

  // Typical JMRI constants (per your current logic):
  // Thrown = 4, Closed = 2. The `inverted` flag flips the interpretation.
  if ((rawState === 4 && !isInverted) || (rawState === 2 && isInverted)) {
    normalisedState = "Thrown";
    isThrown = true;
    isUnknown = false;
  } else if (
    (rawState === 2 && !isInverted) ||
    (rawState === 4 && isInverted)
  ) {
    normalisedState = "Closed";
    isClosed = true;
    isUnknown = false;
  } // else remains "Unknown"

  /** @type {normalisedTurnout} */
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
 * @param {{ systemName:string, userName?:string, comment?:string, inverted?:boolean }} input
 * @returns {Promise<object>} normalised turnout record
 */
export async function createTurnout(input) {
  const systemName = String(input.systemName || "").trim();
  if (!systemName) throw new Error("System Name is required");

  // Build the same shape you use for update (a plain object).
  const payload = {
    name: systemName,
    ...(input.userName != null ? { userName: input.userName } : {}),
    ...(input.comment  != null ? { comment:  input.comment }  : {}),
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

  const finalRaw = sentExtras
    ? await jmriJsonCalls("POST", path, payload)
    : created;

  await storeUserConfig(_panelsFileCache);

  return toTurnoutRecord(finalRaw);
}

/**
 * Update an existing turnout (JMRI: POST /json/turnout/:systemName).
 * Note: This does not rename the system name (JMRI typically treats name as immutable).
 * @param {string} systemName
 * @param {{ userName?:string, comment?:string, inverted?:boolean, state?:number }} fields
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
  const raw = await jmriJsonCalls(
    "POST",
    `/json/turnout/${encodeURIComponent(name)}`,
    payload
  );
  return toTurnoutRecord(raw);
}

/**
 * Delete a turnout (JMRI: DELETE /json/turnout/:systemName).
 * @param {string} systemName
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
 * Returns a summary { created: number[], failed: {address:number, message:string}[] }.
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
  const created = [];
  const failed = [];

  const base = Number(baseAddress);
  const turnoutCount = Math.max(1, Number(count) | 0);

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
