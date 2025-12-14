/* SamNet Live Radar - app.js (module) */

(() => {
  // ===== Config =====
  // Feed selection:
  // - ?feed=https://example.com/aircraft.json overrides everything
  // - Otherwise default:
  //   - on samnet.dev => https://<origin>/radar-data/aircraft.json
  //   - elsewhere (GitHub Pages) => ./radar-data/aircraft.json
  const qs = new URLSearchParams(location.search);
  const FEED_OVERRIDE = qs.get("feed");

  const DEFAULT_FEED =
    (location.hostname.endsWith("samnet.dev"))
      ? `${location.origin}/radar-data/aircraft.json`
      : new URL("./radar-data/aircraft.json", location.href).toString();

  const AIRCRAFT_URL = FEED_OVERRIDE || DEFAULT_FEED;

  const POLL_MS = 2000;

  // Networking safety
  const FETCH_TIMEOUT_MS = Math.max(1200, Math.min(1900, POLL_MS - 100));

  // ===== Constants =====
  const DFW_LAT = 32.8998;
  const DFW_LON = -97.0403;
  const DFW_ZOOM = 8;

  const START_LAT = DFW_LAT;
  const START_LON = DFW_LON;
  const START_ZOOM = DFW_ZOOM;

  const SOUTH_WEST = L.latLng(10.0, -170.0);
  const NORTH_EAST = L.latLng(85.0, -50.0);
  const MAP_BOUNDS = L.latLngBounds(SOUTH_WEST, NORTH_EAST);

  const KTS_TO_MPH = 1.15078;

  // ===== DOM =====
  const mapEl = document.getElementById('map');
  const toast = document.getElementById('toast');
  const badgeCount = document.getElementById('badgeCount');
  const planeCountEl = document.getElementById('planeCount');
  const unitLabelEl = document.getElementById('unitLabel');
  const maxAltEl = document.getElementById('maxAlt');
  const maxSpdEl = document.getElementById('maxSpd');
  const modePill = document.getElementById('modePill');
  const lastUpdateEl = document.getElementById('lastUpdate');
  const ctTimeEl = document.getElementById('ctTime');
  const utcTimeEl = document.getElementById('utcTime');

  const btnList = document.getElementById('btnList');
  const closeList = document.getElementById('closeList');
  const drawerList = document.getElementById('drawerList');

  const btnLegend = document.getElementById('btnLegend');
  const legendPanel = document.getElementById('legendPanel');
  const closeLegend = document.getElementById('closeLegend');

  const btnTheme = document.getElementById('btnTheme');
  const btnSpeedUnit = document.getElementById('btnSpeedUnit');
  const speedBadge = document.getElementById('speedBadge');

  const btnFollow = document.getElementById('btnFollow');
  const followIcon = document.getElementById('followIcon');

  const btnRangeRing = document.getElementById('btnRangeRing');
  const ringBadge = document.getElementById('ringBadge');

  const btnAbout = document.getElementById('btnAbout');
  const closeAbout = document.getElementById('closeAbout');
  const aboutModal = document.getElementById('aboutModal');
  const aboutBackdrop = document.getElementById('aboutBackdrop');

  const btnCenter = document.getElementById('btnCenter');
  const searchInput = document.getElementById('search');
  const sortBy = document.getElementById('sortBy');
  const listEl = document.getElementById('list');
  const kpiTotal = document.getElementById('kpiTotal');
  const kpiHigh = document.getElementById('kpiHigh');
  const kpiFast = document.getElementById('kpiFast');
  const filterContainer = document.getElementById('filterContainer');

  const aboutNav = document.getElementById('aboutNav');
  const aboutTitle = document.getElementById('aboutTitle');
  const aboutText = document.getElementById('aboutText');
  const aboutExtra = document.getElementById('aboutExtra');

  // Theme Icons
  const iconMoon = document.getElementById('iconMoon');
  const iconSun  = document.getElementById('iconSun');
  const iconSat  = document.getElementById('iconSat');

  // Weather & Airport UI
  const drawerAirport = document.getElementById('drawerAirport');
  const drawerAirportHeader = document.getElementById('drawerAirportHeader');
  const closeAirport = document.getElementById('closeAirport');
  const btnExternalBoard = document.getElementById('btnExternalBoard');
  const aptTitle = document.getElementById('aptTitle');
  const aptName = document.getElementById('aptName');
  const aptLocalTime = document.getElementById('aptLocalTime');
  const wxCategory = document.getElementById('wxCategory');
  const wxTemp = document.getElementById('wxTemp');
  const wxWind = document.getElementById('wxWind');
  const wxRaw = document.getElementById('wxRaw');
  const sunRise = document.getElementById('sunRise');
  const sunSet = document.getElementById('sunSet');
  const listDep = document.getElementById('listDep');
  const listArr = document.getElementById('listArr');
  const countDep = document.getElementById('countDep');
  const countArr = document.getElementById('countArr');

  // Ops Dashboard Elements
  const opsFlow = document.getElementById('opsFlow');
  const opsFlowSub = document.getElementById('opsFlowSub');
  const opsFlowIcon = document.getElementById('opsFlowIcon');
  const opsVis = document.getElementById('opsVis');
  const opsVisBar = document.getElementById('opsVisBar');

  // ===== Preferences =====
  const PREF_KEY = "samnet_radar_prefs_v1";
  const loadPrefs = () => {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); }
    catch { return {}; }
  };
  const savePrefs = (p) => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {}
  };
  const prefs = loadPrefs();

  // ===== State =====
  let themeMode = Number.isFinite(prefs.themeMode) ? (prefs.themeMode % 3) : 0; // 0=Dark, 1=Light, 2=Sat
  let speedUnit = (prefs.speedUnit === "mph" || prefs.speedUnit === "kts") ? prefs.speedUnit : "kts";
  let followSelected = !!prefs.followSelected;
  let currentFilter = "all";
  let showRangeRing = !!prefs.showRangeRing;

  let rangeRing = null;
  let rangeHalo = null;
  let rangeEMAkm = 0;

  const RANGE_CAP_KM = 800;
  const RANGE_MIN_KM = 60;
  const RANGE_SMOOTH = 0.35;

  const ICAO_DB = {
    "A319": "Airbus A319", "A320": "Airbus A320", "A321": "Airbus A321", "A20N": "A320neo", "A21N": "A321neo",
    "A332": "A330-200", "A333": "A330-300", "A339": "A330-900", "A359": "A350-900", "A388": "A380-800",
    "B737": "B737-700", "B738": "B737-800", "B739": "B737-900", "B38M": "737 MAX 8", "B39M": "737 MAX 9",
    "B744": "B747-400", "B748": "B747-8", "B752": "B757-200", "B763": "B767-300", "B772": "B777-200",
    "B773": "B777-300", "B77W": "B777-300ER", "B788": "B787-8", "B789": "B787-9", "B78X": "B787-10",
    "E145": "ERJ-145", "E170": "E170", "E175": "E175", "E190": "E190", "CRJ2": "CRJ-200",
    "CRJ7": "CRJ-700", "CRJ9": "CRJ-900", "C172": "C172 Skyhawk", "SR22": "Cirrus SR22"
  };
  const AIRLINE_DB = {
    "AAL": "American", "UAL": "United", "DAL": "Delta", "SWA": "Southwest", "NKS": "Spirit",
    "JBU": "JetBlue", "FFT": "Frontier", "ASA": "Alaska", "UPS": "UPS", "FDX": "FedEx",
    "ENY": "Envoy", "SKW": "SkyWest", "JIA": "PSA", "RPA": "Republic", "GJS": "GoJet",
    "QXE": "Horizon", "BAW": "British Airways", "DLH": "Lufthansa", "AFR": "Air France",
    "QFA": "Qantas", "UAE": "Emirates", "QTR": "Qatar"
  };

  const COUNTRY_DB = {
    "N": { flag: "🇺🇸", name: "United States" },
    "C": { flag: "🇨🇦", name: "Canada" },
    "G": { flag: "🇬🇧", name: "United Kingdom" },
    "D": { flag: "🇩🇪", name: "Germany" },
    "F": { flag: "🇫🇷", name: "France" },
    "I": { flag: "🇮🇹", name: "Italy" },
    "J": { flag: "🇯🇵", name: "Japan" },
    "B": { flag: "🇨🇳", name: "China" },
    "H": { flag: "🇰🇷", name: "South Korea" },
    "9V": { flag: "🇸🇬", name: "Singapore" },
    "A6": { flag: "🇦🇪", name: "UAE" },
    "A7": { flag: "🇶🇦", name: "Qatar" },
    "VH": { flag: "🇦🇺", name: "Australia" },
    "ZK": { flag: "🇳🇿", name: "New Zealand" },
    "XA": { flag: "🇲🇽", name: "Mexico" },
    "XB": { flag: "🇲🇽", name: "Mexico" },
    "XC": { flag: "🇲🇽", name: "Mexico" },
    "EI": { flag: "🇮🇪", name: "Ireland" },
    "PH": { flag: "🇳🇱", name: "Netherlands" },
    "HB": { flag: "🇨🇭", name: "Switzerland" },
    "OE": { flag: "🇦🇹", name: "Austria" },
    "CS": { flag: "🇵🇹", name: "Portugal" },
    "EC": { flag: "🇪🇸", name: "Spain" },
    "OO": { flag: "🇧🇪", name: "Belgium" },
    "SE": { flag: "🇸🇪", name: "Sweden" },
    "OH": { flag: "🇫🇮", name: "Finland" },
    "OY": { flag: "🇩🇰", name: "Denmark" },
    "LN": { flag: "🇳🇴", name: "Norway" },
    "TC": { flag: "🇹🇷", name: "Turkey" },
    "4X": { flag: "🇮🇱", name: "Israel" },
    "VT": { flag: "🇮🇳", name: "India" },
    "9M": { flag: "🇲🇾", name: "Malaysia" },
    "PK": { flag: "🇵🇰", name: "Pakistan" },
    "PR": { flag: "🇧🇷", name: "Brazil" },
    "PP": { flag: "🇧🇷", name: "Brazil" },
    "PT": { flag: "🇧🇷", name: "Brazil" },
    "LV": { flag: "🇦🇷", name: "Argentina" },
    "CC": { flag: "🇨🇱", name: "Chile" }
  };

  function getCountry(reg, hex) {
    if (reg) {
      reg = String(reg).toUpperCase();
      const keys = Object.keys(COUNTRY_DB).sort((a,b) => b.length - a.length);
      for (const k of keys) if (reg.startsWith(k)) return COUNTRY_DB[k];
    }
    if (hex) {
      hex = String(hex).toLowerCase();
      if (hex >= 'a00000' && hex <= 'afffff') return COUNTRY_DB['N'];
      if (hex >= 'c00000' && hex <= 'c3ffff') return COUNTRY_DB['C'];
      if (hex >= '0d0000' && hex <= '0dffff') return COUNTRY_DB['XA'];
    }
    return { flag: "🏳️", name: "Unknown" };
  }

  const AIRPORTS = [
    {
      code: 'KDFW',
      short:'DFW',
      name: 'Dallas/Fort Worth Intl',
      lat: 32.8998,
      lon: -97.0403,
      bg: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=1200&auto=format&fit=crop",
      link: "https://www.flightaware.com/live/airport/KDFW"
    },
    {
      code: 'KDAL',
      short:'DAL',
      name: 'Dallas Love Field',
      lat: 32.8471,
      lon: -96.8517,
      bg: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=1200&auto=format&fit=crop",
      link: "https://www.flightaware.com/live/airport/KDAL"
    }
  ];

  const ABOUT_SECTIONS = [
    {
      id: "aircraft",
      title: "Aircraft (ADS-B)",
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`,
      text: `
        SamNet Radar tracks aircraft by listening to <b>ADS-B broadcasts on 1090&nbsp;MHz</b>.
        Every plane in range sends its position, altitude, speed, and identity over the air.
        What you see here is live RF decoded locally near DFW — not a third-party API.
      `,
      extras: [
        ["Live fields", "Callsign, HEX, altitude, speed, heading, last-seen"],
        ["Update rate", "Refreshed every 2 seconds from the local receiver"]
      ]
    },
    {
      id: "antenna",
      title: "1090 MHz Antenna",
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v6"/><path d="M5 9h14"/><path d="M7 9l-2 13h14l-2-13"/></svg>`,
      text: `
        A tuned high-gain antenna captures ADS-B radio signals from aircraft overhead.
        Elevation, line-of-sight, and low-loss coax directly affect how far SamNet can see.
      `,
      extras: [
        ["Receiver site", "Dallas / Fort Worth (DFW) metro"],
        ["Range ring", "Optional ring showing current max reception radius"]
      ]
    },
    {
      id: "sdr",
      title: "Pi Zero + RTL-SDR",
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/></svg>`,
      text: `
        SamNet uses an RTL-SDR USB dongle on a Raspberry Pi Zero W running <b>dump1090</b>.
        The Pi converts raw RF into decoded aircraft messages and publishes them as a local JSON feed.
      `,
      extras: [
        ["Pipeline", "RTL-SDR → dump1090 → aircraft.json → SamNet Radar"],
        ["Why local", "Low latency, privacy-first tracking"]
      ]
    },
    {
      id: "ui",
      title: "SamNet Radar UI",
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/></svg>`,
      text: `
        This page is SamNet’s custom live map for local ADS-B traffic.
        Plane colors represent altitude, and speed can be shown in knots or mph.
        Headings are derived from real movement so plane icons point where they’re going.
      `,
      extras: [
        ["Controls", "Aircraft list, legend, theme, units, follow mode, range ring"],
        ["Mobile ready", "Designed for phones, tablets, and desktops"]
      ]
    },
    {
      id: "tar1090",
      title: "TAR1090 & Raw Data",
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><circle cx="12" cy="16" r="1"/></svg>`,
      text: `
        SamNet also runs <b>TAR1090</b> for a more detailed, traditional radar view.
        <a href="https://www.samnet.dev/radar/raw/" target="_blank"
           class="text-sky-400 hover:text-sky-300 underline decoration-dotted">
           Open TAR1090 Interface
        </a>
        <br><br>
        To inspect the raw JSON feed that powers SamNet Radar,
        <a href="https://www.samnet.dev/radar-data/aircraft.json" target="_blank"
           class="text-sky-400 hover:text-sky-300 underline decoration-dotted">
           view the raw aircraft.json data
        </a>.
      `,
      extras: [
        ["TAR1090", "Detailed view at /radar/raw/"],
        ["Raw Data", "JSON endpoint at /radar-data/aircraft.json"],
      ]
    }
  ];

  function getAircraftName(t) { return ICAO_DB[t] || t || "Unknown"; }

  // ===== Helpers =====
  function altitudeColor(altFt) {
    if (altFt == null || altFt < 1000) return "#94a3b8";
    if (altFt < 10000) return "#22c55e";
    if (altFt < 20000) return "#38bdf8";
    if (altFt < 30000) return "#f59e0b";
    if (altFt < 40000) return "#f97316";
    return "#fb7185";
  }
  const fmtAlt = n => (n || n === 0) ? Math.round(n).toLocaleString() : "0";
  const fmtSeen = s => (s || s === 0) ? (Math.round(s) + "s") : "--";
  function fmtSpd(kts) { return Math.round(speedUnit === "mph" ? (kts || 0) * KTS_TO_MPH : (kts || 0)).toString(); }
  function spdUnitLabel() { return speedUnit === "mph" ? "mph" : "kts"; }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2-lat1)*Math.PI/180;
    const dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function bearingDeg(lat1, lon1, lat2, lon2) {
    const toRad = d => d * Math.PI/180;
    const y = Math.sin(toRad(lon2-lon1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1))*Math.sin(toRad(lat2)) - Math.sin(toRad(lat1))*Math.cos(toRad(lat2))*Math.cos(toRad(lon2-lon1));
    return (Math.atan2(y, x) * 180/Math.PI + 360) % 360;
  }
  function lerp(a,b,t){ return a + (b-a)*t; }
  function angleDiffDeg(a, b){
    const d = ((a - b + 540) % 360) - 180;
    return Math.abs(d);
  }

  function createPlaneIconHTML(rotation = 0, altFt = 0, selected = false, isEmergency = false) {
    const color = isEmergency ? "#ef4444" : altitudeColor(altFt);
    const containerClass = `plane-container ${selected ? "plane-selected" : ""} ${isEmergency ? "plane-emergency" : ""}`;
    return `<div style="position:relative;"><svg class="${containerClass}" style="transform: rotate(${rotation}deg);" width="32" height="32" viewBox="0 0 24 24"><path class="plane-path" style="fill:${color};" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg></div>`;
  }
  function createPlaneDivIcon(rotation = 0, altFt = 0, selected = false, isEmergency = false) {
    return L.divIcon({ className: 'bg-transparent', html: createPlaneIconHTML(rotation, altFt, selected, isEmergency), iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -10] });
  }
  function updateMarkerVisual(marker, rotation, altFt, selected, isEmergency) {
    const el = marker.getElement();
    if (el) {
      const container = el.querySelector('.plane-container');
      const path = el.querySelector('.plane-path');
      const color = isEmergency ? "#ef4444" : altitudeColor(altFt);
      if (container) {
        container.style.transform = `rotate(${rotation}deg)`;
        container.classList.toggle('plane-selected', !!selected);
        container.classList.toggle('plane-emergency', !!isEmergency);
      }
      if (path) {
        path.style.fill = color;
        path.style.stroke = isEmergency ? "#7f1d1d" : "";
      }
    } else {
      marker.setIcon(createPlaneDivIcon(rotation, altFt, selected, isEmergency));
    }
  }

  // ===== Map Setup =====
  const map = L.map('map', {
    zoomControl: false,
    center: [START_LAT, START_LON],
    zoom: START_ZOOM,
    minZoom: 3,
    maxBounds: MAP_BOUNDS,
    maxBoundsViscosity: 0.8,
    attributionControl: false
  });

  // Needed for inline onclick strings used in some HTML builders
  window.map = map;

  L.control.attribution({ prefix: false })
    .addAttribution('&copy; OpenStreetMap &copy; SamNet')
    .addTo(map);

  const darkLayer  = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',  { maxZoom: 19, updateWhenIdle: true, keepBuffer: 2 });
  const lightLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, updateWhenIdle: true, keepBuffer: 2 });
  const satLayer   = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, updateWhenIdle: true, keepBuffer: 2 });

  function applyThemeUI() {
    map.removeLayer(darkLayer); map.removeLayer(lightLayer); map.removeLayer(satLayer);
    mapEl.classList.remove('theme-dark', 'theme-light', 'theme-sat');
    document.documentElement.classList.remove('dark');

    iconMoon.classList.add('hidden'); iconSun.classList.add('hidden'); iconSat.classList.add('hidden');

    if (themeMode === 0) { darkLayer.addTo(map); mapEl.classList.add('theme-dark'); document.documentElement.classList.add('dark'); iconMoon.classList.remove('hidden'); }
    else if (themeMode === 1) { lightLayer.addTo(map); mapEl.classList.add('theme-light'); iconSun.classList.remove('hidden'); }
    else { satLayer.addTo(map); mapEl.classList.add('theme-sat'); document.documentElement.classList.add('dark'); iconSat.classList.remove('hidden'); }
  }
  applyThemeUI();

  // ===== Airport Markers =====
  AIRPORTS.forEach(apt => {
    const icon = L.divIcon({
      className: 'bg-transparent',
      html: `
        <div class="airport-marker-wrap">
          <div class="airport-pill">
            <div class="airport-dot"></div>
            ${apt.short}
          </div>
        </div>
      `,
      iconSize: [60, 30],
      iconAnchor: [30, 15]
    });
    const m = L.marker([apt.lat, apt.lon], { icon, zIndexOffset: -500 }).addTo(map);
    m.on('click', () => openAirportDrawer(apt));
  });

  // ===== Range Ring =====
  function ensureRangeRing() {
    if (rangeRing || rangeHalo) return;
    if (!map.getPane('rangeRingPane')) {
      const p = map.createPane('rangeRingPane');
      p.style.zIndex = 320;
      p.style.pointerEvents = 'none';
    }
    rangeHalo = L.circle([DFW_LAT, DFW_LON], { pane:'rangeRingPane', radius: RANGE_MIN_KM*1000, color:"#38bdf8", weight:8, opacity:0.12, fillOpacity:0, dashArray:"2 14", className:"range-halo" }).addTo(map);
    rangeRing = L.circle([DFW_LAT, DFW_LON], { pane:'rangeRingPane', radius: RANGE_MIN_KM*1000, color:"#7dd3fc", weight:2.8, opacity:0.9, fillColor:"#38bdf8", fillOpacity:0.035, dashArray:"8 10", className:"range-ring" }).addTo(map);
  }
  function removeRangeRing() {
    if (rangeRing) { map.removeLayer(rangeRing); rangeRing=null; }
    if (rangeHalo) { map.removeLayer(rangeHalo); rangeHalo=null; }
    rangeEMAkm = 0;
  }
  function updateRangeRing(list) {
    if (!showRangeRing) return;
    ensureRangeRing();
    let maxKm = 0;
    for (const ac of list) {
      if (ac?.lat == null) continue;
      const km = haversineKm(DFW_LAT, DFW_LON, ac.lat, ac.lon);
      if (km > maxKm) maxKm = km;
    }
    if (maxKm < RANGE_MIN_KM) maxKm = RANGE_MIN_KM;
    if (maxKm > RANGE_CAP_KM) maxKm = RANGE_CAP_KM;
    rangeEMAkm = rangeEMAkm === 0 ? maxKm : (rangeEMAkm * (1 - RANGE_SMOOTH) + maxKm * RANGE_SMOOTH);
    const rM = rangeEMAkm * 1000;
    rangeRing.setRadius(rM);
    rangeHalo.setRadius(rM * 1.03);
  }

  ringBadge.textContent = showRangeRing ? "ON" : "OFF";
  if (showRangeRing) { ensureRangeRing(); btnRangeRing.classList.add("border-sky-500/70"); }
  if (followSelected) { btnFollow.classList.add("border-sky-500/70"); followIcon.classList.add("text-sky-300"); }

  // ===== Airport Drawer + Weather =====
  let airportClockTimer = null;

  function updateLocalTime() {
    const now = new Date();
    aptLocalTime.textContent = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }
  function startAirportClock() {
    stopAirportClock();
    updateLocalTime();
    airportClockTimer = setInterval(updateLocalTime, 1000);
  }
  function stopAirportClock() {
    if (airportClockTimer) { clearInterval(airportClockTimer); airportClockTimer = null; }
  }

  async function fetchMetar(aptCode) {
    wxRaw.textContent = "Fetching Live Weather...";
    wxTemp.textContent = "--";
    wxWind.textContent = "--";
    wxCategory.textContent = "--";
    wxCategory.className = "text-[10px] font-bold px-2 py-0.5 rounded text-slate-900 bg-slate-600";

    opsFlow.textContent = "--";
    opsFlowSub.textContent = "Loading...";
    opsVis.textContent = "--";

    const lat = aptCode === 'KDFW' ? 32.8998 : 32.8471;
    const lon = aptCode === 'KDFW' ? -97.0403 : -96.8517;

    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,visibility&daily=sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`, { cache: "no-store" });
      if(!res.ok) throw new Error("Weather API Error");
      const data = await res.json();
      const curr = data.current;
      const daily = data.daily;

      if (curr?.temperature_2m != null) wxTemp.textContent = Math.round(curr.temperature_2m) + "°F";

      let windStr = "Calm";
      let windDir = 0;
      if (curr?.wind_speed_10m != null) {
        const mph = Math.round(curr.wind_speed_10m);
        let dir = "VAR";
        if (curr.wind_direction_10m != null) {
          windDir = curr.wind_direction_10m;
          const d = windDir;
          if (d >= 337.5 || d < 22.5) dir = "N";
          else if (d < 67.5) dir = "NE";
          else if (d < 112.5) dir = "E";
          else if (d < 157.5) dir = "SE";
          else if (d < 202.5) dir = "S";
          else if (d < 247.5) dir = "SW";
          else if (d < 292.5) dir = "W";
          else dir = "NW";
        }
        windStr = `${mph} mph ${dir}`;
      }
      wxWind.textContent = windStr;

      if (curr?.visibility != null) {
        const sm = curr.visibility * 0.000621371;
        let val = sm.toFixed(1);
        let width = 100;
        let color = "bg-emerald-500";

        if (sm >= 10) {
          val = "10+";
        } else {
          width = Math.max(5, (sm / 10) * 100);
          if (sm < 3) color = "bg-red-500";
          else if (sm < 5) color = "bg-blue-500";
          else color = "bg-emerald-500";
        }

        opsVis.textContent = val;
        opsVisBar.style.width = `${width}%`;
        opsVisBar.className = `h-full transition-all duration-700 ${color}`;
      }

      let isNorthFlow = true;
      if (windDir >= 100 && windDir <= 260) isNorthFlow = false;

      if (isNorthFlow) {
        opsFlow.textContent = "NORTH FLOW";
        opsFlowSub.textContent = "Landing 31/35/36";
        opsFlow.className = "text-sm font-black text-sky-400 mt-1";
      } else {
        opsFlow.textContent = "SOUTH FLOW";
        opsFlowSub.textContent = "Landing 13/17/18";
        opsFlow.className = "text-sm font-black text-emerald-400 mt-1";
      }

      opsFlowIcon.style.transform = `rotate(${(windDir + 180) % 360}deg)`;

      let cat = "VFR";
      let catClass = "cat-VFR";
      if (curr?.weather_code > 50) { cat = "MVFR"; catClass = "cat-MVFR"; }
      if (curr?.weather_code > 60 || curr?.weather_code === 45) { cat = "IFR"; catClass = "cat-IFR"; }

      wxCategory.textContent = cat;
      wxCategory.className = `text-[10px] font-bold px-2 py-0.5 rounded shadow-sm ${catClass}`;
      wxRaw.textContent = `OpenMeteo Live: ${curr.temperature_2m}°F, Wind ${windStr}`;

      if (daily?.sunrise?.[0]) {
        const rise = new Date(daily.sunrise[0]);
        const set = new Date(daily.sunset[0]);
        sunRise.textContent = rise.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        sunSet.textContent = set.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      }

    } catch (e) {
      console.error(e);
      wxRaw.textContent = "Weather data unavailable.";
    }
  }

  function openAirportDrawer(apt) {
    drawerAirport.classList.remove("-translate-x-full", "opacity-0");
    aptTitle.textContent = apt.short;
    aptName.textContent = apt.name;

    if (apt.bg) drawerAirportHeader.style.backgroundImage = `url('${apt.bg}')`;

    if (apt.link) {
      btnExternalBoard.href = apt.link;
      btnExternalBoard.style.display = "inline-flex";
    } else {
      btnExternalBoard.style.display = "none";
    }

    startAirportClock();
    fetchMetar(apt.code);
    updateAirportTraffic(apt);
  }

  function closeAirportDrawer() {
    drawerAirport.classList.add("-translate-x-full", "opacity-0");
    stopAirportClock();
  }
  closeAirport.onclick = closeAirportDrawer;

  // ===== List / Map State =====
  let markers = new Map();
  let selectedPlaneHex = null;
  let selectedStartAlt = null;
  let lastAircraft = [];
  let selectedPolyline = null;
  let selectedPath = [];
  const planeState = new Map();
  const movingPlanes = new Set();

  const photoCache = new Map();      // hex -> url|null
  const photoInflight = new Map();   // hex -> Promise
  const popupMeta = new Map();       // hex -> { lastKey: string }

  const MAX_TRAIL_POINTS = 280;

  function isListOpen() {
    return !drawerList.classList.contains('translate-x-full') && !drawerList.classList.contains('opacity-0');
  }
  let listDirty = true;

  function matchesFilter(ac, q) {
    if (q) {
      const h = [ac.flight, ac.hex, ac.r, ac.type, ac.squawk].filter(Boolean).join(" ").toLowerCase();
      if (!h.includes(q)) return false;
    }
    if (currentFilter === "ground" && (ac.alt_baro||0) > 3000) return false;
    if (currentFilter === "airborne" && (ac.alt_baro||0) < 500) return false;
    if (currentFilter === "emergency" && !['7700','7600','7500'].includes(ac.squawk)) return false;
    return true;
  }

  function updateKPIs(list) {
    kpiTotal.textContent = list.length;
    const maxAlt = list.reduce((m, a) => Math.max(m, a.alt_baro || 0), 0);
    const maxSpdKts = list.reduce((m, a) => Math.max(m, a.gs || 0), 0);
    const maxSpdShown = speedUnit === "mph" ? maxSpdKts * KTS_TO_MPH : maxSpdKts;
    kpiHigh.textContent = maxAlt ? fmtAlt(maxAlt) + " ft" : "--";
    kpiFast.textContent = maxSpdKts ? Math.round(maxSpdShown) + " " + spdUnitLabel() : "--";
    maxAltEl.textContent = maxAlt ? fmtAlt(maxAlt) : "--";
    maxSpdEl.textContent = maxSpdKts ? Math.round(maxSpdShown) : "--";
  }

  function setSelected(hex) {
    if (selectedPolyline) { map.removeLayer(selectedPolyline); selectedPolyline = null; }
    selectedPath = [];
    selectedPlaneHex = hex;
    selectedStartAlt = null;

    if (!hex) {
      listDirty = true;
      markers.forEach((m, h) => {
        const st = planeState.get(h);
        const isEmg = lastAircraft.some(a => a.hex === h && ['7700','7600','7500'].includes(a.squawk));
        if (st) updateMarkerVisual(m, st.currentRotation ?? st.hdg ?? 0, st.alt ?? 0, false, !!isEmg);
      });
      if (isListOpen()) renderList(lastAircraft);
      return;
    }

    const ac = lastAircraft.find(a => a.hex === hex);
    if (ac) {
      selectedStartAlt = ac.alt_baro || 0;
      if (ac.lat != null && ac.lon != null) {
        selectedPath.push([ac.lat, ac.lon]);
        selectedPolyline = L.polyline(selectedPath, { color: '#38bdf8', weight: 3, opacity: 0.9, dashArray: '10, 10', lineJoin: 'round' }).addTo(map);
      }
    }

    listDirty = true;
    markers.forEach((m, h) => {
      const st = planeState.get(h);
      const isEmg = lastAircraft.some(a => a.hex === h && ['7700','7600','7500'].includes(a.squawk));
      if (st) updateMarkerVisual(m, st.currentRotation ?? st.hdg ?? 0, st.alt ?? 0, h===selectedPlaneHex, !!isEmg);
    });
    if (isListOpen()) renderList(lastAircraft);
  }

  window.setSelected = setSelected;

  function renderList(list) {
    const q = (searchInput.value || "").trim().toLowerCase();
    const sortKey = sortBy.value;

    const filtered = list
      .filter(ac => ac?.lat != null && ac?.lon != null && matchesFilter(ac, q))
      .sort((a,b) => {
        const aE = ['7700','7600','7500'].includes(a.squawk);
        const bE = ['7700','7600','7500'].includes(b.squawk);
        if (aE && !bE) return -1;
        if (!aE && bE) return 1;
        if (sortKey === "flight") return (a.flight||"").localeCompare(b.flight||"");
        return (b[sortKey]||0) - (a[sortKey]||0);
      });

    listEl.innerHTML = "";

    const frag = document.createDocumentFragment();
    filtered.slice(0, 90).forEach(ac => {
      const hex = ac.hex;
      const selected = hex === selectedPlaneHex;
      const isEmergency = ['7700', '7600', '7500'].includes(ac.squawk);
      const rowClass = isEmergency
        ? "bg-red-500/10 border-red-500/30"
        : (selected ? "bg-sky-500/10 border-sky-400/40 shadow-[0_0_0_1px_rgba(56,189,248,0.25)]" : "bg-slate-900/40 border-transparent hover:border-sky-500/30 hover:bg-slate-800/70");

      const item = document.createElement("div");
      item.className = `cursor-pointer p-2 rounded-xl border transition flex justify-between items-center group ${rowClass}`;

      const iconRotation = (ac.track != null) ? `transform: rotate(${ac.track}deg);` : "";

      item.innerHTML = `
        <div class="min-w-0 flex items-center gap-3">
          <div class="w-8 h-8 flex items-center justify-center text-slate-400">
            <svg style="${iconRotation} transition: transform 0.3s;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2l4 10h6l-8 4 2 6-4-2-4 2 2-6-8-4h6z"/>
            </svg>
          </div>
          <div class="min-w-0">
            <div class="font-bold text-slate-200 text-xs group-hover:text-sky-300 truncate">${ac.flight ? String(ac.flight).trim() : "NO CALLSIGN"}</div>
            <div class="text-[10px] text-slate-500 font-mono truncate">${String(hex).toUpperCase()} ${ac.type ? "• " + ac.type : ""}</div>
            ${isEmergency ? `<div class="text-[9px] font-bold text-red-400 animate-pulse mt-0.5">SQUAWK ${ac.squawk}</div>` : ''}
          </div>
        </div>
        <div class="text-right shrink-0 pl-2">
          <div class="text-[11px] text-slate-200">${fmtAlt(ac.alt_baro)} ft</div>
          <div class="text-[10px] text-slate-500">${fmtSpd(ac.gs)} ${spdUnitLabel()}</div>
        </div>
      `;

      item.onclick = () => {
        setSelected(hex);
        map.flyTo([ac.lat, ac.lon], 9, { animate:true, duration:0.8 });
        const m = markers.get(hex);
        if (m) m.openPopup();
      };

      frag.appendChild(item);
    });

    listEl.appendChild(frag);
    listDirty = false;
  }

  searchInput.addEventListener("input", () => { if (isListOpen()) renderList(lastAircraft); });
  sortBy.addEventListener("change", () => { if (isListOpen()) renderList(lastAircraft); });

  filterContainer.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      filterContainer.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      if (isListOpen()) renderList(lastAircraft);
      else listDirty = true;
    }, { passive: true });
  });

  // ===== About =====
  function renderAboutNav() {
    aboutNav.innerHTML = "";
    ABOUT_SECTIONS.forEach((s, i) => {
      const btn = document.createElement("button");
      btn.className = "about-nav-btn w-full text-left px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-sky-500/40 hover:bg-slate-800/60 transition flex items-center gap-2 text-sm text-slate-200";
      btn.innerHTML = `<span class="text-sky-300">${s.icon}</span><span>${s.title}</span>`;
      btn.onclick = () => selectAboutSection(s.id);
      aboutNav.appendChild(btn);
      if (i === 0) btn.classList.add("active");
    });
    selectAboutSection(ABOUT_SECTIONS[0].id);
  }
  function selectAboutSection(id) {
    const s = ABOUT_SECTIONS.find(x => x.id === id);
    if (!s) return;
    [...aboutNav.children].forEach(ch => ch.classList.remove("active"));
    const idx = ABOUT_SECTIONS.findIndex(x => x.id === id);
    if (aboutNav.children[idx]) aboutNav.children[idx].classList.add("active");
    aboutTitle.innerHTML = `<span class="text-sky-300">${s.icon}</span><span>${s.title}</span>`;
    aboutText.innerHTML = s.text;
    aboutExtra.innerHTML = "";
    (s.extras || []).forEach(([k,v]) => {
      const c = document.createElement("div");
      c.className = "rounded-xl bg-slate-950/60 border border-slate-800 p-3";
      c.innerHTML = `<div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">${k}</div>
                     <div class="mt-1 text-slate-200">${v}</div>`;
      aboutExtra.appendChild(c);
    });
  }
  renderAboutNav();

  // ===== Airport Traffic =====
  function updateAirportTraffic(apt) {
    listDep.innerHTML = "";
    listArr.innerHTML = "";

    let deps = [], arrs = [];

    lastAircraft.forEach(ac => {
      if (ac?.lat == null || ac?.lon == null) return;
      const d = haversineKm(apt.lat, apt.lon, ac.lat, ac.lon) * 0.539957; // NM
      const alt = ac.alt_baro || 0;
      const vs = ac.baro_rate || 0;
      const trk = ac.track || 0;

      if (d < 30 && alt < 15000) {
        const bearingToPlane = bearingDeg(apt.lat, apt.lon, ac.lat, ac.lon);
        const diff = angleDiffDeg(trk, bearingToPlane);
        const isMovingAway = diff < 90;

        if (isMovingAway && vs > 100) deps.push(ac);
        else if (!isMovingAway) arrs.push(ac);
      }
    });

    countDep.textContent = deps.length;
    countArr.textContent = arrs.length;

    const renderRow = (ac) => {
      const type = ac.type || "";
      const call = ac.flight ? String(ac.flight).trim() : String(ac.hex).toUpperCase();
      const spdText = Math.round(ac.gs||0) + " kts";
      return `
        <div class="flex items-center justify-between p-2 rounded bg-slate-900/30 border border-slate-800/30 hover:bg-slate-800 cursor-pointer group"
             onclick="map.fire('click'); setSelected('${ac.hex}'); map.flyTo([${ac.lat},${ac.lon}],10);">
          <div class="flex flex-col">
            <div class="text-xs font-bold text-white group-hover:text-sky-300 transition">${call}</div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-[9px] font-bold text-slate-400 border border-slate-700/50 px-1 rounded bg-slate-950/50">${type || 'UNK'}</span>
              <span class="text-[9px] text-slate-500">${spdText}</span>
            </div>
          </div>
          <div class="text-right">
            <div class="text-[11px] font-mono text-slate-300">${fmtAlt(ac.alt_baro)}</div>
            <div class="text-[9px] ${(ac.baro_rate||0)>0?'text-emerald-400':'text-amber-400'}">${(ac.baro_rate||0)>0?'+':''}${ac.baro_rate||0}</div>
          </div>
        </div>
      `;
    };

    deps.forEach(ac => listDep.innerHTML += renderRow(ac));
    arrs.forEach(ac => listArr.innerHTML += renderRow(ac));

    if (deps.length===0) listDep.innerHTML = `<div class="text-[10px] text-slate-600 italic px-2">No active departures detected nearby</div>`;
    if (arrs.length===0) listArr.innerHTML = `<div class="text-[10px] text-slate-600 italic px-2">No active arrivals detected nearby</div>`;
  }

  // ===== Photo Fetch (cached) =====
  async function fetchPlanePhoto(hex, imgId, containerId) {
    const imgEl = document.getElementById(imgId);
    const container = document.getElementById(containerId);
    if(!imgEl || !container) return;

    if (photoCache.has(hex)) {
      const url = photoCache.get(hex);
      if (url) {
        imgEl.src = url;
        imgEl.onload = () => {
          imgEl.classList.add('plane-photo-loaded');
          container.classList.add('has-photo');
        };
      }
      return;
    }

    if (photoInflight.has(hex)) return;
    const p = (async () => {
      try {
        const res = await fetch(`https://api.planespotters.net/pub/photos/hex/${hex}`, { cache: "force-cache" });
        if (!res.ok) throw new Error("No photo");
        const data = await res.json();
        const url = data?.photos?.[0]?.thumbnail_large?.src || null;
        photoCache.set(hex, url);
        if (url) {
          imgEl.src = url;
          imgEl.onload = () => {
            imgEl.classList.add('plane-photo-loaded');
            container.classList.add('has-photo');
          };
        }
      } catch {
        photoCache.set(hex, null);
      } finally {
        photoInflight.delete(hex);
      }
    })();

    photoInflight.set(hex, p);
  }

  function popupHTML(ac, hdg, isEmergency) {
    const call = ac.flight ? String(ac.flight).trim() : "NO CALLSIGN";
    const altFt = ac.alt_baro || 0;
    const spd = ac.gs || 0;
    const color = isEmergency ? "#ef4444" : altitudeColor(altFt);
    const distKm = haversineKm(DFW_LAT, DFW_LON, ac.lat, ac.lon);
    const distNM = (distKm * 0.539957).toFixed(1);
    const vRate = ac.baro_rate || 0;

    let vRateIcon = vRate > 128 ? "↑" : (vRate < -128 ? "↓" : "→");
    let vRateClass = vRate > 128 ? "text-emerald-400" : (vRate < -128 ? "text-amber-400" : "text-slate-500");
    const modelName = getAircraftName(ac.type);

    const country = getCountry(ac.r, ac.hex);

    let airlineName = "";
    if (ac.flight && String(ac.flight).length > 3) {
      const prefix = String(ac.flight).substring(0,3).toUpperCase();
      if (AIRLINE_DB[prefix]) airlineName = AIRLINE_DB[prefix];
    }

    let deltaHtml = "";
    if (selectedPlaneHex === ac.hex && selectedStartAlt !== null) {
      const diff = altFt - selectedStartAlt;
      if (Math.abs(diff) > 20) {
        const diffClass = diff > 0 ? "text-emerald-400" : "text-amber-400";
        deltaHtml = `<div class="text-[10px] font-mono mt-1 ${diffClass}">Δ ${diff > 0 ? "+" : ""}${fmtAlt(diff)} ft</div>`;
      } else {
        deltaHtml = `<div class="text-[10px] font-mono mt-1 text-slate-500">Δ 0 ft</div>`;
      }
    }

    let emergencyBanner = isEmergency ? `<div class="bg-red-600 text-white text-[10px] font-bold text-center py-1 tracking-widest animate-pulse">EMERGENCY SQUAWK ${ac.squawk}</div>` : "";

    const imgId = `plane-img-${ac.hex}`;
    const containerId = `plane-container-${ac.hex}`;

    return `
      <div class="flex flex-col relative w-full">
        ${emergencyBanner}

        <div id="${containerId}" class="plane-photo-container">
          <button onclick="map.closePopup()" class="popup-close-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>

          <div class="photo-placeholder"></div>
          <img id="${imgId}" class="plane-photo-img" src="" alt="Aircraft Photo" />
          <div class="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent z-20">
            <div class="flex items-end justify-between pr-8">
              <div>
                <div class="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-0.5">${airlineName}</div>
                <a href="https://flightaware.com/live/flight/${call}" target="_blank" class="text-2xl font-black text-white leading-none hover:text-sky-400 transition tracking-tight">${call}</a>
                <div class="flex items-center gap-1.5 mt-1">
                  <span class="text-lg">${country.flag}</span>
                  <span class="text-[9px] font-medium text-slate-400">${country.name}</span>
                </div>
              </div>
              <div class="text-right">
                <div class="text-[10px] font-mono text-slate-400 font-bold">${String(ac.hex).toUpperCase()}</div>
                <div class="text-[9px] font-bold text-sky-400 truncate max-w-[120px] mt-0.5">${modelName}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="p-4 space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 rounded-2xl bg-slate-800/40 border border-white/5 relative overflow-hidden group hover:bg-slate-800/60 transition">
              <div class="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition"><svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2v20M2 12h20"/></svg></div>
              <div class="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Altitude</div>
              <div id="pop-alt-${ac.hex}" class="text-2xl font-black text-white leading-none">${fmtAlt(altFt)}</div>
              <div class="flex items-center gap-1 mt-1 text-[10px] font-mono"><span class="text-slate-500">FT</span>
                <span id="pop-vs-container-${ac.hex}" class="${vRateClass} flex items-center gap-0.5 ml-2 font-bold bg-slate-950/30 px-1.5 rounded-full">
                  <span id="pop-vs-${ac.hex}">${vRateIcon} ${Math.abs(vRate)}</span>
                </span>
              </div>
              ${deltaHtml}
              <div class="mt-2 h-1 w-full bg-slate-700/30 rounded-full overflow-hidden">
                <div id="pop-bar-${ac.hex}" style="width:${Math.min(100, (altFt/45000)*100)}%; background:${color}" class="h-full shadow-[0_0_8px_rgba(255,255,255,0.5)]"></div>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <div class="flex-1 p-2.5 rounded-xl bg-slate-800/40 border border-white/5 flex items-center justify-between">
                <div>
                  <div class="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Ground Speed</div>
                  <div class="text-lg font-black text-white leading-none mt-0.5"><span id="pop-spd-${ac.hex}">${fmtSpd(spd)}</span> <span id="pop-unit-spd-${ac.hex}" class="text-xs text-slate-500 font-medium">${spdUnitLabel()}</span></div>
                </div>
              </div>
              <div class="flex-1 p-2.5 rounded-xl bg-slate-800/40 border border-white/5 flex items-center justify-between">
                <div>
                  <div class="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Heading</div>
                  <div class="text-lg font-black text-white leading-none mt-0.5"><span id="pop-hdg-${ac.hex}">${Math.round(hdg)}</span>°</div>
                </div>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <div class="p-2 rounded-lg bg-slate-900/30 border border-white/5 text-center"><div class="text-[8px] text-slate-500 uppercase font-bold tracking-wider">Dist (DFW)</div><div class="text-xs font-mono font-bold text-sky-200 mt-0.5"><span id="pop-dist-${ac.hex}">${distNM}</span> nm</div></div>
            <div class="p-2 rounded-lg bg-slate-900/30 border border-white/5 text-center"><div class="text-[8px] text-slate-500 uppercase font-bold tracking-wider">Squawk</div><div class="text-xs font-mono font-bold ${isEmergency ? 'text-red-400 animate-pulse' : 'text-slate-200'} mt-0.5"><span id="pop-squawk-${ac.hex}">${ac.squawk || "—"}</span></div></div>
            <div class="p-2 rounded-lg bg-slate-900/30 border border-white/5 text-center"><div class="text-[8px] text-slate-500 uppercase font-bold tracking-wider">Seen</div><div class="text-xs font-mono font-bold text-slate-200 mt-0.5"><span id="pop-seen-${ac.hex}">${fmtSeen(ac.seen)}</span></div></div>
          </div>

          <div class="mt-1 pt-2 border-t border-white/5 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
            <div class="flex items-center justify-between" title="Received Signal Strength Indicator: Signal quality in dB">
              <span>Signal (RSSI):</span>
              <span class="font-mono text-sky-300 font-bold" id="pop-rssi-${ac.hex}">${ac.rssi !== undefined ? ac.rssi + ' dB' : 'N/A'}</span>
            </div>
            <div class="flex items-center justify-between" title="Total ADS-B messages received from this aircraft">
              <span>Messages:</span>
              <span class="font-mono text-slate-200" id="pop-msg-${ac.hex}">${ac.messages || 0}</span>
            </div>
            <div class="flex items-center justify-between" title="Emitter Category (e.g. Light, Heavy, Glider)">
              <span>Category:</span>
              <span class="font-mono text-slate-200" id="pop-cat-${ac.hex}">${ac.category || '-'}</span>
            </div>
            <div class="flex items-center justify-between" title="Data Source Type">
              <span>Source:</span>
              <span class="font-mono text-emerald-400 font-bold" id="pop-src-${ac.hex}">ADS-B</span>
            </div>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-white/5">
            <div class="text-[9px] font-mono text-slate-500 truncate max-w-[180px]">${ac.lat.toFixed(4)}, ${ac.lon.toFixed(4)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function updatePopupDynamic(ac) {
    const hex = ac.hex;

    const altEl = document.getElementById(`pop-alt-${hex}`);
    if (altEl) altEl.textContent = fmtAlt(ac.alt_baro);

    const spdEl = document.getElementById(`pop-spd-${hex}`);
    if (spdEl) spdEl.textContent = fmtSpd(ac.gs);

    const spdUnitEl = document.getElementById(`pop-unit-spd-${hex}`);
    if (spdUnitEl) spdUnitEl.textContent = spdUnitLabel();

    const hdgEl = document.getElementById(`pop-hdg-${hex}`);
    if (hdgEl) hdgEl.textContent = Math.round(ac.track || 0);

    const distEl = document.getElementById(`pop-dist-${hex}`);
    if (distEl) {
      const distKm = haversineKm(DFW_LAT, DFW_LON, ac.lat, ac.lon);
      distEl.textContent = (distKm * 0.539957).toFixed(1);
    }

    const seenEl = document.getElementById(`pop-seen-${hex}`);
    if (seenEl) seenEl.textContent = fmtSeen(ac.seen);

    const squawkEl = document.getElementById(`pop-squawk-${hex}`);
    if (squawkEl) squawkEl.textContent = ac.squawk || "—";

    const rssiEl = document.getElementById(`pop-rssi-${hex}`);
    if (rssiEl) rssiEl.textContent = ac.rssi !== undefined ? ac.rssi + ' dB' : 'N/A';

    const msgEl = document.getElementById(`pop-msg-${hex}`);
    if (msgEl) msgEl.textContent = ac.messages || 0;

    const catEl = document.getElementById(`pop-cat-${hex}`);
    if (catEl) catEl.textContent = ac.category || '-';

    const vRate = ac.baro_rate || 0;
    let vRateIcon = vRate > 128 ? "↑" : (vRate < -128 ? "↓" : "→");
    let vRateClass = vRate > 128 ? "text-emerald-400" : (vRate < -128 ? "text-amber-400" : "text-slate-500");

    const vsEl = document.getElementById(`pop-vs-${hex}`);
    const vsContainer = document.getElementById(`pop-vs-container-${hex}`);
    if (vsEl) vsEl.textContent = `${vRateIcon} ${Math.abs(vRate)}`;
    if (vsContainer) vsContainer.className = `${vRateClass} flex items-center gap-0.5 ml-2 font-bold bg-slate-950/30 px-1.5 rounded-full`;

    const barEl = document.getElementById(`pop-bar-${hex}`);
    if (barEl) {
      barEl.style.width = `${Math.min(100, ((ac.alt_baro||0)/45000)*100)}%`;
      barEl.style.background = altitudeColor(ac.alt_baro||0);
    }
  }

  function shouldUpdatePopupContent(hex, ac, hdg, isEmergency) {
    const key = [
      ac.flight || "",
      ac.type || "",
      ac.squawk || "",
      Math.round(ac.alt_baro || 0),
      Math.round(ac.gs || 0),
      Math.round(hdg || 0),
      isEmergency ? 1 : 0,
      speedUnit
    ].join("|");

    const meta = popupMeta.get(hex);
    if (!meta) { popupMeta.set(hex, { lastKey: key }); return true; }
    if (meta.lastKey !== key) { meta.lastKey = key; return true; }
    return false;
  }

  function updateMap(aircraftList) {
    lastAircraft = (aircraftList || []).filter(ac => ac?.lat != null && ac?.lon != null && ac?.hex);
    badgeCount.textContent = lastAircraft.length;
    planeCountEl.textContent = lastAircraft.length;

    unitLabelEl.textContent = spdUnitLabel();
    speedBadge.textContent = speedUnit.toUpperCase();

    updateKPIs(lastAircraft);
    updateRangeRing(lastAircraft);

    const currentHexes = new Set();
    const now = performance.now();
    const tweenDuration = Math.max(800, POLL_MS * 0.95);

    lastAircraft.forEach(ac => {
      const hex = ac.hex;
      currentHexes.add(hex);

      const isEmergency = ['7700', '7600', '7500'].includes(ac.squawk);

      if (hex === selectedPlaneHex && selectedPolyline) {
        const lastPt = selectedPath[selectedPath.length - 1];
        if (!lastPt || Math.abs(lastPt[0] - ac.lat) > 0.0001 || Math.abs(lastPt[1] - ac.lon) > 0.0001) {
          selectedPath.push([ac.lat, ac.lon]);
          if (selectedPath.length > MAX_TRAIL_POINTS) selectedPath.shift();
          selectedPolyline.setLatLngs(selectedPath);
        }
      }

      let marker = markers.get(hex);
      let st = planeState.get(hex);

      const prevLatLng = st
        ? L.latLng((st.targetLat ?? st.lastLat), (st.targetLon ?? st.lastLon))
        : (marker ? marker.getLatLng() : L.latLng(ac.lat, ac.lon));

      let targetHdg = (ac.track != null) ? ac.track : (st?.hdg ?? 0);
      if (prevLatLng) {
        const distKm = haversineKm(prevLatLng.lat, prevLatLng.lng, ac.lat, ac.lon);
        if (distKm > 0.02) targetHdg = bearingDeg(prevLatLng.lat, prevLatLng.lng, ac.lat, ac.lon);
      }

      let currentRot = st ? (st.currentRotation ?? st.hdg ?? 0) : targetHdg;
      let diff = targetHdg - (currentRot % 360);
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      const nextRot = currentRot + diff;

      if (!marker) {
        marker = L.marker([ac.lat, ac.lon], {
          icon: createPlaneDivIcon(nextRot, ac.alt_baro || 0, hex === selectedPlaneHex, isEmergency),
          zIndexOffset: isEmergency ? 1000 : 0
        }).addTo(map);

        marker.bindPopup(popupHTML(ac, targetHdg, isEmergency), { closeButton: false, autoPan: false });

        marker.on('click', () => setSelected(hex));

        marker.on('popupopen', () => {
          if (shouldUpdatePopupContent(hex, ac, targetHdg, isEmergency)) {
            marker.setPopupContent(popupHTML(ac, targetHdg, isEmergency));
          }
          fetchPlanePhoto(hex, `plane-img-${hex}`, `plane-container-${hex}`);
        });

        markers.set(hex, marker);

        st = {
          lastLat: ac.lat, lastLon: ac.lon,
          targetLat: ac.lat, targetLon: ac.lon,
          moveStart: null, moveEnd: null,
          hdg: targetHdg, currentRotation: nextRot,
          alt: (ac.alt_baro || 0)
        };
        planeState.set(hex, st);

      } else {
        if (!st) st = {
          lastLat: prevLatLng.lat, lastLon: prevLatLng.lng,
          targetLat: prevLatLng.lat, targetLon: prevLatLng.lng,
          moveStart: null, moveEnd: null,
          hdg: targetHdg, currentRotation: nextRot,
          alt: (ac.alt_baro || 0)
        };

        st.lastLat = prevLatLng.lat;
        st.lastLon = prevLatLng.lng;
        st.targetLat = ac.lat;
        st.targetLon = ac.lon;
        st.moveStart = now;
        st.moveEnd = now + tweenDuration;
        st.hdg = targetHdg;
        st.currentRotation = nextRot;
        st.alt = (ac.alt_baro || 0);
        planeState.set(hex, st);

        movingPlanes.add(hex);
        marker.setZIndexOffset(isEmergency ? 1000 : 0);

        const pop = marker.getPopup();
        const isOpen = pop && pop.isOpen();

        if (isOpen) {
          updatePopupDynamic(ac);
        } else {
          if (hex === selectedPlaneHex || isEmergency) {
            if (shouldUpdatePopupContent(hex, ac, targetHdg, isEmergency)) {
              marker.setPopupContent(popupHTML(ac, targetHdg, isEmergency));
            }
          }
        }

        updateMarkerVisual(marker, nextRot, st.alt, hex === selectedPlaneHex, isEmergency);
      }

      if (followSelected && selectedPlaneHex === hex) map.panTo([ac.lat, ac.lon], { animate:true, duration:0.4 });
    });

    markers.forEach((marker, hex) => {
      if (!currentHexes.has(hex)) {
        map.removeLayer(marker);
        markers.delete(hex);
        planeState.delete(hex);
        popupMeta.delete(hex);
        movingPlanes.delete(hex);
        if (hex === selectedPlaneHex) setSelected(null);
      }
    });

    if (isListOpen()) {
      if (listDirty) renderList(lastAircraft);
    } else {
      listDirty = true;
    }

    if(!drawerAirport.classList.contains("-translate-x-full")) {
      const apt = AIRPORTS.find(a => a.short === aptTitle.textContent);
      if(apt) updateAirportTraffic(apt);
    }
  }

  // ===== Animation Loop =====
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animatePlanes() {
    if (prefersReducedMotion) return;
    const now = performance.now();
    for (const hex of movingPlanes) {
      const st = planeState.get(hex);
      const m = markers.get(hex);
      if (!m || !st || st.moveStart == null || st.moveEnd == null) { movingPlanes.delete(hex); continue; }

      if (now >= st.moveEnd || st.moveEnd <= st.moveStart) {
        m.setLatLng([st.targetLat, st.targetLon]);
        st.lastLat = st.targetLat;
        st.lastLon = st.targetLon;
        st.moveStart = null;
        st.moveEnd = null;
        movingPlanes.delete(hex);
        continue;
      }

      const t = (now - st.moveStart) / (st.moveEnd - st.moveStart);
      m.setLatLng([lerp(st.lastLat, st.targetLat, t), lerp(st.lastLon, st.targetLon, t)]);
    }
    requestAnimationFrame(animatePlanes);
  }
  requestAnimationFrame(animatePlanes);

  // ===== Controls =====
  function persistPrefs() {
    savePrefs({ themeMode, speedUnit, showRangeRing, followSelected });
  }

  function toggleTheme() {
    themeMode = (themeMode + 1) % 3;
    applyThemeUI();
    markers.forEach((m, h) => {
      const st = planeState.get(h);
      const isEmg = lastAircraft.some(a=>a.hex===h && ['7700','7600','7500'].includes(a.squawk));
      if (st) updateMarkerVisual(m, st.currentRotation ?? st.hdg ?? 0, st.alt ?? 0, h === selectedPlaneHex, !!isEmg);
    });
    persistPrefs();
  }
  btnTheme.onclick = toggleTheme;

  function toggleSpeedUnit() {
    speedUnit = (speedUnit === "kts") ? "mph" : "kts";
    unitLabelEl.textContent = spdUnitLabel();
    listDirty = true;
    updateMap(lastAircraft);
    persistPrefs();
  }
  btnSpeedUnit.onclick = toggleSpeedUnit;

  function toggleFollow() {
    followSelected = !followSelected;
    btnFollow.classList.toggle("border-sky-500/70", followSelected);
    followIcon.classList.toggle("text-sky-300", followSelected);
    persistPrefs();
  }
  btnFollow.onclick = toggleFollow;

  function toggleRangeRing() {
    showRangeRing = !showRangeRing;
    ringBadge.textContent = showRangeRing ? "ON" : "OFF";
    if (showRangeRing) {
      ensureRangeRing();
      updateRangeRing(lastAircraft);
      btnRangeRing.classList.add("border-sky-500/70");
    } else {
      removeRangeRing();
      btnRangeRing.classList.remove("border-sky-500/70");
    }
    persistPrefs();
  }
  btnRangeRing.onclick = toggleRangeRing;

  function openLegend() {
    legendPanel.classList.remove('hidden');
    requestAnimationFrame(() => {
      legendPanel.classList.remove('opacity-0','scale-95');
      legendPanel.classList.add('opacity-100','scale-100');
    });
    btnLegend.classList.add("border-sky-500/70");
  }
  function closeLegendPanel() {
    legendPanel.classList.remove('opacity-100','scale-100');
    legendPanel.classList.add('opacity-0','scale-95');
    btnLegend.classList.remove("border-sky-500/70");
    setTimeout(() => legendPanel.classList.add('hidden'), 180);
  }
  btnLegend.onclick = () => {
    if (legendPanel.classList.contains('hidden')) openLegend();
    else closeLegendPanel();
  };
  closeLegend.onclick = closeLegendPanel;

  map.on('click', () => {
    if (!legendPanel.classList.contains('hidden')) closeLegendPanel();
    if (selectedPlaneHex) setSelected(null);
  });

  btnList.onclick = () => {
    drawerList.classList.remove('translate-x-full', 'opacity-0');
    if (listDirty) renderList(lastAircraft);
  };
  closeList.onclick = () => drawerList.classList.add('translate-x-full', 'opacity-0');

  btnAbout.onclick = () => aboutModal.classList.remove('hidden');
  closeAbout.onclick = () => aboutModal.classList.add('hidden');
  aboutBackdrop.onclick = () => aboutModal.classList.add('hidden');

  btnCenter.onclick = () => map.setView([DFW_LAT, DFW_LON], DFW_ZOOM, { animate:true });

  // ===== Time =====
  function updateTimes() {
    const now = new Date();
    ctTimeEl.textContent = now.toLocaleTimeString("en-US",{hour12:false,timeZone:"America/Chicago"});
    utcTimeEl.textContent = now.toLocaleTimeString("en-US",{hour12:false,timeZone:"UTC"});
  }
  updateTimes();
  setInterval(updateTimes, 1000);

  // ===== Mock Data =====
  let mockPlanes = [];
  function generateMockData() {
    if (mockPlanes.length === 0) {
      for (let i=0; i<40; i++) {
        const squawks = ['1200', '1000', '3425', '7700', '7600'];
        mockPlanes.push({
          hex: Math.random().toString(16).substring(2,8),
          flight: ["UA","AA","DL","SW"][Math.floor(Math.random()*4)] + Math.floor(Math.random()*999),
          lat: 30 + Math.random()*20, lon: -120 + Math.random()*40, alt_baro: 10000 + Math.random()*30000,
          gs: 300 + Math.random()*250, track: Math.random()*360,
          type: Object.keys(ICAO_DB)[Math.floor(Math.random()*Object.keys(ICAO_DB).length)],
          squawk: (Math.random() > 0.95) ? squawks[Math.floor(Math.random()*squawks.length)] : (1000 + Math.floor(Math.random()*6000)).toString(),
          baro_rate: (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 2000)
        });
      }
    }
    mockPlanes = mockPlanes.map(p => {
      if (p.lat > 50 || p.lat < 25 || p.lon > -70 || p.lon < -125) p.track = (p.track + 5) % 360;
      const rad = p.track * (Math.PI / 180);
      p.lat += Math.cos(rad) * 0.05;
      p.lon += Math.sin(rad) * 0.05;
      return p;
    });
    return mockPlanes;
  }

  // ===== Polling =====
  let fetchInFlight = null;

  function setModeLive(isLive) {
    toast.classList.toggle("hidden", isLive);
    if (isLive) {
      modePill.textContent = "LIVE";
      modePill.className = "px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold tracking-wide text-[10px]";
    } else {
      modePill.textContent = "SIM";
      modePill.className = "px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30 font-semibold tracking-wide text-[10px]";
    }
  }

  async function fetchAircraft() {
    if (fetchInFlight) return;
    const ctrl = new AbortController();
    fetchInFlight = ctrl;

    const t = setTimeout(() => {
      try { ctrl.abort(); } catch {}
    }, FETCH_TIMEOUT_MS);

    try {
      const r = await fetch(AIRCRAFT_URL, { cache:"no-store", signal: ctrl.signal });
      if (!r.ok) throw new Error("No backend");
      const data = await r.json();
      setModeLive(true);
      updateMap(data.aircraft || []);
    } catch (e) {
      setModeLive(false);
      updateMap(generateMockData());
    } finally {
      clearTimeout(t);
      fetchInFlight = null;
      lastUpdateEl.textContent = new Date().toLocaleTimeString("en-US",{hour12:false});
    }
  }

  let pollTimer = null;
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    fetchAircraft();
    pollTimer = setInterval(fetchAircraft, POLL_MS);
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (fetchInFlight) {
      try { fetchInFlight.abort(); } catch {}
      fetchInFlight = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPolling();
    else startPolling();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!legendPanel.classList.contains('hidden')) closeLegendPanel();
      if (isListOpen()) drawerList.classList.add('translate-x-full', 'opacity-0');
      if (!drawerAirport.classList.contains("-translate-x-full")) closeAirportDrawer();
      if (!aboutModal.classList.contains('hidden')) aboutModal.classList.add('hidden');
      map.closePopup();
      if (selectedPlaneHex) setSelected(null);
    }
  });

  // Initial UI
  unitLabelEl.textContent = spdUnitLabel();
  speedBadge.textContent = speedUnit.toUpperCase();

  // Start
  startPolling();
})();
