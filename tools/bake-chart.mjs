/* Bakes the hero chart in index.html: a Lambert conformal conic projection (the one
   aeronautical sectional charts use) of the Caribbean and the US east coast, with the
   Bogotá (SKBO) -> Barranquilla (SKBQ) -> New York (KJFK) route.

   Usage (from this folder):
     npm install d3-geo@3 topojson-client@3 topojson-simplify@3 world-atlas@2
     node bake-chart.mjs
   Writes chart.json. Paste its land, borders, graticule and route paths into the
   matching <path> elements of the .chart__svg in index.html. If you change the
   projection, update K, TX and TY in js/site.js (printed below) so the cursor
   coordinate readout stays exact. Map data: Natural Earth via world-atlas. */
import { geoConicConformal, geoPath, geoGraticule, geoDistance, geoInterpolate } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { readFileSync, writeFileSync } from 'node:fs';

const land50 = JSON.parse(readFileSync('node_modules/world-atlas/land-50m.json'));
const countries50 = JSON.parse(readFileSync('node_modules/world-atlas/countries-50m.json'));
const l50 = simplify(presimplify(land50), quantile(presimplify(land50), 0.45));
const c50p = presimplify(countries50);
const c50 = simplify(c50p, quantile(c50p, 0.6));
const land = feature(l50, l50.objects.land);
const borders = mesh(c50, c50.objects.countries, (a, b) => a !== b);

const W = 640, H = 940;
const LON0 = -94, LON1 = -54, LAT0 = 0, LAT1 = 45;
// Lambert conformal conic: the projection used on aeronautical sectional charts.
const proj = geoConicConformal().parallels([12, 36]).rotate([74, 0]);
const pts = [];
for (let lo = LON0; lo <= LON1; lo += 1) { pts.push([lo, LAT0], [lo, LAT1]); }
for (let la = LAT0; la <= LAT1; la += 1) { pts.push([LON0, la], [LON1, la]); }
// fit the *inner* area so the chart bleeds slightly past the frame
proj.fitExtent([[-40, -10], [W + 40, H + 10]], { type: 'MultiPoint', coordinates: pts });
proj.clipExtent([[-2, -2], [W + 2, H + 2]]);
const path = geoPath(proj).digits(0);

const grat = geoGraticule().extent([[LON0 - 10, LAT0 - 5], [LON1 + 10, LAT1 + 5]]).step([5, 5]).precision(1);
const graticulePath = path(grat());

const way = {
  SKBO: { name: 'Bogotá', lonlat: [-74.1469, 4.7016] },
  SKBQ: { name: 'Barranquilla', lonlat: [-74.7808, 10.8896] },
  KJFK: { name: 'New York', lonlat: [-73.7781, 40.6413] },
};
for (const k in way) way[k].xy = proj(way[k].lonlat).map(v => +v.toFixed(1));

const route = { type: 'LineString', coordinates: [way.SKBO.lonlat, way.SKBQ.lonlat, way.KJFK.lonlat] };
const routePath = path(route);
const nm = geoDistance(way.SKBO.lonlat, way.KJFK.lonlat) * 3440.065;
const nmVia = (geoDistance(way.SKBO.lonlat, way.SKBQ.lonlat) + geoDistance(way.SKBQ.lonlat, way.KJFK.lonlat)) * 3440.065;

// graticule labels: parallels along the left edge, meridians along the bottom edge
const labels = [];
for (let la = 5; la <= 40; la += 5) {
  // find x where the parallel crosses x=~0 → use the projected point at the chart's left meridian region
  let best = null;
  for (let lo = LON0 - 10; lo <= LON1; lo += 0.05) {
    const [x, y] = proj([lo, la]);
    if (x >= 6 && (!best || x < best[0])) { best = [x, y]; }
  }
  if (best && best[1] > 20 && best[1] < H - 40) labels.push({ t: `${la}°N`, x: 8, y: +best[1].toFixed(1), a: 'start' });
}
for (let lo = -90; lo <= -55; lo += 5) {
  let best = null;
  for (let la = LAT0 - 5; la <= LAT1; la += 0.05) {
    const [x, y] = proj([lo, la]);
    if (y <= H - 8 && (!best || y > best[1])) { best = [x, y]; }
  }
  if (best && best[0] > 30 && best[0] < W - 30) labels.push({ t: `${Math.abs(lo)}°W`, x: +best[0].toFixed(1), y: H - 10, a: 'middle' });
}

// sample points along the route for the aircraft (lon/lat → xy), so JS needs no projection at runtime
const samples = [];
const legs = [[way.SKBO.lonlat, way.SKBQ.lonlat], [way.SKBQ.lonlat, way.KJFK.lonlat]];
const legLen = legs.map(([a, b]) => geoDistance(a, b));
const total = legLen.reduce((a, b) => a + b, 0);
const N = 120;
for (let i = 0; i <= N; i++) {
  let d = (i / N) * total, k = 0;
  while (k < legs.length - 1 && d > legLen[k]) { d -= legLen[k]; k++; }
  const ll = geoInterpolate(legs[k][0], legs[k][1])(Math.min(1, d / legLen[k]));
  samples.push([+ll[0].toFixed(3), +ll[1].toFixed(3)]);
}

// inverse projection support: export the projection params by sampling a lat/lon grid is overkill;
// instead export a coarse lookup so the cursor readout can invert with bilinear search in JS.
const inv = [];
const GX = 33, GY = 48;
for (let j = 0; j < GY; j++) {
  const row = [];
  for (let i = 0; i < GX; i++) {
    const ll = proj.invert([(i / (GX - 1)) * W, (j / (GY - 1)) * H]);
    row.push([+ll[0].toFixed(3), +ll[1].toFixed(3)]);
  }
  inv.push(row);
}

const out = {
  W, H,
  land: path(land),
  borders: path(borders),
  graticule: graticulePath,
  route: routePath,
  way, labels, nm: Math.round(nm), nmVia: Math.round(nmVia),
  samples: samples.map(ll => proj(ll).map(v => +v.toFixed(1))),
  k: proj.scale(), t: proj.translate(),
};
writeFileSync('chart.json', JSON.stringify(out));
console.log('land', out.land.length, 'borders', out.borders.length, 'grat', out.graticule.length, 'route', out.route.length);
console.log('k (K in site.js)', proj.scale(), 'translate (TX, TY)', proj.translate());
console.log('nm direct', out.nm, 'via SKBQ', out.nmVia, way);
console.log(labels);
