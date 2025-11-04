// tools/build-route.js
// Node 18+ required (has global fetch). Run with: node tools/build-route.js
// Output: public/route.geojson  (FeatureCollection with 1 LineString)

import fs from "fs";
import path from "path";
const LOG_FAILS = true;




// ---- CONFIG ----
const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, "public", "route.geojson");

// Hard bounding box to bias searches (Middle Island, NY & nearby)
// [west, south, east, north]
const BBOX = [-73.02, 40.80, -72.85, 40.94];

const HEADERS = {
  "User-Agent": "MIFD-Santa-Route-Builder/1.0 (contact: admin@mifdsantatracker.com)"
};

// Your textual steps (as provided). We’ll geocode each into a point in Middle Island/Coram area.
const STEPS = [
  "MIFD Station 2 Middle Island",
  "Tudor Oaks Middle Island",
  "Middle Country Road Middle Island west",
  "Renaissance Village Middle Island",
  "Rocky Point Road Middle Island north",
  "Bailey Road Middle Island east",
  "Flicker Drive Middle Island south",
  "Pine Road Middle Island east",
  "Artist Drive Middle Island south",
  "Lakeview Drive Middle Island north",
  "Bailey Road Middle Island east",
  "Artist Lake Blvd Middle Island north",
  "Brook Lane Middle Island east",
  "Turnpike Blvd Middle Island south",
  "River Road Middle Island west",
  "Artist Lake Blvd Middle Island south",
  "Bailey Road Middle Island east",
  "Rainbow Court Middle Island",
  "Bailey Court Middle Island",
  "Currans Road Middle Island south",
  "Middle Country Road Middle Island east",
  "Picasso Way Lake Pointe Middle Island south",
  "Shore Drive Lake Pointe Middle Island",
  "Lake Pointe Circle Middle Island",
  "Picasso Way Middle Island",
  "Lake Pointe Drive Middle Island",
  "Picasso Way Middle Island north",
  "Middle Country Road Middle Island east",
  "Woodville Road Middle Island north",
  "Short Street Middle Island",
  "Woodville Road Middle Island south",
  "Middle Country Road Middle Island east",
  "Summersweet Drive Middle Island north",
  "Winterberry Drive Middle Island north",
  "Winterberry Drive Middle Island south",
  "Beach Plum Lane Middle Island east",
  "Wading River Hollow Road Middle Island south",
  "Brendan Gate Middle Island west",
  "Nottingham Drive Middle Island north",
  "Abbey Drive Middle Island south",
  "Shelley Drive Middle Island east",
  "Nottingham Drive Middle Island south",
  "Elkin Drive Middle Island west",
  "Cullen Lane Middle Island east",
  "Wading River Hollow Road Middle Island north",
  "Rolling Hills Drive Middle Island east",
  "Bellaire Drive Middle Island west",
  "Wading River Hollow Road Middle Island south",
  "Cliffwood Lane Middle Island east",
  "Cedar Heights Drive Middle Island east",
  "Scenic Hills Drive Middle Island south",
  "Wading River Hollow Road Middle Island south",
  "Niewood Drive Middle Island east",
  "Pamela Drive Middle Island north",
  "Fuller Drive Middle Island east",
  "Eason Drive Middle Island north",
  "Fuller Drive Middle Island west",
  "Pamela Drive Middle Island south",
  "Niewood Drive Middle Island east",
  "Eason Drive Middle Island south",
  "Longwood Road Middle Island west",
  "Brittany Court Middle Island",
  "Longwood Road Middle Island west",
  "Mill Rd / Middle Island Yaphank Road (CR 21) north",
  "Island Bay Avenue Middle Island",
  "Middle Island Yaphank Road north",
  "Artist Lake Drive Middle Island east",
  "Artist Lake Guard Booth Middle Island",
  "Artist Lake Drive loop Middle Island",
  "Artist Lake Drive Middle Island east",
  "Fairview Circle Middle Island north",
  "Artist Lake Drive Middle Island west",
  "Middle Island Yaphank Road north",
  "Middle Country Road Middle Island west",
  "Walmart Middle Island",
  "Middle Country Road Middle Island west",
  "Birchwood Park Drive Middle Island north",
  "Springlake Drive Middle Island south",
  "Eric Drive Middle Island west",
  "Birchwood Park Drive Middle Island south",
  "Middle Country Road Middle Island west",
  "Robin Drive Middle Island",
  "Middle Country Road Middle Island west",
  "Bartlett Road Middle Island south",
  "Fairway Drive Middle Island east",
  "Bunker Lane Middle Island south",
  "Cathedral Court Middle Island west",
  "Bunker Lane Middle Island north",
  "Fairway Drive Middle Island west",
  "Bartlett Road Middle Island south",
  "Strathmore on the Green Dr Middle Island east",
  "Dorado Court South Middle Island",
  "Strathmore on the Green Dr Middle Island east",
  "East Bartlett Road Middle Island north",
  "Middle Country Road Middle Island west",
  "Arnold Drive Middle Island north",
  "South Street Middle Island east",
  "East Street Middle Island north",
  "North Street Middle Island west",
  "West Street Middle Island south",
  "South Street Middle Island east",
  "Arnold Drive Middle Island south",
  "Middle Country Road Middle Island east",
  "Church Lane Middle Island north",
  "Half Mile Road Middle Island west",
  "North Swezeytown Road Middle Island north",
  "Poinsetta Avenue Middle Island east",
  "Cedar Branch Street Middle Island north",
  "Raymond Avenue Middle Island west",
  "Pine Cone Street Middle Island south",
  "Poinsetta Avenue Middle Island west",
  "White Oak Street Middle Island north",
  "Raymond Avenue Middle Island west",
  "North Swezeytown Road Middle Island north",
  "Evergreen Avenue Middle Island east",
  "Oakcrest Avenue Middle Island south",
  "Church Lane Middle Island south",
  "Mauritz Blvd Middle Island east",
  "Middle Island Blvd Middle Island north",
  "Whiskey Road Middle Island west",
  "Coram Swezeytown Road south",
  "Country View Estates Coram",
  "Coram Swezeytown Road south",
  "North Swezeytown Road south",
  "South Swezeytown Road south",
  "Middle Country Road west Coram",
  "Westfield Road Coram north",
  "Northfield Road Coram east",
  "Wellington Road Coram south",
  "Devon Lane Coram east",
  "Swezey Lane Coram north",
  "Coram Swezeytown Road west",
  "Pinewood Estates Coram",
  "Stonegate Way Coram",
  "Coram Swezeytown Road west",
  "Mount Sinai Coram Road north",
  "Wren Lane Coram east",
  "Sparrow Drive Coram north",
  "Humming Lane Coram east",
  "Community Drive Coram north",
  "Whiskey Road west",
  "Mount Sinai Coram Road north",
  "Canal Road east",
  "Whiskey Road east",
  "Traffic Circle Whiskey Rd",
  "Whiskey Road east",
  "Creekside Drive south",
  "Creekside Drive north",
  "Whiskey Road east",
  "Rocky Point Road south",
  "Andrew Way east",
  "Heather Court south",
  "Holly Court north",
  "Andrew Way west",
  "Rocky Point Road south",
  "End Middle Island"
];

