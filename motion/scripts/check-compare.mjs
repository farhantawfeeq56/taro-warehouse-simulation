const OUTER = 2;
function makeLayout(rc, gh, aw, cross) {
  rc = Math.max(1, Math.floor(rc)); gh = Math.max(1, Math.floor(gh)); aw = Math.max(1, Math.floor(aw));
  const width = rc * 2 + (rc - 1) * aw + 2 * OUTER, height = gh + 2 * OUTER;
  const shelves = [];
  for (let r = 0; r < rc; r++) {
    const xb = OUTER + r * (2 + aw);
    for (let o = 0; o < 2; o++) {
      const x = xb + o;
      for (let ly = 0; ly < gh; ly++) shelves.push({ x, y: ly + OUTER });
    }
  }
  const crossRows = [OUTER - 1, gh + OUTER];
  if (cross > 0) {
    const seg = cross + 1, sh = Math.floor(gh / seg);
    for (let i = 1; i < seg; i++) { const row = i * sh; if (row > 0 && row < gh) crossRows.push(row + OUTER); }
  }
  const workerStart = { x: OUTER + (rc > 1 ? 2 : 0), y: height - OUTER - 1 };
  return { width, height, shelves, crossRows, workerStart, rackCount: rc, gridHeight: gh };
}
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pickSites(L, n, seed) {
  const full = [...L.shelves]; const rnd = mulberry32(seed);
  for (let i = full.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [full[i], full[j]] = [full[j], full[i]]; }
  const step = Math.max(1, Math.floor(full.length / n));
  const out = [];
  for (let i = 0; i < n; i++) { const s = full[(i * step + Math.floor(rnd() * step)) % full.length]; out.push({ x: s.x, y: s.y }); }
  return out;
}
function greedyStops(from, stops) {
  const out = []; let cur = from; const rest = stops.map((p) => ({ ...p }));
  while (rest.length) {
    let bi = 0, bd = Infinity;
    rest.forEach((p, i) => { const d = Math.abs(p.x - cur.x) + Math.abs(p.y - cur.y); if (d < bd) { bd = d; bi = i; } });
    out.push(rest.splice(bi, 1)[0]); cur = out[out.length - 1];
  }
  return out;
}
function makeRoute(from, stops) {
  const out = [{ ...from }]; let fl = true, cur = from;
  for (const s of stops) { const mid = fl ? { x: cur.x, y: s.y } : { x: s.x, y: cur.y }; out.push(mid, s); cur = s; fl = !fl; }
  return out;
}
function zoneMetric(L, sites, nzones, seed) {
  const innerTop = 1.6, innerBottom = L.height - 1.6; const h = (innerBottom - innerTop) / nzones;
  let dist = 0, maxT = 0;
  for (let i = 0; i < nzones; i++) {
    const zy = innerTop + i * h, zh = h;
    const from = { x: L.workerStart.x + 1, y: zy + zh / 2 };
    const inZone = sites.filter((s) => s.y >= zy && s.y < zy + zh);
    const r = makeRoute(from, greedyStops(from, inZone));
    let d = 0;
    for (let k = 1; k < r.length; k++) d += (Math.abs(r[k].x - r[k - 1].x) + Math.abs(r[k].y - r[k - 1].y)) * 2;
    dist += d;
    const t = d / 60 + inZone.length * 5 * 6 / 60;
    if (t > maxT) maxT = t;
  }
  return { dist, time: maxT };
}
const loads = [[12, 16, 1, 26, 4], [9, 12, 2, 26, 4], [14, 18, 0, 26, 4]];
for (const [rc, gh, cross, n, wk] of loads) {
  const L = makeLayout(rc, gh, 1, cross);
  const sites = pickSites(L, n, 37);
  const m = zoneMetric(L, sites, 4, 1);
  const time = m.time;
  const cost = time * 0.5 * wk / n;
  const util = Math.min(100, (time / 60) * 100);
  const wh = L.width + 'x' + L.height;
  console.log(JSON.stringify({ rc, cross, w: Math.round(m.dist), time: +time.toFixed(1), cost: +cost.toFixed(2), util: +util.toFixed(0), wh }));
}