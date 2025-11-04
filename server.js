// server.js (ESM)
import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import compression from "compression";
import cors from "cors";
import fs from "fs";

// ESM shim for __filename / __dirname — MUST be before using them
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: "*" } });

// Static after __dirname exists
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));


// -------------------- LIVE LOCATION STORAGE --------------------
let lastLocation = null; // { lat, lng, accuracy, ts, serverTs }

function broadcastLocation() {
  if (lastLocation) io.emit("location", lastLocation);
}

// Health
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Public: get current location (polling fallback)
app.get("/api/location", (req, res) => res.json(lastLocation || {}));

// Protected: phone posts GPS updates using password token
app.post("/api/update-location", (req, res) => {
  try {
    const { lat, lng, accuracy, ts, token } = req.body || {};
    const pass = "MIFD5150";
    if (!pass) return res.status(500).json({ error: "Server missing SANTA_PASSWORD" });
    if (!token || token !== pass) return res.status(401).json({ error: "Unauthorized" });
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "lat and lng required" });
    }
    const now = Date.now();
    lastLocation = {
      lat, lng,
      accuracy: (typeof accuracy === "number" ? accuracy : null),
      ts: (typeof ts === "number" ? ts : now),
      serverTs: now
    };
    broadcastLocation();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// Socket.io push to viewers
io.on("connection", (socket) => {
  if (lastLocation) socket.emit("location", lastLocation);
});

// -------------------- SNAPPED ROUTE API (roads only) --------------------
// Load waypoints.json from /public (labels + anchor points)
const WAYPOINTS_PATH = path.join(PUBLIC_DIR, "waypoints.json");
let WAYPOINTS = [];
try {
  WAYPOINTS = JSON.parse(fs.readFileSync(WAYPOINTS_PATH, "utf8"));
} catch (e) {
  console.warn("No waypoints.json or invalid JSON. Proceeding with empty waypoints.");
  WAYPOINTS = [];
}

function getWaypointLngLats() {
  return WAYPOINTS
    .filter(w => typeof w.lng === "number" && typeof w.lat === "number")
    .map(w => ({ lng: w.lng, lat: w.lat }));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Call public OSRM for each chunk to snap to roads
async function osrmRouteChunk(coords) {
  const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(";");
  const urlStr = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(urlStr);
  if (!res.ok) throw new Error("OSRM request failed");
  const data = await res.json();
  if (!data.routes || !data.routes[0] || !data.routes[0].geometry) {
    throw new Error("OSRM returned no geometry");
  }
  return data.routes[0].geometry; // GeoJSON LineString
}

function concatLineStrings(lineStrings) {
  const allCoords = [];
  for (const ls of lineStrings) {
    if (ls.type !== "LineString" || !Array.isArray(ls.coordinates)) continue;
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

let SNAPPED_ROUTE = null;

app.get("/api/route", async (req, res) => {
  try {
    if (SNAPPED_ROUTE) return res.json(SNAPPED_ROUTE);

    const pts = getWaypointLngLats();
    if (pts.length < 2) return res.status(400).json({ error: "Not enough waypoints." });

    // Chunk to be kind to public OSRM (and to stay under waypoint limits)
    const chunks = chunk(pts, 25);
    for (let i = 1; i < chunks.length; i++) {
      const prevLast = chunks[i - 1][chunks[i - 1].length - 1];
      chunks[i] = [prevLast, ...chunks[i]];
    }

    const lineStrings = [];
    for (const c of chunks) {
      if (c.length < 2) continue;
      const ls = await osrmRouteChunk(c);
      lineStrings.push(ls);
    }
    const merged = concatLineStrings(lineStrings);

    SNAPPED_ROUTE = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { name: "MIFD Santa Parade (Snapped to Roads)", source: "OSRM" },
        geometry: merged
      }]
    };
    res.json(SNAPPED_ROUTE);
  } catch (e) {
    console.error("Snapped route build failed:", e.message);
    res.status(500).json({ error: "Failed to build snapped route." });
  }
});

// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Santa Tracker running on http://localhost:${PORT}`);
});
