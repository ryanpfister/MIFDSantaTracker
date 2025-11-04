// -------------------- STATIC ROUTE API (no OSRM, no waypoints) --------------------
import fs from "fs";
import path from "path";

const PUBLIC_DIR = path.join(__dirname, "public");
const ROUTE_PATH = path.join(PUBLIC_DIR, "route.geojson");

let ROUTE_CACHE = null;
let ROUTE_MTIME = 0;

function nocache(res) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
}

function loadRouteOrThrow() {
  const stat = fs.statSync(ROUTE_PATH);
  if (!stat.isFile()) throw new Error("route.geojson not found");
  const mtime = stat.mtimeMs;
  if (!ROUTE_CACHE || mtime !== ROUTE_MTIME) {
    const raw = fs.readFileSync(ROUTE_PATH, "utf8");
    const geo = JSON.parse(raw);
    // Accept a Feature or FeatureCollection with a LineString(s)
    const fc = (geo.type === "FeatureCollection")
      ? geo
      : { type: "FeatureCollection", features: [geo] };

    const hasLine = fc.features.some(f => f?.geometry?.type === "LineString");
    if (!hasLine) throw new Error("route.geojson must contain a LineString geometry");

    ROUTE_CACHE = fc;
    ROUTE_MTIME = mtime;
    console.log("Loaded route.geojson, features:", fc.features.length);
  }
  return ROUTE_CACHE;
}

// Serve the current route
app.get("/api/route", (req, res) => {
  try {
    nocache(res);
    const fc = loadRouteOrThrow();
    res.json(fc);
  } catch (e) {
    console.error("route load error:", e.message);
    nocache(res);
    res.status(500).json({ error: "No route loaded", reason: e.message });
  }
});

// Admin-only: force reload after you replace public/route.geojson
app.post("/api/route-reload", (req, res) => {
  nocache(res);
  const token = (req.body && req.body.token) || req.query.token;
  if (!process.env.SANTA_PASSWORD || token !== process.env.SANTA_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    ROUTE_CACHE = null;
    loadRouteOrThrow();
    io.emit("route-reloaded", { ts: Date.now() });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Reload failed", reason: e.message });
  }
});