// Optional explicit overrides for tricky POIs (lat,lng). Fill any you know precisely.
const OVERRIDES = {
  "MIFD Station 2 Middle Island": [40.88490, -72.94640],
  "Tudor Oaks Middle Island": [40.88387, -72.94235],
  "Renaissance Village Middle Island": [40.88532, -72.93810],
  "Bailey Road Middle Island east": [40.88830, -72.92710],
  "Wading River Hollow Road Middle Island": [40.89410, -72.91310],
  "Walmart Middle Island": [40.88272, -72.96260]
};


// ---- HELPERS ----
const qs = (o) => Object.entries(o).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join("&");

async function geocode(q) {
  if (OVERRIDES[q]) return { name: q, lat: OVERRIDES[q][0], lon: OVERRIDES[q][1], src: "override" };
  const url = `https://nominatim.openstreetmap.org/search?${qs({
    q,
    format: "json",
    limit: 1,
    bounded: 1,
    viewbox: `${BBOX[0]},${BBOX[3]},${BBOX[2]},${BBOX[1]}`
  })}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.json();
      if (arr && arr[0]) {
        return { name: q, lat: Number(arr[0].lat), lon: Number(arr[0].lon), src: "nominatim" };
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 400 * Math.pow(2, attempt)));
    }
  }
  return null;
}

async function routeChunk(points) {
  const coordStr = points.map(p => `${p.lon},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.routes?.[0]?.geometry) return data.routes[0].geometry;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  throw new Error("OSRM failed all retries");
}

function concatLineStrings(lineStrings) {
  const all = [];
  for (const ls of lineStrings) {
    if (!ls || ls.type !== "LineString" || !Array.isArray(ls.coordinates)) continue;
    if (all.length && ls.coordinates.length) {
      const first = ls.coordinates[0];
      const last  = all[all.length - 1];
      if (first[0] === last[0] && first[1] === last[1]) {
        all.push(...ls.coordinates.slice(1)); // avoid duplicate join point
        continue;
      }
    }
    all.push(...ls.coordinates);
  }
  return { type: "LineString", coordinates: all };
}

// ---- MAIN ----
(async () => {
  console.log(`Geocoding ${STEPS.length} steps…`);
  const geos = [];
  for (const s of STEPS) {
    const g = await geocode(`${s}, Suffolk County, NY`);
if (!g) {
  console.warn("WARN: failed to geocode:", s);
  if (LOG_FAILS) fs.appendFileSync("failed.txt", s + "\n");
  continue;
}
    // Drop identical consecutive points
    if (geos.length) {
      const last = geos[geos.length - 1];
      if (Math.abs(last.lat - g.lat) < 1e-5 && Math.abs(last.lon - g.lon) < 1e-5) continue;
    }
    geos.push(g);
    // be polite to nominatim
    await new Promise(r => setTimeout(r, 300));
  }

  if (geos.length < 2) {
    console.error("ERROR: fewer than 2 geocoded points; cannot build route.");
    process.exit(1);
  }

  // Chunk routing every ~20 waypoints to keep URLs small and be kind to OSRM.
  console.log(`Routing across ${geos.length} points…`);
  const chunkSize = 20;
  const chunks = [];
  for (let i = 0; i < geos.length; i += chunkSize) {
    const slice = geos.slice(i, i + chunkSize);
    if (i > 0) slice.unshift(geos[i - 1]); // overlap for continuity
    chunks.push(slice);
  }

  const lineStrings = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (c.length < 2) continue;
    try {
      const ls = await routeChunk(c);
      lineStrings.push(ls);
      console.log(`  ✓ chunk ${i + 1}/${chunks.length} ok (${c.length} pts)`);
    } catch (e) {
      console.warn(`  ✗ chunk ${i + 1}/${chunks.length} failed: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (!lineStrings.length) {
    console.error("ERROR: all route chunks failed.");
    process.exit(2);
  }

  const merged = concatLineStrings(lineStrings);
  const fc = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { name: "MIFD Santa Parade (Auto-built)", source: "OSM+OSRM" },
      geometry: merged
    }]
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(fc));
  console.log(`Wrote ${OUT}`);
})();
