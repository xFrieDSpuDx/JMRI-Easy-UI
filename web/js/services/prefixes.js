// js/services/prefixes.js
// Fetch and cache JMRI connection prefixes for a bean type.

/** In-memory cache keyed by bean type (e.g., "turnout"). */
const prefixCache = new Map();

/**
 * Fetch JMRI connection prefixes for a given bean type and cache the result.
 *
 * @param {"turnout"|"sensor"|"light"} [type="turnout"] - JMRI bean type.
 * @returns {Promise<Array<{type:string, systemPrefix:string, systemNamePrefix:string, connectionName:string}>>}
 */
export async function getPrefixes(type = "turnout") {
  const key = String(type);
  if (prefixCache.has(key)) return prefixCache.get(key);

  const response = await fetch(`/api/jmri/prefix?type=${encodeURIComponent(type)}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Prefix fetch failed: ${response.status}`);

  const payload = await response.json();
  prefixCache.set(key, payload);
  return payload;
}
