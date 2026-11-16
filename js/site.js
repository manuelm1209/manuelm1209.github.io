/* Manuel Montoya: behavior layer.
   Every animation here is either the single hero sequence or a direct response
   to scroll/pointer input. With prefers-reduced-motion, elements render in
   their final state and nothing moves on its own. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  var motionOK = function () { return !reduceMQ.matches; };
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var easeInOutCubic = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  reduceMQ.addEventListener && reduceMQ.addEventListener('change', function () {
    root.classList.toggle('motion', motionOK());
  });

  /* ------------------------------------------------------------------
     Theme: circular reveal from the toggle via the View Transitions API
     ------------------------------------------------------------------ */
  var themeBtn = $('[data-theme-toggle]');
  function syncThemeLabel() {
    if (!themeBtn) return;
    var dark = root.dataset.theme === 'dark';
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }
  syncThemeLabel();
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      var apply = function () {
        root.dataset.theme = next;
        try { localStorage.setItem('theme', next); } catch (e) {}
        syncThemeLabel();
        window.dispatchEvent(new CustomEvent('themechange'));
      };
      if (!document.startViewTransition || !motionOK()) { apply(); return; }
      var r = themeBtn.getBoundingClientRect();
      root.style.setProperty('--vt-x', (r.left + r.width / 2) + 'px');
      root.style.setProperty('--vt-y', (r.top + r.height / 2) + 'px');
      root.classList.add('theme-vt');
      var vt = document.startViewTransition(apply);
      vt.finished.finally(function () { root.classList.remove('theme-vt'); });
    });
  }

  /* ------------------------------------------------------------------
     Navigation: mobile menu, scrolled state, progress route, active link
     ------------------------------------------------------------------ */
  var nav = $('[data-nav]');
  var menuBtn = $('[data-menu]');
  if (menuBtn && nav) {
    var closeMenu = function () { nav.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.textContent = 'Menu'; };
    menuBtn.addEventListener('click', function () {
      var open = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.textContent = open ? 'Close' : 'Menu';
    });
    $$('.nav__links a', nav).forEach(function (a) { a.addEventListener('click', closeMenu); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('is-open')) { closeMenu(); menuBtn.focus(); } });
  }

  var navLinks = $$('.nav__links a[href^="#"]');
  var sections = navLinks.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    var current = null;
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) current = en.target.id;
      });
      navLinks.forEach(function (a) {
        if (a.getAttribute('href') === '#' + current) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { navIO.observe(s); });
    var top = document.getElementById('top'); // back at the hero: no section is current
    if (top) navIO.observe(top);
  }

  /* ------------------------------------------------------------------
     Scroll-linked work, batched into one rAF
     ------------------------------------------------------------------ */
  var log = $('[data-log]');
  var logList = log && $('.log__list', log);
  var logTrack = log && $('.log__track', log);
  var legs = log ? $$('.leg', log) : [];
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY;
      var max = document.documentElement.scrollHeight - innerHeight;
      var p = max > 0 ? clamp(y / max, 0, 1) : 0;
      if (nav) {
        nav.classList.toggle('is-scrolled', y > 8);
        nav.style.setProperty('--progress', p.toFixed(4));
        nav.style.setProperty('--plane-x', (p * (nav.clientWidth - 20) - (p === 0 ? 24 : 0)).toFixed(1) + 'px');
      }
      if (log && logTrack) updateLog();
    });
  }

  function updateLog() {
    var tr = logTrack.getBoundingClientRect();
    var anchor = innerHeight * 0.55; // the plane flies at 55% of the viewport height
    var lp = motionOK() ? clamp((anchor - tr.top) / tr.height, 0, 1) : 1;
    var py = lp * tr.height;
    log.style.setProperty('--p', lp.toFixed(4));
    log.style.setProperty('--py', py.toFixed(1) + 'px');
    legs.forEach(function (leg) {
      var markY = leg.getBoundingClientRect().top + 36 - tr.top;
      leg.classList.toggle('is-passed', markY <= py + 2);
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ------------------------------------------------------------------
     Reveal observer: adds .is-in once, used by the orchestrated reveals
     ------------------------------------------------------------------ */
  var revealTargets = $$('[data-reveal]').concat($$('.about'));
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.3 });
    revealTargets.forEach(function (el) { io.observe(el); });
  } else {
    revealTargets.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ------------------------------------------------------------------
     Hero chart: flight, clocks, cursor coordinates
     ------------------------------------------------------------------ */
  var chart = $('[data-chart]');
  if (chart) initChart(chart);

  function initChart(chart) {
    var svg = $('svg', chart);
    var route = $('[data-route]', chart);
    var plane = $('[data-plane]', chart);
    var wps = $$('.wp', chart);
    var leg = $('.chart__leg', chart);
    var readout = $('[data-readout]', chart);
    var cursor = $('[data-cursor]', chart);
    var L = route.getTotalLength();
    var PARK = 0.955; // rest on final approach, just short of KJFK, so the waypoint stays legible

    function placePlane(t) {
      var l = clamp(t, 0, 1) * L;
      var a = route.getPointAtLength(Math.max(0, l - 2));
      var b = route.getPointAtLength(Math.min(L, l + 2));
      var p = route.getPointAtLength(l);
      var ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90;
      plane.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')');
    }

    function land() {
      chart.classList.remove('is-flying');
      chart.classList.add('is-landed');
      wps.forEach(function (w) { w.classList.add('is-on'); });
      leg.classList.add('is-on');
      placePlane(PARK);
    }

    // Set the scan distance for the print effect
    chart.style.setProperty('--chart-h', svg.getBoundingClientRect().height + 'px');

    if (!motionOK()) {
      land();
    } else {
      var DURATION = 2300, DELAY = 1050, start = null;
      chart.classList.add('is-flying');
      placePlane(0);
      var step = function (now) {
        if (start === null) start = now;
        var raw = clamp((now - start - DELAY) / DURATION, 0, 1);
        var t = easeInOutCubic(raw);
        chart.style.setProperty('--route-off', (1 - t).toFixed(4));
        if (now - start >= DELAY - 250) {
          wps.forEach(function (w) { if (t >= parseFloat(w.dataset.wp) - 0.001) w.classList.add('is-on'); });
          if (wps[2]) wps[2].classList.add('is-on'); // origin shows as soon as the flight begins
        }
        if (t > 0.45) leg.classList.add('is-on');
        placePlane(t * PARK);
        if (raw < 1) requestAnimationFrame(step); else land();
      };
      requestAnimationFrame(step);
    }

    // Live clocks for Bogotá and New York
    var clocks = $$('[data-tz]', chart);
    function tick() {
      var now = new Date();
      clocks.forEach(function (el) {
        try {
          el.textContent = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: el.dataset.tz }).format(now);
        } catch (e) { el.textContent = ''; }
      });
    }
    tick();
    setTimeout(function () { tick(); setInterval(tick, 60000); }, (60 - new Date().getSeconds()) * 1000 + 50);

    // Inverse Lambert conformal conic (matches the projection the chart was baked with)
    var RAD = Math.PI / 180, P1 = 12 * RAD, P2 = 36 * RAD, K = 970.3429521230693, TX = 320, TY = 861.7582851715731, ROT = 74;
    var tn = function (p) { return Math.tan(Math.PI / 4 + p / 2); };
    var N = Math.log(Math.cos(P1) / Math.cos(P2)) / Math.log(tn(P2) / tn(P1));
    var F = Math.cos(P1) * Math.pow(tn(P1), N) / N;
    function invert(sx, sy) {
      var x = (sx - TX) / K, y = (TY - sy) / K, fy = F - y;
      var r = Math.sign(N) * Math.sqrt(x * x + fy * fy);
      var l = Math.atan2(x, Math.abs(fy)) * Math.sign(fy);
      if (fy * N < 0) l -= Math.PI * Math.sign(x) * Math.sign(fy);
      return [l / N / RAD - ROT, (2 * Math.atan(Math.pow(F / r, 1 / N)) - Math.PI / 2) / RAD];
    }
    function dms(v, pos, neg) {
      var a = Math.abs(v), d = Math.floor(a), m = Math.round((a - d) * 60);
      if (m === 60) { d += 1; m = 0; }
      return d + '°' + (m < 10 ? '0' : '') + m + '′' + (v >= 0 ? pos : neg);
    }
    var defaultReadout = readout.textContent;
    var lines = $$('line', cursor);
    var pt = svg.createSVGPoint();
    svg.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      pt.x = e.clientX; pt.y = e.clientY;
      var p = pt.matrixTransform(svg.getScreenCTM().inverse());
      var ll = invert(p.x, p.y);
      readout.textContent = dms(ll[1], 'N', 'S') + ' ' + dms(ll[0], 'E', 'W');
      lines[0].setAttribute('y1', p.y); lines[0].setAttribute('y2', p.y);
      lines[1].setAttribute('x1', p.x); lines[1].setAttribute('x2', p.x);
      chart.classList.add('is-tracking');
    });
    svg.addEventListener('pointerleave', function () {
      chart.classList.remove('is-tracking');
      readout.textContent = defaultReadout;
    });
  }

  /* ------------------------------------------------------------------
     Compass rose behind the portrait (built here to keep the HTML light)
     ------------------------------------------------------------------ */
  var compass = $('[data-compass]');
  if (compass) {
    var NS = 'http://www.w3.org/2000/svg', frag = document.createDocumentFragment();
    var add = function (tag, attrs) { var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); frag.appendChild(n); return n; };
    add('circle', { r: 78 });
    for (var deg = 0; deg < 360; deg += 5) {
      var major = deg % 30 === 0, len = major ? 9 : (deg % 10 === 0 ? 6 : 3.5);
      var s = Math.sin(deg * Math.PI / 180), c = -Math.cos(deg * Math.PI / 180);
      add('line', { x1: (s * 78).toFixed(2), y1: (c * 78).toFixed(2), x2: (s * (78 - len)).toFixed(2), y2: (c * (78 - len)).toFixed(2), class: major ? 'major' : '' });
      if (major) {
        var t = add('text', { x: (s * 90).toFixed(2), y: (c * 90 + 2.5).toFixed(2), class: deg === 0 ? 'north' : '' });
        t.textContent = deg === 0 ? 'N' : String(deg / 10);
      }
    }
    compass.appendChild(frag);
  }

  /* ------------------------------------------------------------------
     Logbook odometer
     ------------------------------------------------------------------ */
  $$('[data-odo]').forEach(function (el) {
    var text = el.textContent.trim();
    var sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = text;
    var vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true'); vis.className = 'odo';
    var col = 0;
    text.split('').forEach(function (ch) {
      if (/\d/.test(ch)) {
        var c = document.createElement('span'); c.className = 'odo__col';
        var strip = document.createElement('span'); strip.className = 'odo__strip';
        strip.style.setProperty('--d', ch);
        strip.style.setProperty('--c', col++);
        for (var i = 0; i <= 9; i++) { var d = document.createElement('span'); d.textContent = i; strip.appendChild(d); }
        c.appendChild(strip); vis.appendChild(c);
      } else {
        var s = document.createElement('span'); s.textContent = ch; vis.appendChild(s);
      }
    });
    el.textContent = '';
    el.classList.remove('odo');
    el.appendChild(sr); el.appendChild(vis);
  });

  /* ------------------------------------------------------------------
     Defense-in-depth diagram: sweep timing + linked highlighting
     ------------------------------------------------------------------ */
  var layers = $('[data-layers]');
  var layerList = $('[data-layer-list]');
  if (layers) {
    var SWEEP = 2400;
    $$('.blip', layers).forEach(function (b) {
      var m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(b.getAttribute('transform'));
      if (!m) return;
      var ang = Math.atan2(parseFloat(m[1]) - 240, -(parseFloat(m[2]) - 240)) * 180 / Math.PI;
      if (ang < 0) ang += 360;
      b.style.setProperty('--sweep-at', Math.round(ang / 360 * SWEEP) + 'ms');
    });
    var setActive = function (name) {
      if (name) layers.dataset.active = name; else delete layers.dataset.active;
      if (layerList) $$('li', layerList).forEach(function (li) { li.classList.toggle('is-active', li.dataset.layer === name); });
    };
    var bind = function (el) {
      el.addEventListener('pointerenter', function () { setActive(el.dataset.layer); });
      el.addEventListener('pointerleave', function () { setActive(null); });
    };
    $$('.layers__ring', layers).forEach(bind);
    if (layerList) $$('li', layerList).forEach(bind);
  }

  /* ------------------------------------------------------------------
     Checklist stagger indices
     ------------------------------------------------------------------ */
  $$('[data-checklist] li').forEach(function (li, i) { li.style.setProperty('--i', i); });

  /* ------------------------------------------------------------------
     Globe: load D3 + data only when the projects section approaches
     ------------------------------------------------------------------ */
  var globeEl = $('[data-globe]');
  if (globeEl && 'IntersectionObserver' in window) {
    var gio = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      gio.disconnect();
      import('./globe.js').then(function (m) { m.initGlobe(globeEl, { motionOK: motionOK }); })
        .catch(function () { globeEl.hidden = true; });
    }, { rootMargin: '400px 0px' });
    gio.observe(globeEl);
  }

  /* ------------------------------------------------------------------
     Copy email
     ------------------------------------------------------------------ */
  var copyBtn = $('[data-copy]');
  if (copyBtn && navigator.clipboard) {
    var label = $('[data-copy-label]', copyBtn);
    var status = $('[data-copy-status]');
    var timer;
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(copyBtn.dataset.copy).then(function () {
        copyBtn.classList.add('is-copied');
        label.textContent = 'Copied';
        status.textContent = 'Email address copied to the clipboard';
        clearTimeout(timer);
        timer = setTimeout(function () { copyBtn.classList.remove('is-copied'); label.textContent = 'Copy address'; status.textContent = ''; }, 2200);
      }, function () {
        label.textContent = 'Press Ctrl+C to copy';
      });
    });
  } else if (copyBtn) {
    copyBtn.hidden = true;
  }

  /* Code blocks that scroll sideways get keyboard focus so they can be scrolled with arrow keys */
  function codeFocus() {
    $$('.prose pre').forEach(function (pre, i) {
      var scrolls = pre.scrollWidth > pre.clientWidth + 1;
      pre.toggleAttribute('tabindex', scrolls);
      if (scrolls) { pre.tabIndex = 0; pre.setAttribute('role', 'region'); pre.setAttribute('aria-label', 'Code example ' + (i + 1)); }
      else { pre.toggleAttribute('role', false); pre.toggleAttribute('aria-label', false); }
    });
  }
  if ($('.prose pre')) { codeFocus(); window.addEventListener('resize', codeFocus); }

  var year = $('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
})();
