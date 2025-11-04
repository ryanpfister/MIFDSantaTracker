// public/js/viewer.js

// ----- Map setup -----
const map = L.map('map').setView([40.884, -72.942], 13); // Middle Island approx

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// ----- Custom panes to control z-order -----
map.createPane('routesPane');        // route lines
map.getPane('routesPane').style.zIndex = 420;

map.createPane('waypointsPane');     // small dots for waypoints
map.getPane('waypointsPane').style.zIndex = 450;

map.createPane('labelsPane');        // waypoint text labels (below Santa)
map.getPane('labelsPane').style.zIndex = 500;

map.createPane('santaGlowPane');     // glow halo under Santa
map.getPane('santaGlowPane').style.zIndex = 580;

map.createPane('santaPane');         // Santa marker (top)
map.getPane('santaPane').style.zIndex = 700;

// ----- State -----
let santaMarker = null;
let santaGlow = null;     // subtle glow ring around Santa
let accuracyRing = null;  // optional accuracy circle

let routeFeature = null;  // GeoJSON Feature (LineString)
let routeLenKm = 0;       // total route length (km)
let completedLayer = null;
let upcomingLayer = null;

let localEpoch = null;    // tracks server reset version

const waypointsDotsLayer = L.layerGroup([], { pane: 'waypointsPane' }).addTo(map);

// ----- Styling & helpers -----
const SANTA_ICON = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/6235/6235085.png", // Santa hat icon
  iconSize: [96, 96],   // large icon
  iconAnchor: [48, 96], // base of the hat sits on exact GPS point
  popupAnchor: [0, -80]
});

function drawRouteParts(completedGeo, upcomingGeo) {
  if (completedLayer) map.removeLayer(completedLayer);
  if (upcomingLayer) map.removeLayer(upcomingLayer);

  if (completedGeo && completedGeo.geometry && completedGeo.geometry.coordinates?.length) {
    completedLayer = L.geoJSON(completedGeo, {
      pane: 'routesPane',
      style: { color: '#22c55e', weight: 6, opacity: 0.95 } // green completed
    }).addTo(map);
  }
  if (upcomingGeo && upcomingGeo.geometry && upcomingGeo.geometry.coordinates?.length) {
    upcomingLayer = L.geoJSON(upcomingGeo, {
      pane: 'routesPane',
      style: { color: '#3388ff', weight: 6, opacity: 0.85 } // blue upcoming
    }).addTo(map);
  }
}

function splitRouteAtDistance(dKm) {
  const d = Math.max(0, Math.min(routeLenKm, dKm));
  const completedGeo = turf.lineSliceAlong(routeFeature, 0, d, { units: 'kilometers' });
  const upcomingGeo  = turf.lineSliceAlong(routeFeature, d, routeLenKm, { units: 'kilometers' });
  drawRouteParts(completedGeo, upcomingGeo);
}

function removeSanta() {
  if (santaMarker) { map.removeLayer(santaMarker); santaMarker = null; }
  if (santaGlow)   { map.removeLayer(santaGlow);   santaGlow = null; }
  if (accuracyRing){ map.removeLayer(accuracyRing); accuracyRing = null; }
}

function hardReset(epoch) {
  localEpoch = epoch ?? localEpoch;
  // Clear marker & rings
  removeSanta();
  // Redraw entire route as upcoming (all blue)
  if (routeFeature) drawRouteParts(null, routeFeature);
}

// ----- Live updates -----
function updateSanta(loc) {
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
  const latlng = [loc.lat, loc.lng];

  // Main Santa marker (big, visible, highest pane)
  if (!santaMarker) {
    santaMarker = L.marker(latlng, {
      icon: SANTA_ICON,
      title: "Santa 🎅 (live)",
      pane: 'santaPane',
      zIndexOffset: 10000
    })
      .addTo(map)
      .bindPopup("<b>Santa is here!</b><br>Ho Ho Ho!");
  } else {
    santaMarker.setLatLng(latlng);
  }

  // Subtle glow ring to make Santa pop on the map
  if (!santaGlow) {
    santaGlow = L.circle(latlng, {
      pane: 'santaGlowPane',
      radius: 100,
      color: "#ff0000",
      weight: 3,
      opacity: 0.9,
      fillOpacity: 0.2
    }).addTo(map);
  } else {
    santaGlow.setLatLng(latlng);
  }

  // Optional accuracy ring (shown only if accuracy provided)
  if (typeof loc.accuracy === 'number' && loc.accuracy > 0) {
    if (!accuracyRing) {
      accuracyRing = L.circle(latlng, {
        pane: 'santaGlowPane',
        radius: loc.accuracy,
        color: "#ef4444",
        dashArray: "6,6",
        weight: 1.5,
        opacity: 0.7,
        fillOpacity: 0.05
      }).addTo(map);
    } else {
      accuracyRing.setLatLng(latlng);
      accuracyRing.setRadius(loc.accuracy);
    }
  }

  // Progress along the snapped route
  if (routeFeature) {
    const pt = turf.point([loc.lng, loc.lat]);
    const snapped = turf.nearestPointOnLine(routeFeature, pt, { units: 'kilometers' });
    const dKm = snapped.properties.location; // distance along line in km
    splitRouteAtDistance(dKm);
  }
}

// ----- Load snapped route from server (follows streets) -----
fetch('/api/route', { cache: 'no-store' })
  .then(r => r.json())
  .then(geo => {
    const feats = geo.type === 'FeatureCollection' ? geo.features : [geo];
    const line = feats.find(f => f.geometry && f.geometry.type === 'LineString');
    if (!line) throw new Error('No LineString found from /api/route');

    routeFeature = line;
    routeLenKm = turf.length(routeFeature, { units: 'kilometers' });

    // Draw initial (all upcoming)
    drawRouteParts(null, routeFeature);

    // Fit map to full route
    const routeLayer = L.geoJSON(routeFeature, { pane: 'routesPane' });
    try { map.fitBounds(routeLayer.getBounds(), { padding: [30,30] }); } catch(e) {}
  })
  .catch(err => console.error('snapped route error:', err));

// ----- Waypoint labels (smaller text, lower pane than Santa) -----
// ----- Live via socket.io + reset + polling fallbacks -----
const socket = io();

socket.on("state", (payload) => {
  if (payload && typeof payload.epoch === 'number') {
    if (localEpoch === null) localEpoch = payload.epoch;           // first time
    if (payload.epoch !== localEpoch) hardReset(payload.epoch);    // server reset detected
  }
});

socket.on("reset", (payload) => {
  const epoch = payload && typeof payload.epoch === 'number' ? payload.epoch : null;
  hardReset(epoch);
});

socket.on("location", (payload) => updateSanta(payload));

// Poll state to catch missed socket events or reloads behind proxies
setInterval(async () => {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    const data = await res.json();
    if (data && typeof data.epoch === 'number' && (localEpoch === null || data.epoch !== localEpoch)) {
      hardReset(data.epoch);
    }
  } catch (e) { /* ignore */ }
}, 8000);

// Poll current location as a fallback
setInterval(async () => {
  try {
    const res = await fetch('/api/location', { cache: 'no-store' });
    const data = await res.json();
    if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
      updateSanta(data);
    }
  } catch (e) { /* ignore */ }
}, 10000);
