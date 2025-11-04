// tools/simulate.js
import fs from 'fs';
const PASS = process.env.SANTA_PASSWORD || 'MIFD5150';
const URL  = process.env.TRACK_URL || 'http://localhost:3000/api/update-location';

const wps = JSON.parse(fs.readFileSync('public/waypoints.json','utf8'));
const pts = wps
  .filter(w => typeof w.lat==='number' && typeof w.lng==='number')
  .map(w => ({ name: w.name, lat: w.lat, lng: w.lng }));

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function send(p) {
  const body = { lat:p.lat, lng:p.lng, accuracy:8, ts:Date.now(), token:PASS };
  const res = await fetch(URL, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
}

(async () => {
  console.log(`Simulating ${pts.length} points...`);
  for (const [i,p] of pts.entries()) {
    await send(p);
    process.stdout.write(`\rSent ${i+1}/${pts.length}: ${p.name.padEnd(40).slice(0,40)}`);
    await sleep(2000); // 2s per point (adjust as needed)
  }
  console.log('\nDone.');
})();
