# Florida Blue Watch

**A real-time coastal ecosystem monitoring platform for 
Florida's Reef Tract and associated seagrass systems.**

Built by [Collin Hanson](https://github.com/collin-hanson) — 
sustainability professional, LEED Green Associate, B.S. 
Coastal Resilience, Coastal Carolina University.

🌊 **Live site:** https://collin-hanson.github.io/florida-blue-watch

This project grew out of undergraduate capstone research 
exploring the economic interconnection between South 
Florida's coral reefs and the local economy. It combines 
sustainability domain expertise with live data integration, 
interactive data visualization, and modern web development.

**Key data highlights:**
- $8.5B ecosystem asset value
- $4.4B in annual reef-dependent sales
- 70,400 jobs supported
- $675M in annual flood protection
- Live bleaching alerts from NOAA Coral Reef Watch

---

# Florida Blue Watch Dashboard

A lightweight static dashboard for monitoring **Florida’s coastal ecosystem health** (coral reef + seagrass context), featuring:

- **Overview**: map + project context
- **Marine Health**: live conditions for Florida Keys + Southeast Florida, plus a static Seagrass Health card
- **Economy**: economic value summary and a Chart.js bar chart
- **Conservation**: curated news feed with search + filters

## Live data sources

- **Coral / thermal stress data**: Coral station API (proxied through `corsproxy.io`)  
  Implemented in `js/api.js`.
- **Displayed metrics** (Marine Health):
  - SST: `current.sst_max`
  - DHW: `current.dhw`
  - Alert level: `current.stress_level` (fallback: `current.baa_7day_max`)

## Run locally

This is a static site—any simple local server works.

### Option A: `npx serve`

```bash
npx serve .
```

### Option B: VS Code / Cursor Live Server

Open `index.html` with your preferred live server extension.

## Project structure

- `index.html`: tab panels + page markup
- `css/style.css`: global styling + layout
- `js/app.js`: tab switching, Chart.js initialization, conservation news rendering/filtering
- `js/api.js`: fetch + render live Marine Health values
- `assets/`: images and static assets

## Notes

- Live network calls only occur when the **Marine Health** tab is opened.
- Charts render on-demand when their tab is activated (Marine Health and Economy).

