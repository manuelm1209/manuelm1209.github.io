/* Multiplier Effect preview: an orthographic globe with Endeavor's markets,
   linked by great-circle arcs to the global office in New York.
   Canvas 2D + a vendored subset of d3-geo. Rotates only while visible and only
   when motion is allowed; dragging always works. */
import { geoOrthographic, geoPath, geoGraticule10, geoInterpolate, geoCentroid, geoContains, feature } from './vendor/geo.min.js';

const MARKETS = new Set([
  'Argentina', 'Bangladesh', 'Brazil', 'Bulgaria', 'Canada', 'Chile', 'Colombia', 'Ecuador', 'Egypt', 'Greece',
  'Indonesia', 'Ireland', 'Italy', 'Japan', 'Jordan', 'Kenya', 'Lebanon', 'Malaysia', 'Mexico', 'Morocco',
  'Nigeria', 'Pakistan', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Puerto Rico', 'Romania', 'Saudi Arabia',
  'South Africa', 'Spain', 'Thailand', 'Tunisia', 'Turkey', 'United Arab Emirates', 'United States of America',
  'Uruguay', 'Vietnam',
]);
const DISPLAY = { 'United States of America': 'United States' };
const NYC = [-73.98, 40.75];
// Hand-placed anchors where a country's centroid falls somewhere unhelpful.
const ANCHOR = { 'United States of America': NYC, Canada: [-79.4, 43.7], Chile: [-70.65, -33.45], Indonesia: [106.8, -6.2], Malaysia: [101.7, 3.1], Philippines: [121, 14.6], Japan: [139.7, 35.7] };

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

