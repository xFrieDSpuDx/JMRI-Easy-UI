// js/services/prefixes.js
// Fetch and cache JMRI connection prefixes for a bean type.

const cache = new Map();

/**
 * @param {"turnout"|"sensor"|"light"} type
 * @returns {Promise<Array<{type:string,systemPrefix:string,systemNamePrefix:string,connectionName:string}>>}
 */
export async function getPrefixes(type = "turnout") {
  const key = String(type);
  if (cache.has(key)) return cache.get(key);

  const res = await fetch(`/api/jmri/prefix?type=${encodeURIComponent(type)}`, {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`Prefix fetch failed: ${res.status}`);
  const json = await res.json();
  cache.set(key, json);
  return json;
}
