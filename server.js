// -------------------- SNAPPED ROUTE API (roads only, robust) --------------------
import fs from "fs";
import path from "path";
const PUBLIC_DIR = path.join(__dirname, "public");

const WAYPOINTS_PATH = path.join(PUBLIC_DIR, "waypoints.json");
let WAYPOINTS_RAW = [];
try {
  WAYPOINTS_RAW = JSON.parse(fs.readFileSync(WAYPOINTS_PATH, "utf8"));
} catch (e) {
  console.warn("No or invalid waypoints.json:", e.message);
  WAYPOINTS_RAW = [];
}

function isNum(n) { return typeof n === "number" && Number.isFinite(n); }

// Clean & validate waypoints
function sanitizeWaypoints(list) {
  const errs = [];
  const out = [];
  let lastKey = null;

  (list || []).forEach((w, idx) => {
    const name = (w && w.name) ? String(w.name) : `wp_${idx}`;
    const lat = w && (isNum(w.lat) ? w.lat : Number(w.lat));
    const lng = w && (isNum(w.lng) ? w.lng : Number(w.lng));

    if (!isNum(lat) || !isNum(lng)) {
      errs.push({ idx, name, reason: "Non-numeric lat/lng" });
      return;
    }
    // Basic sanity for LI area (rough box; adjust if needed)
    if (lat < 40 || lat > 41.5 || lng > -71 || lng < -74) {
      errs.push({ idx, name, reason: "Lat/lng out of expected bounds" });
      return;
    }

    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    // Drop exact duplicates in a row (can confuse OSRM)
    if (key === lastKey) return;
    lastKey = key;

    out.push({ name, lat, lng });
  });

  // Need at least two points
  if (out.length < 2) {
    errs.push({ idx: -1, name: "global", reason: "Fewer than 2 valid waypoints after sanitation" });
  }
  return { waypoints: out, errors: errs };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function concatLineStrings(lineStrings) {
  const allCoords = [];
  for (const ls of lineStrings) {
    if (!ls || ls.type !== "LineString" || !Array.isArray(ls.coordinates)) continue;
    if (allCoords.length && ls.coordinates.length) {
      const first = ls.coordinates[0];
      const last  = allCoords[allCoords.length - 1];
      if (first[0] === last[0] && first[1] === last[1]) {
        allCoords.push(...ls.coordinates.slice(1));
        continue;
      }
    }
    allCoords.push(...ls.coordinates);
  }
  return { type: "LineString", coordinates: allCoords };
}

// Fetch with retries/backoff (handles 429/5xx and transient network errors)
async function fetchWithRetry(url, { tries = 4, baseDelay = 400 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 12000); // 12s timeout per request
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(to);
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, i))); // backoff
  }
  throw lastErr;
}

async function osrmRouteChunk(coords) {
  // OSRM expects lng,lat; limit per request to ~100, but we use ~20 for safety
  const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(";");
  const urlStr = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`;
  const data = await fetchWithRetry(urlStr, { tries: 4, baseDelay: 500 });
  if (!data.routes || !data.routes[0] || !data.routes[0].geometry) {
    throw new Error("OSRM returned no geometry");
  }
  return data.routes[0].geometry; // GeoJSON LineString
}

let ROUTE_CACHE = { geojson: null, builtAt: 0, diag: null };

// Helper to rebuild route with strong diagnostics
async function buildSnappedRoute() {
  const startTs = Date.now();
  const diag = { startTs, errors: [], warnings: [], chunksTried: 0, chunksOk: 0 };

  const { waypoints, errors } = sanitizeWaypoints(WAYPOINTS_RAW);
  if (errors.length) diag.errors.push({ type: "sanity", details: errors });
  if (waypoints.length < 2) throw new Error("Not enough valid waypoints after sanitation");

  // Chunk the route (20 pts per chunk; overlap 1 point between chunks)
  const pts = waypoints.map(w => ({ lng: w.lng, lat: w.lat }));
  const chunks = chunk(pts, 20).map((c, i, arr) => (i > 0 ? [arr[i-1][arr[i-1].length - 1], ...c] : c));
  const lineStrings = [];

  diag.chunksTried = chunks.length;

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (c.length < 2) continue;
    try {
      const ls = await osrmRouteChunk(c);
      lineStrings.push(ls);
      diag.chunksOk++;
    } catch (e) {
      diag.errors.push({ type: "osrm", chunkIndex: i, message: e.message });
      // Skip this chunk but continue to try the rest (graceful degradation)
    }
  }

  if (lineStrings.length === 0) {
    throw new Error("All OSRM chunk requests failed");
  }

  const merged = concatLineStrings(lineStrings);
  const fc = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { name: "MIFD Santa Parade (Snapped to Roads)", source: "OSRM" },
      geometry: merged
    }]
  };

  ROUTE_CACHE = { geojson: fc, builtAt: Date.now(), diag: { ...diag, tookMs: Date.now() - startTs } };
  return fc;
}

// Non-caching debug endpoint to see what's going on
app.get("/api/route-debug", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    // Force rebuild (ignore cache)
    await buildSnappedRoute();
    res.json({ ok: true, diag: ROUTE_CACHE.diag, sample: ROUTE_CACHE.geojson?.features?.[0]?.geometry?.coordinates?.slice(0,5) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, diag: ROUTE_CACHE.diag });
  }
});

// Cached route endpoint for the viewer (fast path)
app.get("/api/route", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    if (!ROUTE_CACHE.geojson) {
      await buildSnappedRoute();
    }
    res.json(ROUTE_CACHE.geojson);
  } catch (e) {
    console.error("Snapped route build failed:", e.message);
    res.status(500).json({ error: "Failed to build snapped route.", reason: e.message });
  }
});
