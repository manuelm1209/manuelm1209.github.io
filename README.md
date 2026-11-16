# manuelmontoya.dev

Personal site of **Manuel Montoya**: Senior Software Engineer at Endeavor Global, former Colombian Air Force pilot, founder.

## Design: "chart and logbook"

The site borrows the visual language of aeronautical charts to tell a pilot-to-engineer story.

- **Hero chart.** A real Lambert conformal conic chart (the projection used on sectional charts), baked from Natural Earth data. The route flies from Bogotá (SKBO), over Barranquilla (SKBQ), to New York (KJFK): 2,158 nm along nearly the same meridian. It shows live local clocks and a cursor coordinate readout computed with the inverse projection.
- **Palette.** Cool chart paper, navy chart ink, route magenta (the only accent) and airspace blue. A "night chart" dark theme is revealed with a circular View Transition from the toggle.
- **Type.** Archivo, a variable font with width and weight axes. The name "takes off" from condensed to wide on load.
- **Sections.**
  - About: logbook totals with odometer digits and a compass rose.
  - Endeavor: a defense-in-depth diagram with a radar-sweep reveal.
  - Experience: a flight log whose route is drawn as you scroll.
  - Skills: a pre-flight checklist that runs item by item.
  - Projects: a D3 globe of Endeavor's network, plus cyanotype images that develop to colour on hover.
  - Writing: posts that morph into their article page via cross-document View Transitions.
- **Accessibility.**
  - Semantic HTML with a skip link, visible focus and 44px touch targets on touch screens.
  - Zero axe-core violations (WCAG 2.1 AA) in both themes.
  - With `prefers-reduced-motion`, the page renders in its final state.

## Structure

```
index.html            Home page
sql.html, snort2.html, okr.html   Articles (Spanish)
css/site.css          Design tokens, layout, components, motion
js/site.js            Theme, nav, hero flight, reveals, scroll-linked flight log
js/globe.js           Lazy-loaded globe (canvas + d3-geo)
js/vendor/geo.min.js  Bundled subset of d3-geo and topojson-client (ISC)
data/countries-110m.json   Natural Earth countries (via world-atlas)
map/                  Multiplier Effect: full D3 globe project
tools/bake-chart.mjs  Regenerates the hero chart geometry
```

## Run locally

No build step. Serve the folder with any static server:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Contact

[manuelm1209@gmail.com](mailto:manuelm1209@gmail.com) · [LinkedIn](https://www.linkedin.com/in/manuel-montoya-col/) · [GitHub](https://github.com/manuelm1209)
