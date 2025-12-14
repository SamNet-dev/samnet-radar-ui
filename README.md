# SamNet Radar UI

A modern, smooth **Leaflet-based aircraft radar UI** for visualizing **ADS-B / dump1090** traffic in real time.  
Built for **SamNet** to display a local receiver feed (Raspberry Pi + RTL-SDR), with a fast, mobile-friendly interface.

---

## What this is

SamNet Radar UI is a lightweight front-end that:

- Reads a dump1090-style `aircraft.json` feed
- Draws aircraft as rotating plane icons on a map
- Animates motion smoothly between updates (no “jumping”)
- Lets you search, filter, follow a selected aircraft, and view details

It is designed to be **simple to host** (static files) while still feeling like a “real radar app”.

---

## Features

### Live map + smooth animation
- Smooth aircraft movement between polling cycles
- Heading derived from track and/or motion bearing
- Emergency aircraft highlighting (7700 / 7600 / 7500)

### UI / Controls
- **Aircraft list drawer** with:
  - search (callsign/hex/type/squawk)
  - sort by altitude, speed, or callsign
  - filters (all / ground / airborne / emergency)
  - KPI tiles (tracked count, max altitude, max speed)
- **Altitude color legend**
- **Theme toggle** (dark / light / satellite)
- **Speed units** toggle (knots / mph)
- **Follow mode** for selected aircraft
- **Range ring** toggle (shows estimated max reception radius)
- **Airport drawer** (DFW/DAL) with:
  - quick “flight ops” estimate based on wind direction
  - basic visibility display
  - sunrise/sunset and live conditions

### Data enhancements
- Best-effort aircraft naming (ICAO type → friendly name)
- Airline guess from flight prefix (AAL/UAL/SWA/etc.)
- Country flag/name from registration or hex heuristics (best-effort)
- Plane photo lookup (cached) via PlaneSpotters API (optional)

### Performance
- Avoids heavy DOM rebuilds when not needed
- Updates list only when drawer is open
- Updates popup dynamically when open (instead of rebuilding HTML constantly)
- Pauses polling when the tab is hidden (saves CPU/bandwidth)

---

## Requirements

This project is **static** (no build system required). You only need:

- A web server (Nginx / Apache / GitHub Pages / Python http.server)
- A compatible JSON feed (dump1090 / readsb style)

---

## Data feed format

By default the UI loads:

- `/radar-data/aircraft.json`

Expected JSON structure:

```json
{
  "now": 1730000000,
  "messages": 12345,
  "aircraft": [
    {
      "hex": "a1b2c3",
      "flight": "AAL123",
      "lat": 32.9,
      "lon": -97.0,
      "alt_baro": 32000,
      "gs": 430,
      "track": 270,
      "seen": 1.2,
      "squawk": "1200",
      "type": "B738",
      "baro_rate": 0
    }
  ]
}
