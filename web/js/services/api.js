// js/services/api.js

/** Base origin for same-origin requests (JMRI web server). */
const baseOrigin = window.location.origin;

/**
 * Resolve a path ("/api/...") or relative URL against the current origin.
 *
 * @param {string} pathOrUrl - E.g. "/api/roster" or "json/railroad".
 * @returns {string} Absolute URL string.
 */
function resolveUrl(pathOrUrl) {
  return new URL(pathOrUrl, baseOrigin).toString();
}

/**
 * Parse a fetch Response as JSON if available, otherwise as text.
 *
 * - If the server returns `Content-Type: application/json` and an empty body,
 *   we treat it as a successful boolean `true` (useful for DELETEs).
 *
 * @param {Response} response
 * @returns {Promise<any|string>} Parsed payload.
 */
async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const isJson = /application\/json/i.test(contentType);

  // Read the body once to avoid double-consumption
  const text = await response.text();

  // Treat empty JSON body as success - useful for delete responses
  if (isJson && (text.length === 0 || text === null)) return true;

  // Original behavior
  return isJson ? JSON.parse(text) : text;
}

/**
 * Throw a useful error if the response is not OK.
 *
 * @param {Response} response
 * @throws {Error} If response.ok is false.
 * @returns {void}
 */
function assertResponseOk(response) {
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}

/**
 * GET JSON (or text) from the server using same-origin credentials.
 *
 * @param {string} path - Request path, e.g. "/json/railroad".
 * @returns {Promise<any|string>} Parsed JSON or text.
 */
export async function getJSON(path) {
  const response = await fetch(resolveUrl(path), {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  assertResponseOk(response);
  return parseResponse(response);
}

/**
 * POST JSON (or text) to the server using same-origin credentials.
 *
 * @param {string} path - Request path, e.g. "/json/railroad".
 * @returns {Promise<any|string>} Parsed JSON or text.
 */
export async function postJSON(path) {
  const response = await fetch(resolveUrl(path), {
    credentials: "same-origin",
    method: "POST",
    headers: { Accept: "application/json" },
  });
  assertResponseOk(response);
  return parseResponse(response);
}

/**
 * POST an x-www-form-urlencoded body and parse JSON or text response.
 *
 * @param {string} path - Request path, e.g. "/api/roster/add".
 * @param {URLSearchParams|string} body - Form body.
 * @param {"POST"|"PUT"|"PATCH"} [method="POST"] - HTTP method to use.
 * @returns {Promise<any|string>} Parsed JSON or text.
 */
export async function postForm(path, body, method = "POST") {
  const response = await fetch(resolveUrl(path), {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  });
  assertResponseOk(response);
  return parseResponse(response);
}

/**
 * POST multipart/form-data (for file uploads) and parse JSON or text response.
 *
 * @param {string} path - Request path, e.g. "/api/roster/image?id=...".
 * @param {FormData} formData - Multipart body.
 * @returns {Promise<any|string>} Parsed JSON or text.
 */
export async function postMultipart(path, formData) {
  const response = await fetch(resolveUrl(path), {
    method: "POST",
    credentials: "same-origin",
    body: formData,
  });
  assertResponseOk(response);
  return parseResponse(response);
}

/**
 * Low-level JSON fetch helper for the JMRI JSON servlet.
 *
 * Sends a body under `{ data: ... }` per the JMRI JSON protocol.
 *
 * @param {"GET"|"PUT"|"POST"|"DELETE"} method - HTTP method.
 * @param {string} path - Absolute path (e.g., "/json/turnout/IT123").
 * @param {object} [data] - Payload to send under the `data` key.
 * @returns {Promise<any|string>} Parsed JSON or text.
 */
export async function jmriJsonCalls(method, path, data) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify({ data }) : undefined,
  });
  assertResponseOk(response);
  return parseResponse(response);
}
