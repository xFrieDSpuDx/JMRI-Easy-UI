// js/services/api.js

/** Base origin for same-origin requests (JMRI web server). */
const BASE_ORIGIN = window.location.origin;

/**
 * Resolve a path ("/api/...") or relative URL against the current origin.
 * @param {string} pathOrUrl - E.g. "/api/roster" or "json/railroad"
 * @returns {string} Absolute URL string
 */
function resolveUrl(pathOrUrl) {
  return new URL(pathOrUrl, BASE_ORIGIN).toString();
}

/**
 * Parse a fetch Response as JSON if available, otherwise as text.
 * @param {Response} response
 * @returns {Promise<any|string>}
 */
async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const isJson = /application\/json/i.test(contentType);

  // Read the body once to avoid double-consumption
  const text = await response.text();

  // Treat empty body as success - Needed for delete responses
  if (isJson && (text.length === 0 || text == null)) return true;

  // Original behavior
  return isJson ? JSON.parse(text) : text;
}


/**
 * Throw a useful error if the response is not OK.
 * @param {Response} response
 * @throws {Error}
 */
function assertOk(response) {
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}

/**
 * GET JSON (or text) from the server using same-origin credentials.
 * @param {string} path - Request path, e.g. "/json/railroad"
 * @returns {Promise<any|string>} Parsed JSON or text
 */
export async function getJSON(path) {
  const response = await fetch(resolveUrl(path), {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  assertOk(response);
  return parseResponse(response);
}

/**
 * POST JSON (or text) from the server using same-origin credentials.
 * @param {string} path - Request path, e.g. "/json/railroad"
 * @returns {Promise<any|string>} Parsed JSON or text
 */
export async function postJSON(path) {
  const response = await fetch(resolveUrl(path), {
    credentials: "same-origin",
    method: "POST",
    headers: { Accept: "application/json" },
  });
  assertOk(response);
  return parseResponse(response);
}

/**
 * POST an x-www-form-urlencoded body and parse JSON or text response.
 * @param {string} path - Request path, e.g. "/api/roster/add"
 * @param {URLSearchParams|string} body - Form body
 * @returns {Promise<any|string>} Parsed JSON or text
 */
export async function postForm(path, body, method = "POST") {
  const response = await fetch(resolveUrl(path), {
    method: method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  });
  assertOk(response);
  return parseResponse(response);
}

/**
 * POST multipart/form-data (for file uploads) and parse JSON or text response.
 * @param {string} path - Request path, e.g. "/api/roster/image?id=..."
 * @param {FormData} formData - Multipart body
 * @returns {Promise<any|string>} Parsed JSON or text
 */
export async function postMultipart(path, formData) {
  const response = await fetch(resolveUrl(path), {
    method: "POST",
    credentials: "same-origin",
    body: formData,
  });
  assertOk(response);
  return parseResponse(response);
}

/**
 * Low-level JSON fetch helper for the JMRI JSON servlet.
 * @param {"GET"|"PUT"|"POST"|"DELETE"} method
 * @param {string} path e.g. /json/turnout/IT123
 * @param {object} [data] body goes under { data: {...} } per JMRI JSON protocol
 */
export async function jmriJsonCalls(method, path, data) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify({ data }) : undefined,
  });
  assertOk(response);
  return parseResponse(response);
}