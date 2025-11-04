# Middle Island Fire Department – Santa Tracker (Node.js)

A tiny Node.js + Leaflet app to show **live Santa location** and the **planned parade route** in Middle Island, NY.

---

## Features
- Public viewer map (OpenStreetMap tiles via Leaflet).
- Live location broadcast via Socket.IO (instant updates) with polling fallback.
- Password-protected update endpoint used by the **driver's phone** on the route.
- Route overlay loaded from a `GeoJSON` file you can draw and edit in minutes.

---

## Quick Start

1. **Download dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   - Copy `.env.example` to `.env` and set a strong secret for `SANTA_PASSWORD`.
   - Optionally change `PORT` (default `3000`).

3. **Run locally**
   ```bash
   npm run start
   ```
   Open: http://localhost:3000

4. **Pages**
   - Public viewer: `/` (shows live Santa and route overlay).
   - Secure device uploader (for the phone in the parade): `/admin.html`  
     Enter the password and tap **Arm Tracking**. Keep the page open.

> **Note**: Geolocation requires **HTTPS** in production (works on `http://localhost` for testing). Use a TLS-enabled reverse proxy (Caddy, Nginx) or platforms like Render, Fly.io, Railway, etc.

---

## Deploy Notes

- Serve this Node app behind HTTPS.
- Keep `SANTA_PASSWORD` as a secret environment variable on your host.
- If you restart the server, the last known location is lost (in-memory).  
  If you want persistence, wire up Redis or a small JSON file writer.

---

## Editing the Parade Route

This app reads `/public/route.geojson` and draws it as the **future planned path** (blue line).
You can easily replace it with your exact route:

1. Go to **https://geojson.io**.
2. Use the **LineString** tool to trace your parade route.
3. Click **Save → GeoJSON** and download the file.
4. Replace `public/route.geojson` with your export.

Alternatively, if you have a GPX/KML/CSV:
- Convert it to GeoJSON via https://mapshaper.org or http://ogre.adc4gis.com/
- Save as `public/route.geojson`

---

## Security & Operations Tips

- Change `SANTA_PASSWORD` before parade day and share it **only** with the driver.
- On iPhone, open `/admin.html`, tap **Share → Add to Home Screen** for a full-screen PWA-like feel.
- Keep a second phone/tab on the viewer page to verify that updates are visible to the public.
- If data connection drops, the last pinned location remains until a new one arrives.

---

## File Layout

```
.
├─ server.js               # Express + Socket.IO server + protected update API
├─ package.json
├─ .env.example
└─ public/
   ├─ index.html           # Public viewer map
   ├─ admin.html           # Passworded device uploader (uses Geolocation API)
   ├─ route.geojson        # Parade route overlay (replace with your official route)
   └─ js/
      └─ viewer.js         # Front-end logic for the viewer map
```

---

## Troubleshooting

- **No dots on the map**: Make sure the tracking phone has GPS enabled and `/admin.html` is **armed** with the correct password.
- **Browser says location blocked**: You must use **HTTPS** (or `localhost`) for the Geolocation API.
- **Tile load error**: If a school firewall blocks OpenStreetMap, switch the tile URL in `public/js/viewer.js` to another provider.
- **Server missing SANTA_PASSWORD**: Ensure you created a `.env` with `SANTA_PASSWORD` set and restarted the server.
"# MIFDSantaTracker" 
"# MIFDSantaTracker" 