export async function initGlobe(el, { motionOK }) {
  const canvas = el.querySelector('canvas');
  const label = el.querySelector('[data-globe-label]');
  const ctx = canvas.getContext('2d');
  const topo = await fetch(new URL('../data/countries-110m.json', import.meta.url)).then((r) => r.json());
  const countries = feature(topo, topo.objects.countries).features;
  const markets = countries.filter((f) => MARKETS.has(f.properties.name));
  const arcs = markets
    .filter((f) => f.properties.name !== 'United States of America')
    .map((f, i) => ({ to: ANCHOR[f.properties.name] || geoCentroid(f), interp: null, delay: i * 55 }))
    .map((a) => ({ ...a, interp: geoInterpolate(NYC, a.to) }));

  const projection = geoOrthographic().clipAngle(90).precision(0.4);
  const path = geoPath(projection, ctx);
  const graticule = geoGraticule10();
  const sphere = { type: 'Sphere' };

  let colors = readColors();
  function readColors() {
    return {
      paper: cssVar('--paper'), deep: cssVar('--paper-deep'), ink: cssVar('--ink'), soft: cssVar('--ink-soft'),
      grid: cssVar('--grid'), land: cssVar('--land'), coast: cssVar('--coast'), magenta: cssVar('--magenta'), blue: cssVar('--blue'),
    };
  }
  window.addEventListener('themechange', () => { colors = readColors(); draw(); });

  let size = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = el.clientWidth;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    projection.fitExtent([[10, 30], [size - 10, size - 30]], sphere);
    draw();
  }

  let rot = [74, -18, 0]; // start over the Americas, New York and Bogotá in view
  let hovered = null;
  let arcT0 = null; // arcs draw in once
  let arcProgress = motionOK() ? 0 : 1;
  const flowStart = performance.now();

  function draw(now = performance.now()) {
    projection.rotate(rot);
    ctx.clearRect(0, 0, size, size);

    // ocean + rim
    ctx.beginPath(); path(sphere); ctx.fillStyle = colors.deep; ctx.fill();
    ctx.beginPath(); path(graticule); ctx.strokeStyle = colors.grid; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;

    // countries
    ctx.lineWidth = 0.5;
    for (const f of countries) {
      const isMarket = MARKETS.has(f.properties.name);
      ctx.beginPath(); path(f);
      ctx.fillStyle = isMarket ? colors.magenta : colors.land;
      ctx.globalAlpha = isMarket ? (f === hovered ? 0.95 : 0.55) : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isMarket ? colors.paper : colors.coast;
      ctx.stroke();
    }
    if (hovered && !MARKETS.has(hovered.properties.name)) {
      ctx.beginPath(); path(hovered); ctx.strokeStyle = colors.ink; ctx.lineWidth = 1.2; ctx.stroke();
    }

    // arcs from New York
    ctx.lineWidth = 1.2; ctx.strokeStyle = colors.blue; ctx.lineCap = 'round';
    for (const a of arcs) {
      const local = clamp((arcProgress * (1600 + arcs.length * 55) - a.delay) / 1600, 0, 1);
      if (local <= 0) continue;
      const pts = [];
      const steps = 24;
      for (let i = 0; i <= steps; i++) pts.push(a.interp((i / steps) * easeOut(local)));
      ctx.beginPath(); path({ type: 'LineString', coordinates: pts });
      ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;

      // a small packet travelling along each finished arc (only when motion is allowed)
      if (local >= 1 && motionOK()) {
        const phase = (((now - flowStart) / 2600) + a.delay / 900) % 1;
        const p = projection(a.interp(phase));
        if (p && isVisible(a.interp(phase))) {
          ctx.beginPath(); ctx.arc(p[0], p[1], 1.8, 0, Math.PI * 2); ctx.fillStyle = colors.blue; ctx.fill();
        }
      }
    }

    // New York: the global office
    const ny = projection(NYC);
    if (ny && isVisible(NYC)) {
      ctx.beginPath(); ctx.arc(ny[0], ny[1], 5.5, 0, Math.PI * 2); ctx.fillStyle = colors.paper; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = colors.blue; ctx.stroke();
      ctx.beginPath(); ctx.arc(ny[0], ny[1], 2, 0, Math.PI * 2); ctx.fillStyle = colors.blue; ctx.fill();
    }

    // rim
    ctx.beginPath(); path(sphere); ctx.strokeStyle = colors.ink; ctx.lineWidth = 1.25; ctx.stroke();
  }

  function isVisible(lonlat) {
    const r = projection.rotate();
    const λ = (lonlat[0] + r[0]) * Math.PI / 180, φ = lonlat[1] * Math.PI / 180, φ0 = -r[1] * Math.PI / 180;
    return Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ) > 0;
  }

  // Animation loop: runs only while on screen
  let running = false, visible = false, last = 0, dragging = false, resumeAt = 0;
  function frame(now) {
    if (!visible) { running = false; return; }
    const dt = Math.min(64, now - (last || now)); last = now;
    if (motionOK()) {
      if (arcT0 === null) arcT0 = now;
      arcProgress = clamp((now - arcT0) / (1600 + arcs.length * 55), 0, 1);
      if (!dragging && now > resumeAt) rot = [rot[0] + dt * 0.006, rot[1], rot[2]];
    } else {
      arcProgress = 1;
    }
    draw(now);
    if (motionOK()) requestAnimationFrame(frame); else running = false;
  }
  function start() { if (!running) { running = true; last = 0; requestAnimationFrame(frame); } }

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) start();
  }, { threshold: 0.05 }).observe(el);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) start(); });

  // Drag to rotate (pointer events: mouse, pen and touch)
  let lastPt = null;
  el.addEventListener('pointerdown', (e) => {
    dragging = true; lastPt = [e.clientX, e.clientY];
    el.setPointerCapture(e.pointerId); el.classList.add('is-dragging');
  });
  el.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    if (dragging && lastPt) {
      const k = 120 / projection.scale();
      rot = [rot[0] + (e.clientX - lastPt[0]) * k * 2.2, clamp(rot[1] - (e.clientY - lastPt[1]) * k * 2.2, -70, 70), 0];
      lastPt = [e.clientX, e.clientY];
      if (!motionOK()) draw();
      return;
    }
    const ll = projection.invert([e.clientX - rect.left, e.clientY - rect.top]);
    const hit = ll && isVisible(ll) ? countries.find((f) => geoContains(f, ll)) : null;
    if (hit !== hovered) {
      hovered = hit;
      if (label) {
        const name = hit ? (DISPLAY[hit.properties.name] || hit.properties.name) : '';
        label.textContent = hit ? (MARKETS.has(hit.properties.name) ? name + ': Endeavor market' : name) : '';
      }
      if (!motionOK()) draw();
    }
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false; lastPt = null; resumeAt = performance.now() + 2500;
    el.classList.remove('is-dragging');
    try { el.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', () => { if (!dragging && hovered) { hovered = null; if (label) label.textContent = ''; if (!motionOK()) draw(); } });

  new ResizeObserver(resize).observe(el);
  resize();
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
