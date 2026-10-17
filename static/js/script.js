/* ================================================================== */
/* RoadSense — Premium Ola/Uber Style Interactive Road Safety Map     */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* Constants & Tile Layers                                            */
/* ------------------------------------------------------------------ */
const DEFAULT_CENTER = [28.6139, 77.209]; // New Delhi default center
const DEFAULT_ZOOM   = 13;
const NOMINATIM_URL  = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_UA   = "RoadSense/1.0 (student road-safety project; contact: roadsense-dev@example.com)";
const SEARCH_DEBOUNCE_MS = 500;
const SEARCH_MIN_CHARS   = 2;

// OSRM Public Routing API for free driving directions
const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";

// Tile layer URLs: 100% Free, reliable, keyless map tiles (No API keys required)
const TILE_PROVIDERS = {
  osm: {
    name: "OpenStreetMap Standard",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    },
  },
  osm_hot: {
    name: "OpenStreetMap (Bright / Humanitarian)",
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      subdomains: "abc",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank" rel="noopener">Humanitarian OpenStreetMap Team</a>',
    },
  },
  opentopo: {
    name: "OpenTopoMap (Topography & Roads)",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 17,
      subdomains: "abc",
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors | Map style: &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC-BY-SA</a>)',
    },
  },
};

// Hazard categories design tokens
const HAZARD_CONFIG = {
  "Pothole": {
    label: "Pothole",
    color: "#ea580c",
    accentLight: "#ffedd5",
    accentText: "#c2410c",
    iconSvg: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`,
    badgeClass: "cat-pothole",
    pinClass: "pin-pothole",
  },
  "Damaged Road": {
    label: "Damaged Road",
    color: "#ef4444",
    accentLight: "#fee2e2",
    accentText: "#b91c1c",
    iconSvg: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
    badgeClass: "cat-damaged",
    pinClass: "pin-damaged",
  },
  "Waterlogging": {
    label: "Waterlogging",
    color: "#0284c7",
    accentLight: "#e0f2fe",
    accentText: "#0369a1",
    iconSvg: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
    badgeClass: "cat-waterlogging",
    pinClass: "pin-waterlogging",
  },
  "Other": {
    label: "Other Hazard",
    color: "#8b5cf6",
    accentLight: "#f3e8ff",
    accentText: "#6d28d9",
    iconSvg: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 22 22 22 12 2"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    badgeClass: "cat-other",
    pinClass: "pin-other",
  },
};

/* ------------------------------------------------------------------ */
/* DOM Elements                                                       */
/* ------------------------------------------------------------------ */
const toast               = document.getElementById("toast");
const mapStatus           = document.getElementById("map-status");
const searchInput         = document.getElementById("location-search");
const searchClearBtn      = document.getElementById("search-clear-btn");
const suggestionList      = document.getElementById("search-suggestions");
const searchStatus        = document.getElementById("search-status");
const geolocateBtn        = document.getElementById("geolocate-btn");
const routeToggleBtn      = document.getElementById("route-toggle-btn");
const nearbyToggleBtn     = document.getElementById("nearby-toggle-btn");
const resetViewBtn        = document.getElementById("reset-view-btn");
const fullscreenBtn       = document.getElementById("fullscreen-btn");
const fsEnterIcon         = document.getElementById("fs-enter-icon");
const fsExitIcon          = document.getElementById("fs-exit-icon");
const mapFrameContainer   = document.getElementById("map-frame-container");

// Controls toolbar
const categoryChips       = document.querySelectorAll(".ola-chip");
const statusFilterSelect  = document.getElementById("status-filter");
const segButtons          = document.querySelectorAll(".seg-btn");
const layerSelect         = document.getElementById("layer-select");

// Count badges
const countAllEl          = document.getElementById("count-all");
const countPotholeEl      = document.getElementById("count-pothole");
const countDamagedEl      = document.getElementById("count-damaged");
const countWaterloggingEl = document.getElementById("count-waterlogging");
const countOtherEl        = document.getElementById("count-other");
const nearbyCountBadge    = document.getElementById("nearby-count-badge");

// Route Drawer
const routePanel          = document.getElementById("route-panel");
const closeRoutePanel     = document.getElementById("close-route-panel");
const routeStartInput     = document.getElementById("route-start-input");
const routeEndInput       = document.getElementById("route-end-input");
const routeUseGpsBtn      = document.getElementById("route-use-gps");
const routePickMapBtn     = document.getElementById("route-pick-map");
const calcRouteBtn        = document.getElementById("calc-route-btn");
const clearRouteBtn       = document.getElementById("clear-route-btn");
const routeResults        = document.getElementById("route-results");
const routeDist           = document.getElementById("route-dist");
const routeTime           = document.getElementById("route-time");
const routeHazardAlert    = document.getElementById("route-hazard-alert");

// Nearby Drawer
const nearbyPanel         = document.getElementById("nearby-panel");
const closeNearbyPanel    = document.getElementById("close-nearby-panel");
const nearbyHazardsList   = document.getElementById("nearby-hazards-list");
const nearbySubtitle      = document.getElementById("nearby-subtitle");

// Legend
const olaLegend           = document.getElementById("ola-legend");
const toggleLegendBtn     = document.getElementById("toggle-legend-btn");
const legendContent       = document.getElementById("legend-content");

// Photo Modal (Lightbox)
const photoModal          = document.getElementById("photo-modal");
const photoModalClose     = document.getElementById("photo-modal-close");
const modalBackdrop       = document.getElementById("modal-backdrop");
const photoModalImg       = document.getElementById("photo-modal-img");
const photoModalTitle     = document.getElementById("photo-modal-title");
const photoModalDesc      = document.getElementById("photo-modal-desc");

// Report Form Elements
const reportForm          = document.getElementById("report-form");
const formMessage         = document.getElementById("form-message");
const latitudeInput       = document.getElementById("latitude");
const longitudeInput      = document.getElementById("longitude");
const coordHint           = document.getElementById("coord-hint");

/* ------------------------------------------------------------------ */
/* Map State                                                          */
/* ------------------------------------------------------------------ */
let map;
let baseTileLayer;
let satelliteOverlayLayer;
let reportsLayer;
let heatLayer;
let routeLayerGroup;
let userLocationMarker;
let userAccuracyCircle;
let selectedMarker; // Selection pin for new report

let allReports = [];
let activeCategoryFilter = "all";
let activeStatusFilter = "all";
let activeViewMode = "pins"; // 'pins' | 'heat' | 'both'

let userCurrentPosition = null; // { lat, lng }
let routeStartCoords = null;    // { lat, lng }
let routeEndCoords = null;      // { lat, lng }
let isPickingRouteDestination = false;

let lastSearchTime = 0;
let searchDebounceTimer = null;
let activeSuggestionIndex = -1;

/* ------------------------------------------------------------------ */
/* Utility: HTML escaping                                             */
/* ------------------------------------------------------------------ */
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* ------------------------------------------------------------------ */
/* Utility: Haversine distance in meters                              */
/* ------------------------------------------------------------------ */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/* ------------------------------------------------------------------ */
/* Hero Statistics Counter                                            */
/* ------------------------------------------------------------------ */
function animateCount(el, target) {
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || target === 0) {
    el.textContent = String(target);
    return;
  }
  const duration = 800;
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = String(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateHeroStats(reports) {
  const open = reports.filter((r) => r.status === "Reported" || r.status === "In Progress").length;
  const resolved = reports.filter((r) => r.status === "Resolved").length;
  animateCount(document.getElementById("stat-total"), reports.length);
  animateCount(document.getElementById("stat-open"), open);
  animateCount(document.getElementById("stat-resolved"), resolved);
}

/* ------------------------------------------------------------------ */
/* Toast & Status Messages                                            */
/* ------------------------------------------------------------------ */
function showToast(message, type = "success") {
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show ${type === "error" ? "toast-error" : "toast-success"}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3500);
}

function setMapStatus(message, kind) {
  if (!mapStatus) return;
  mapStatus.textContent = message;
  mapStatus.classList.remove("is-error", "is-empty", "is-hidden");
  if (kind === "error") mapStatus.classList.add("is-error");
  else if (kind === "empty") mapStatus.classList.add("is-empty");
  else if (kind === "hidden") mapStatus.classList.add("is-hidden");
}

function setSearchStatus(message, kind) {
  if (!searchStatus) return;
  searchStatus.textContent = message;
  searchStatus.className = "search-status";
  if (kind === "error") searchStatus.classList.add("is-error");
  else if (kind === "loading") searchStatus.classList.add("is-loading");
  else if (!message) searchStatus.classList.add("is-hidden");
}

function setFormMessage(message, kind) {
  if (!formMessage) return;
  formMessage.textContent = message;
  formMessage.classList.remove("is-error", "is-success");
  if (kind === "error") formMessage.classList.add("is-error");
  if (kind === "success") formMessage.classList.add("is-success");
}

/* ------------------------------------------------------------------ */
/* Custom SVG Pin Markers for Ola/Uber Aesthetic                      */
/* ------------------------------------------------------------------ */
function createOlaHazardIcon(hazardType, status) {
  const cfg = HAZARD_CONFIG[hazardType] || HAZARD_CONFIG["Other"];
  const isResolved = status === "Resolved";
  const isOpen = status === "Reported" || status === "In Progress";
  const color = cfg.color;

  const html = `
    <div class="ola-pin-marker" style="color: ${color};" title="${escapeHtml(hazardType)} (${escapeHtml(status)})">
      ${isOpen ? `<span class="ola-radar-pulse" style="border-color: ${color};"></span>` : ""}
      <svg class="ola-pin-svg" viewBox="0 0 36 44" width="36" height="44">
        <defs>
          <linearGradient id="pinGrad-${hazardType.replace(/\s+/g, '')}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" />
            <stop offset="100%" stop-color="${color}" stop-opacity="0.9" />
          </linearGradient>
        </defs>
        <!-- Outer pin teardrop body -->
        <path d="M18 1 C9.16 1 2 8.16 2 17 C2 27.5 18 43 18 43 C18 43 34 27.5 34 17 C34 8.16 26.84 1 18 1 Z"
              fill="url(#pinGrad-${hazardType.replace(/\s+/g, '')})"
              stroke="#ffffff"
              stroke-width="2.2" />
        <!-- Inner circular white crest -->
        <circle cx="18" cy="17" r="10.5" fill="#ffffff" />
      </svg>
      <!-- Center category icon -->
      <div style="position: absolute; top: 9px; left: 10px; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; color: ${color}; pointer-events: none;">
        ${cfg.iconSvg}
      </div>
      ${isResolved ? `<div class="ola-pin-badge-resolved" title="Resolved">✓</div>` : ""}
    </div>
  `;

  return L.divIcon({
    className: "ola-custom-pin-wrapper",
    html: html,
    iconSize: [36, 44],
    iconAnchor: [18, 43],
    popupAnchor: [0, -42],
  });
}

function createUserLocationIcon() {
  return L.divIcon({
    className: "ola-user-puck-wrapper",
    html: `<div class="ola-user-puck" title="You are here"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function createRoutePointIcon(type) {
  const isStart = type === "A";
  const bg = isStart ? "#10b981" : "#ef4444";
  const html = `
    <div style="width: 28px; height: 34px; position: relative; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));">
      <svg viewBox="0 0 28 34" width="28" height="34">
        <path d="M14 1 C6.8 1 1 6.8 1 14 C1 22 14 33 14 33 C14 33 27 22 27 14 C27 6.8 21.2 1 14 1 Z" fill="${bg}" stroke="#ffffff" stroke-width="2"/>
        <circle cx="14" cy="14" r="8" fill="#ffffff"/>
      </svg>
      <span style="position: absolute; top: 5px; left: 0; right: 0; text-align: center; font-size: 11px; font-weight: 800; color: ${bg};">${type}</span>
    </div>
  `;
  return L.divIcon({
    className: "route-point-marker",
    html: html,
    iconSize: [28, 34],
    iconAnchor: [14, 33],
  });
}

/* ------------------------------------------------------------------ */
/* Interactive Popup Builder (Ola/Uber card design)                   */
/* ------------------------------------------------------------------ */
function buildPopupHtml(report) {
  const cfg = HAZARD_CONFIG[report.hazard_type] || HAZARD_CONFIG["Other"];
  const statusClass = `status-${String(report.status).toLowerCase().replaceAll(" ", "-")}`;
  const dateFormatted = report.created_at ? new Date(report.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) : "Recent";

  const latNum = Number(report.latitude).toFixed(6);
  const lngNum = Number(report.longitude).toFixed(6);

  let photoHtml = "";
  if (report.photo_url) {
    const safeUrl = escapeHtml(report.photo_url);
    const safeTitle = escapeHtml(report.hazard_type);
    const safeDesc = escapeHtml(report.description);
    photoHtml = `
      <div class="ola-popup-photo-wrap" onclick="openPhotoModal('${safeUrl}', '${safeTitle}', '${safeDesc}')" title="Click to view full photo">
        <img src="${safeUrl}" alt="${safeTitle} photograph" loading="lazy" />
        <span class="ola-photo-zoom-hint">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          Zoom
        </span>
      </div>
    `;
  }

  return `
    <div class="ola-popup-card">
      <div class="ola-popup-header">
        <span class="ola-popup-cat-badge ${cfg.badgeClass}">
          ${cfg.iconSvg}
          ${escapeHtml(report.hazard_type)}
        </span>
        <span class="ola-popup-status ${statusClass}">${escapeHtml(report.status)}</span>
      </div>

      <div class="ola-popup-body">
        <p class="ola-popup-desc">${escapeHtml(report.description)}</p>
        
        ${photoHtml}

        <div class="ola-popup-meta">
          <button type="button" class="ola-coords-chip" onclick="copyCoords(${latNum}, ${lngNum}, this)" title="Click to copy coordinates">
            <span>📍 ${latNum}, ${lngNum}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <span>${dateFormatted}</span>
        </div>

        <div class="ola-popup-actions">
          <button type="button" class="ola-popup-btn ola-popup-btn-primary" onclick="setRouteDestination(${latNum}, ${lngNum}, '${escapeHtml(report.hazard_type)}')">
            🧭 Directions Here
          </button>
          <button type="button" class="ola-popup-btn" onclick="focusHazard(${latNum}, ${lngNum})">
            📍 Focus
          </button>
        </div>
      </div>
    </div>
  `;
}

// Global window actions used in popup HTML
window.copyCoords = function (lat, lng, btn) {
  const text = `${lat}, ${lng}`;
  navigator.clipboard.writeText(text).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span>✓ Copied!</span>`;
    setTimeout(() => { btn.innerHTML = originalText; }, 1800);
  }).catch(() => {
    showToast(`Coords: ${text}`);
  });
};

window.openPhotoModal = function (url, title, desc) {
  if (!photoModal || !photoModalImg) return;
  photoModalImg.src = url;
  if (photoModalTitle) photoModalTitle.textContent = title || "Hazard Photo";
  if (photoModalDesc) photoModalDesc.textContent = desc || "";
  photoModal.classList.add("is-open");
  photoModal.setAttribute("aria-hidden", "false");
};

window.closePhotoModal = function () {
  if (!photoModal) return;
  photoModal.classList.remove("is-open");
  photoModal.setAttribute("aria-hidden", "true");
  if (photoModalImg) photoModalImg.src = "";
};

window.focusHazard = function (lat, lng) {
  if (!map) return;
  map.flyTo([lat, lng], 16, { animate: true, duration: 1 });
};

window.setRouteDestination = function (lat, lng, name) {
  openRouteDrawer();
  routeEndCoords = { lat, lng };
  if (routeEndInput) {
    routeEndInput.value = `${name || "Hazard"} (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  }
  // If user GPS is known, auto calculate route
  if (userCurrentPosition) {
    routeStartCoords = { ...userCurrentPosition };
    if (routeStartInput) routeStartInput.value = "My Current Location";
    calculateSafeRoute();
  } else if (!routeStartCoords) {
    // Prompt to set start location
    showToast("Destination set! Enter start location or click GPS.", "success");
    if (routeStartInput) routeStartInput.focus();
  } else {
    calculateSafeRoute();
  }
};

/* ------------------------------------------------------------------ */
/* Coordinate update for new report selection                         */
/* ------------------------------------------------------------------ */
function applyCoordinates(lat, lng) {
  if (latitudeInput) latitudeInput.value = lat.toFixed(6);
  if (longitudeInput) longitudeInput.value = lng.toFixed(6);
  if (coordHint) {
    coordHint.textContent = `Selected spot: ${lat.toFixed(6)}, ${lng.toFixed(6)} — drag the pin to refine.`;
  }
}

function placeSelectionMarker(latlng) {
  if (!map) return;
  if (selectedMarker) {
    selectedMarker.setLatLng(latlng);
  } else {
    selectedMarker = L.marker(latlng, {
      draggable: true,
      title: "Drag to adjust hazard location",
      zIndexOffset: 2000,
      icon: L.divIcon({
        className: "selection-marker-icon",
        html: `<span class="sel-pulse"></span><div class="sel-pin"></div>`,
        iconSize: [28, 40],
        iconAnchor: [14, 38],
      }),
    }).addTo(map);

    selectedMarker.on("dragend", () => {
      const { lat, lng } = selectedMarker.getLatLng();
      applyCoordinates(lat, lng);
    });

    selectedMarker.on("drag", () => {
      const { lat, lng } = selectedMarker.getLatLng();
      if (latitudeInput) latitudeInput.value = lat.toFixed(6);
      if (longitudeInput) longitudeInput.value = lng.toFixed(6);
    });
  }
  applyCoordinates(latlng.lat, latlng.lng);
}

/* ------------------------------------------------------------------ */
/* Map Initialization                                                 */
/* ------------------------------------------------------------------ */
function initMap() {
  const mapElement = document.getElementById("hazard-map");
  if (!mapElement || typeof L === "undefined") {
    setMapStatus("The map library could not be loaded.", "error");
    return;
  }

  // Create Leaflet Map with smooth zoom & light aesthetic
  map = L.map("hazard-map", {
    zoomControl: false, // We use custom zoom control or add it in a clean position
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    minZoom: 3,
    maxZoom: 19,
  });

  // Add clean modern zoom control to top-left (leaves top-right open for drawers)
  L.control.zoom({ position: "topleft" }).addTo(map);

  // Initialize Tile Layers (Default to free OpenStreetMap Standard)
  switchTileLayer("osm");

  // Layers
  reportsLayer = L.layerGroup().addTo(map);
  routeLayerGroup = L.layerGroup().addTo(map);

  // Map Click Handler: Selection pin OR route point picking
  map.on("click", (e) => {
    if (isPickingRouteDestination) {
      isPickingRouteDestination = false;
      routeEndCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (routeEndInput) {
        routeEndInput.value = `Selected Point (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`;
      }
      showToast("Destination point set on map.");
      if (routeStartCoords) calculateSafeRoute();
      return;
    }

    // Default: If report form is available, drop or move selection pin
    if (latitudeInput && longitudeInput) {
      placeSelectionMarker(e.latlng);
    }
  });

  window.setTimeout(() => map.invalidateSize(), 200);
  window.addEventListener("resize", () => map.invalidateSize());

  // Setup Event Listeners
  setupUIEventListeners();

  // Load Reports
  loadReports();
}

function switchTileLayer(providerKey) {
  if (!map) return;
  const provider = TILE_PROVIDERS[providerKey] || TILE_PROVIDERS.osm;

  if (baseTileLayer) {
    map.removeLayer(baseTileLayer);
  }
  if (satelliteOverlayLayer) {
    map.removeLayer(satelliteOverlayLayer);
    satelliteOverlayLayer = null;
  }

  baseTileLayer = L.tileLayer(provider.url, provider.options).addTo(map);

  if (provider.labelsUrl) {
    satelliteOverlayLayer = L.tileLayer(provider.labelsUrl, {
      pane: "overlayPane",
      zIndex: 400,
    }).addTo(map);
  }

  baseTileLayer.bringToBack();
}

/* ------------------------------------------------------------------ */
/* Report Loading & Filtering                                         */
/* ------------------------------------------------------------------ */
async function loadReports() {
  setMapStatus("Loading verified reports…");
  try {
    const response = await fetch("/api/reports");
    if (!response.ok) throw new Error("Could not load reports.");
    const data = await response.json();
    allReports = data.reports || [];

    updateHeroStats(allReports);
    updateFilterCounts();
    renderFilteredLayers();
    updateNearbyList();

    if (allReports.length === 0) {
      setMapStatus("No reports found. Submit one to place the first marker.", "empty");
    } else {
      setMapStatus(`${allReports.length} hazard report(s) active on map.`, "hidden");
    }
  } catch (err) {
    setMapStatus("Could not load reports. Check your server connection.", "error");
  }
}

function updateFilterCounts() {
  const total = allReports.length;
  const potholes = allReports.filter((r) => r.hazard_type === "Pothole").length;
  const damaged = allReports.filter((r) => r.hazard_type === "Damaged Road").length;
  const waterlogging = allReports.filter((r) => r.hazard_type === "Waterlogging").length;
  const other = allReports.filter((r) => r.hazard_type !== "Pothole" && r.hazard_type !== "Damaged Road" && r.hazard_type !== "Waterlogging").length;

  if (countAllEl) countAllEl.textContent = String(total);
  if (countPotholeEl) countPotholeEl.textContent = String(potholes);
  if (countDamagedEl) countDamagedEl.textContent = String(damaged);
  if (countWaterloggingEl) countWaterloggingEl.textContent = String(waterlogging);
  if (countOtherEl) countOtherEl.textContent = String(other);
  if (nearbyCountBadge) nearbyCountBadge.textContent = String(total);
}

function getFilteredReports() {
  return allReports.filter((r) => {
    // Category Filter
    if (activeCategoryFilter !== "all") {
      if (activeCategoryFilter === "Other") {
        if (["Pothole", "Damaged Road", "Waterlogging"].includes(r.hazard_type)) return false;
      } else if (r.hazard_type !== activeCategoryFilter) {
        return false;
      }
    }

    // Status Filter
    if (activeStatusFilter === "active") {
      if (r.status === "Resolved" || r.status === "Dismissed") return false;
    } else if (activeStatusFilter === "Resolved") {
      if (r.status !== "Resolved") return false;
    }

    return true;
  });
}

function renderFilteredLayers() {
  if (!map || !reportsLayer) return;

  const filtered = getFilteredReports();
  reportsLayer.clearLayers();

  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }

  // 1. Render Pins
  if (activeViewMode === "pins" || activeViewMode === "both") {
    filtered.forEach((report) => {
      const lat = Number(report.latitude);
      const lng = Number(report.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const icon = createOlaHazardIcon(report.hazard_type, report.status);
      const marker = L.marker([lat, lng], { icon: icon });
      marker.bindPopup(buildPopupHtml(report), {
        maxWidth: 320,
        className: "ola-leaflet-popup",
      });
      reportsLayer.addLayer(marker);
    });
  }

  // 2. Render Heatmap if leaflet-heat is available
  if ((activeViewMode === "heat" || activeViewMode === "both") && typeof L.heatLayer === "function") {
    const heatData = filtered
      .map((r) => {
        const lat = Number(r.latitude);
        const lng = Number(r.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const weight = r.status === "Resolved" ? 0.3 : 0.8;
        return [lat, lng, weight];
      })
      .filter(Boolean);

    if (heatData.length > 0) {
      heatLayer = L.heatLayer(heatData, {
        radius: 30,
        blur: 20,
        maxZoom: 17,
        gradient: {
          0.2: "#38bdf8",
          0.4: "#34d399",
          0.6: "#fbbf24",
          0.8: "#ea580c",
          1.0: "#ef4444",
        },
      }).addTo(map);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Nearby Hazards Drawer                                              */
/* ------------------------------------------------------------------ */
function updateNearbyList() {
  if (!nearbyHazardsList) return;
  nearbyHazardsList.innerHTML = "";

  const refPoint = userCurrentPosition || {
    lat: map ? map.getCenter().lat : DEFAULT_CENTER[0],
    lng: map ? map.getCenter().lng : DEFAULT_CENTER[1],
  };

  if (nearbySubtitle) {
    nearbySubtitle.textContent = userCurrentPosition
      ? "Hazards ordered by distance from your current GPS location."
      : "Hazards ordered by distance from the current map center.";
  }

  const sorted = [...allReports]
    .map((r) => {
      const lat = Number(r.latitude);
      const lng = Number(r.longitude);
      const dist = haversineDistance(refPoint.lat, refPoint.lng, lat, lng);
      return { ...r, distMeters: dist };
    })
    .sort((a, b) => a.distMeters - b.distMeters);

  if (sorted.length === 0) {
    nearbyHazardsList.innerHTML = `<li style="padding: 1rem; color: #64748b; text-align: center;">No hazards reported yet.</li>`;
    return;
  }

  sorted.slice(0, 15).forEach((report) => {
    const cfg = HAZARD_CONFIG[report.hazard_type] || HAZARD_CONFIG["Other"];
    const li = document.createElement("li");
    li.className = "nearby-card";
    li.innerHTML = `
      <div class="nearby-info">
        <div class="nearby-title">
          <span style="color: ${cfg.color};">${cfg.iconSvg}</span>
          <span>${escapeHtml(report.hazard_type)}</span>
        </div>
        <span class="nearby-dist">${formatDistance(report.distMeters)} away</span>
      </div>
      <button type="button" class="nearby-jump-btn" onclick="focusAndOpenPopup(${report.id}, ${report.latitude}, ${report.longitude})">
        View
      </button>
    `;
    nearbyHazardsList.appendChild(li);
  });
}

window.focusAndOpenPopup = function (reportId, lat, lng) {
  if (!map) return;
  map.flyTo([lat, lng], 17, { duration: 0.8 });
  // Find marker in reportsLayer and open popup
  if (reportsLayer) {
    reportsLayer.eachLayer((layer) => {
      const pos = layer.getLatLng();
      if (Math.abs(pos.lat - lat) < 0.0001 && Math.abs(pos.lng - lng) < 0.0001) {
        layer.openPopup();
      }
    });
  }
};

/* ------------------------------------------------------------------ */
/* Safe Route Planner & Hazard Proximity Detection (OSRM API)        */
/* ------------------------------------------------------------------ */
async function calculateSafeRoute() {
  if (!routeStartCoords || !routeEndCoords) {
    showToast("Please specify both Start (A) and Destination (B).", "error");
    return;
  }

  if (calcRouteBtn) {
    calcRouteBtn.disabled = true;
    calcRouteBtn.innerHTML = `<span>Calculating safe route…</span>`;
  }

  try {
    const url = `${OSRM_ROUTE_URL}/${routeStartCoords.lng},${routeStartCoords.lat};${routeEndCoords.lng},${routeEndCoords.lat}?overview=full&geometries=geojson&steps=true`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not calculate route.");
    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      showToast("No driving route found between these points.", "error");
      return;
    }

    const route = data.routes[0];
    renderRouteOnMap(route);
    displayRouteSummary(route);
    scanRouteForHazards(route);
  } catch (err) {
    showToast("Route calculation failed. Check internet connection.", "error");
  } finally {
    if (calcRouteBtn) {
      calcRouteBtn.disabled = false;
      calcRouteBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <span>Calculate Safe Route</span>
      `;
    }
  }
}

function renderRouteOnMap(route) {
  if (!map || !routeLayerGroup) return;
  routeLayerGroup.clearLayers();

  const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);

  // Outer glowing casing line (Ola/Uber electric blue halo)
  const haloLine = L.polyline(coords, {
    color: "#2563eb",
    weight: 10,
    opacity: 0.28,
    lineCap: "round",
    lineJoin: "round",
  });

  // Core route line
  const coreLine = L.polyline(coords, {
    color: "#2563eb",
    weight: 5,
    opacity: 0.95,
    lineCap: "round",
    lineJoin: "round",
  });

  // Start & End markers
  const startMarker = L.marker([routeStartCoords.lat, routeStartCoords.lng], {
    icon: createRoutePointIcon("A"),
    zIndexOffset: 1500,
  }).bindPopup("<b>Starting Point</b>");

  const endMarker = L.marker([routeEndCoords.lat, routeEndCoords.lng], {
    icon: createRoutePointIcon("B"),
    zIndexOffset: 1500,
  }).bindPopup("<b>Destination Point</b>");

  routeLayerGroup.addLayer(haloLine);
  routeLayerGroup.addLayer(coreLine);
  routeLayerGroup.addLayer(startMarker);
  routeLayerGroup.addLayer(endMarker);

  // Fit view to route with padding
  map.fitBounds(coreLine.getBounds(), { padding: [50, 50], maxZoom: 16 });
}

function displayRouteSummary(route) {
  if (!routeResults) return;
  routeResults.classList.remove("is-hidden");

  const distanceKm = (route.distance / 1000).toFixed(1);
  const durationMin = Math.round(route.duration / 60);

  if (routeDist) routeDist.textContent = `${distanceKm} km`;
  if (routeTime) routeTime.textContent = `${durationMin} min`;
}

// Check hazards within 350 meters of any route coordinate
function scanRouteForHazards(route) {
  if (!routeHazardAlert) return;
  const routeCoords = route.geometry.coordinates; // [lng, lat]
  const PROXIMITY_THRESHOLD = 350; // meters

  const activeHazards = allReports.filter((r) => r.status !== "Resolved" && r.status !== "Dismissed");
  const detectedHazards = [];

  activeHazards.forEach((h) => {
    const hLat = Number(h.latitude);
    const hLng = Number(h.longitude);
    if (!Number.isFinite(hLat) || !Number.isFinite(hLng)) return;

    let minDistance = Infinity;
    // Check distance against sampled route coordinates
    for (let i = 0; i < routeCoords.length; i += 2) {
      const rLng = routeCoords[i][0];
      const rLat = routeCoords[i][1];
      const d = haversineDistance(hLat, hLng, rLat, rLng);
      if (d < minDistance) minDistance = d;
      if (minDistance <= PROXIMITY_THRESHOLD) break;
    }

    if (minDistance <= PROXIMITY_THRESHOLD) {
      detectedHazards.push({ ...h, distanceToRoute: minDistance });
    }
  });

  if (detectedHazards.length > 0) {
    routeHazardAlert.className = "route-hazard-alert has-hazards";
    let listHtml = detectedHazards.map((h) => `
      <li class="alert-hazard-item">
        <span>⚠️ <b>${escapeHtml(h.hazard_type)}</b> (${Math.round(h.distanceToRoute)}m from route)</span>
        <button type="button" class="alert-jump-btn" onclick="focusAndOpenPopup(${h.id}, ${h.latitude}, ${h.longitude})">Inspect</button>
      </li>
    `).join("");

    routeHazardAlert.innerHTML = `
      <div class="alert-header">
        <span>⚠️ Caution: ${detectedHazards.length} hazard(s) on this route</span>
      </div>
      <p style="margin: 0; font-size: 0.8rem;">Drive carefully. Hazards have been detected near your path:</p>
      <ul class="alert-hazard-list">${listHtml}</ul>
    `;
  } else {
    routeHazardAlert.className = "route-hazard-alert safe-route";
    routeHazardAlert.innerHTML = `
      <div class="alert-header">
        <span>✅ Safe Route Confirmed</span>
      </div>
      <p style="margin: 0;">No reported potholes or hazards detected within 350m of this route.</p>
    `;
  }
}

function clearRoute() {
  if (routeLayerGroup) routeLayerGroup.clearLayers();
  routeStartCoords = null;
  routeEndCoords = null;
  if (routeStartInput) routeStartInput.value = "";
  if (routeEndInput) routeEndInput.value = "";
  if (routeResults) routeResults.classList.add("is-hidden");
}

/* ------------------------------------------------------------------ */
/* Drawers Management                                                 */
/* ------------------------------------------------------------------ */
function openRouteDrawer() {
  if (nearbyPanel) nearbyPanel.classList.add("is-closed");
  if (routePanel) {
    routePanel.classList.remove("is-closed");
    routePanel.hidden = false;
    routeToggleBtn?.setAttribute("aria-expanded", "true");
  }
}

function closeRouteDrawer() {
  if (routePanel) {
    routePanel.classList.add("is-closed");
    routeToggleBtn?.setAttribute("aria-expanded", "false");
  }
}

function openNearbyDrawer() {
  if (routePanel) routePanel.classList.add("is-closed");
  if (nearbyPanel) {
    nearbyPanel.classList.remove("is-closed");
    nearbyPanel.hidden = false;
    nearbyToggleBtn?.setAttribute("aria-expanded", "true");
    updateNearbyList();
  }
}

function closeNearbyDrawer() {
  if (nearbyPanel) {
    nearbyPanel.classList.add("is-closed");
    nearbyToggleBtn?.setAttribute("aria-expanded", "false");
  }
}

/* ------------------------------------------------------------------ */
/* Geolocation & Locate Me                                            */
/* ------------------------------------------------------------------ */
function triggerLocateMe() {
  if (!("geolocation" in navigator)) {
    setSearchStatus("Geolocation is not supported by your browser.", "error");
    return;
  }

  if (geolocateBtn) {
    geolocateBtn.disabled = true;
    geolocateBtn.classList.add("is-loading");
  }
  setSearchStatus("Acquiring GPS location…", "loading");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (geolocateBtn) {
        geolocateBtn.disabled = false;
        geolocateBtn.classList.remove("is-loading");
      }
      setSearchStatus("Location found.", "");
      setTimeout(() => setSearchStatus(""), 3000);

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;
      userCurrentPosition = { lat, lng };

      if (!map) return;

      // Update or create user location marker and accuracy circle
      if (userLocationMarker) map.removeLayer(userLocationMarker);
      if (userAccuracyCircle) map.removeLayer(userAccuracyCircle);

      userAccuracyCircle = L.circle([lat, lng], {
        radius: Math.min(accuracy, 500),
        color: "#2563eb",
        weight: 1,
        fillColor: "#3b82f6",
        fillOpacity: 0.12,
      }).addTo(map);

      userLocationMarker = L.marker([lat, lng], {
        icon: createUserLocationIcon(),
        zIndexOffset: 1200,
      }).addTo(map).bindPopup("<b>You are here</b><br>Accurate within " + Math.round(accuracy) + "m");

      map.flyTo([lat, lng], 16, { animate: true, duration: 1.2 });

      // If report form is visible, set selection marker
      if (latitudeInput && !latitudeInput.value) {
        placeSelectionMarker({ lat, lng });
      }

      updateNearbyList();
      showToast("GPS position acquired.");
    },
    (error) => {
      if (geolocateBtn) {
        geolocateBtn.disabled = false;
        geolocateBtn.classList.remove("is-loading");
      }
      let msg = "Could not get your location.";
      if (error.code === error.PERMISSION_DENIED) {
        msg = "Location permission denied. Please allow it in browser settings.";
      } else if (error.code === error.TIMEOUT) {
        msg = "GPS location request timed out.";
      }
      setSearchStatus(msg, "error");
      showToast(msg, "error");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

/* ------------------------------------------------------------------ */
/* Nominatim Geocoding Search & Suggestions                           */
/* ------------------------------------------------------------------ */
/* Geocoding Search & Suggestions (Backend Proxy & Photon Fallback)   */
/* ------------------------------------------------------------------ */
let currentSuggestions = [];

function openSuggestions(results) {
  if (!suggestionList || !searchInput) return;
  suggestionList.innerHTML = "";
  currentSuggestions = results || [];
  activeSuggestionIndex = -1;

  if (currentSuggestions.length === 0) {
    const li = document.createElement("li");
    li.className = "suggestion-item suggestion-empty";
    li.textContent = "No matching locations or hazards found.";
    suggestionList.appendChild(li);
  } else {
    currentSuggestions.forEach((res, idx) => {
      const li = document.createElement("li");
      li.className = `suggestion-item ${res.type === "hazard" ? "suggestion-hazard" : ""}`;
      li.id = `suggestion-${idx}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");

      const iconSvg = res.type === "hazard"
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

      const badgeHtml = res.type === "hazard"
        ? `<span class="suggestion-badge badge-hazard">${escapeHtml(res.hazard_type || "Hazard")}</span>`
        : `<span class="suggestion-badge badge-place">Place</span>`;

      li.innerHTML = `
        ${iconSvg}
        <span class="suggestion-name">${escapeHtml(res.display_name)}</span>
        ${badgeHtml}
      `;

      li.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        selectSuggestion(res);
      });
      suggestionList.appendChild(li);
    });
  }

  suggestionList.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
}

function updateActiveSuggestion(index) {
  if (!suggestionList) return;
  const items = suggestionList.querySelectorAll(".suggestion-item:not(.suggestion-empty)");
  items.forEach((item, i) => {
    const isSelected = i === index;
    item.classList.toggle("is-active", isSelected);
    item.setAttribute("aria-selected", String(isSelected));
    if (isSelected) {
      item.scrollIntoView({ block: "nearest" });
      if (searchInput) searchInput.setAttribute("aria-activedescendant", item.id);
    }
  });
  if (index < 0 && searchInput) {
    searchInput.removeAttribute("aria-activedescendant");
  }
}

function closeSuggestions() {
  if (!suggestionList || !searchInput) return;
  suggestionList.hidden = true;
  searchInput.setAttribute("aria-expanded", "false");
  searchInput.removeAttribute("aria-activedescendant");
  activeSuggestionIndex = -1;
}

function selectSuggestion(result) {
  if (!map || !result) return;
  closeSuggestions();
  if (searchInput) searchInput.value = result.display_name;
  if (searchClearBtn) searchClearBtn.classList.remove("is-hidden");

  const lat = parseFloat(result.lat);
  const lng = parseFloat(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  if (result.type === "hazard" && result.hazard_id) {
    if (typeof window.focusAndOpenPopup === "function") {
      window.focusAndOpenPopup(result.hazard_id, lat, lng);
    } else {
      map.flyTo([lat, lng], 17, { duration: 1 });
    }
    showToast(`Navigated to reported ${result.hazard_type || "hazard"}.`);
  } else if (result.boundingbox && result.boundingbox.length === 4) {
    const bb = result.boundingbox.map(Number);
    map.fitBounds([[bb[0], bb[2]], [bb[1], bb[3]]], { maxZoom: 17, padding: [30, 30] });
    showToast(`Navigated to ${result.display_name.split(",")[0]}.`);
  } else {
    map.flyTo([lat, lng], 15, { duration: 1 });
    showToast(`Navigated to ${result.display_name.split(",")[0]}.`);
  }

  if (latitudeInput) {
    placeSelectionMarker({ lat, lng });
  }
  setSearchStatus("");
}

async function geocode(query) {
  if (!query || query.trim().length < SEARCH_MIN_CHARS) {
    closeSuggestions();
    setSearchStatus("");
    return;
  }

  const queryClean = query.trim();
  const qLower = queryClean.toLowerCase();
  setSearchStatus("Searching places & hazards…", "loading");

  // Immediate local hazard matches from client memory
  const localHazardMatches = (allReports || [])
    .filter((r) => {
      const typeMatch = (r.hazard_type || "").toLowerCase().includes(qLower);
      const descMatch = (r.description || "").toLowerCase().includes(qLower);
      return typeMatch || descMatch;
    })
    .slice(0, 3)
    .map((r) => {
      const snippet = (r.description || "").trim();
      const shortDesc = snippet.length > 50 ? `${snippet.slice(0, 48)}…` : snippet;
      return {
        display_name: `${r.hazard_type}: ${shortDesc}`,
        lat: String(r.latitude),
        lon: String(r.longitude),
        type: "hazard",
        hazard_id: r.id,
        hazard_type: r.hazard_type,
        status: r.status,
      };
    });

  try {
    // 1. Try our own same-origin backend proxy
    let places = [];
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(queryClean)}`);
      if (res.ok) {
        const data = await res.json();
        places = data.results || [];
      }
    } catch (_proxyErr) {
      // 2. Direct fallback to Photon OSM if backend proxy fails
      const fallbackRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(queryClean)}&limit=6`);
      if (fallbackRes.ok) {
        const fbData = await fallbackRes.json();
        places = (fbData.features || []).map((f) => {
          const coords = f.geometry?.coordinates || [0, 0];
          const props = f.properties || {};
          const name = [props.name, props.district, props.city, props.state, props.country]
            .filter(Boolean)
            .join(", ");
          return {
            display_name: name,
            lat: String(coords[1]),
            lon: String(coords[0]),
            type: "place",
          };
        });
      }
    }

    // Combine local hazards and place matches (avoid duplicate hazards)
    const combined = [...localHazardMatches];
    places.forEach((p) => {
      if (p.type !== "hazard" || !combined.some((c) => c.hazard_id && c.hazard_id === p.hazard_id)) {
        combined.push(p);
      }
    });

    setSearchStatus("");
    openSuggestions(combined);
  } catch (_err) {
    if (localHazardMatches.length > 0) {
      setSearchStatus("");
      openSuggestions(localHazardMatches);
    } else {
      setSearchStatus("Search temporarily unavailable.", "error");
      closeSuggestions();
    }
  }
}

/* ------------------------------------------------------------------ */
/* Event Listeners Setup                                              */
/* ------------------------------------------------------------------ */
function setupUIEventListeners() {
  // Search input events
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.trim();
      if (searchClearBtn) {
        searchClearBtn.classList.toggle("is-hidden", q.length === 0);
      }
      clearTimeout(searchDebounceTimer);
      if (q.length < SEARCH_MIN_CHARS) {
        closeSuggestions();
        setSearchStatus("");
        return;
      }
      searchDebounceTimer = setTimeout(() => geocode(q), SEARCH_DEBOUNCE_MS);
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (currentSuggestions.length > 0) {
          activeSuggestionIndex = (activeSuggestionIndex + 1) % currentSuggestions.length;
          updateActiveSuggestion(activeSuggestionIndex);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (currentSuggestions.length > 0) {
          activeSuggestionIndex = (activeSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
          updateActiveSuggestion(activeSuggestionIndex);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeSuggestionIndex >= 0 && activeSuggestionIndex < currentSuggestions.length) {
          selectSuggestion(currentSuggestions[activeSuggestionIndex]);
        } else if (currentSuggestions.length > 0) {
          selectSuggestion(currentSuggestions[0]);
        } else if (searchInput.value.trim().length >= SEARCH_MIN_CHARS) {
          clearTimeout(searchDebounceTimer);
          geocode(searchInput.value.trim()).then(() => {
            if (currentSuggestions.length > 0) {
              selectSuggestion(currentSuggestions[0]);
            }
          });
        }
      } else if (e.key === "Escape") {
        closeSuggestions();
        searchInput.blur();
      }
    });

    searchInput.addEventListener("focus", () => {
      if (searchInput.value.trim().length >= SEARCH_MIN_CHARS && currentSuggestions.length > 0) {
        suggestionList.hidden = false;
        searchInput.setAttribute("aria-expanded", "true");
      }
    });

    searchInput.addEventListener("blur", () => {
      // Delay closing to allow pointerdown on suggestions to register
      setTimeout(closeSuggestions, 220);
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", () => {
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
      }
      searchClearBtn.classList.add("is-hidden");
      closeSuggestions();
      setSearchStatus("");
      currentSuggestions = [];
    });
  }

  // Locate Me button
  if (geolocateBtn) {
    geolocateBtn.addEventListener("click", triggerLocateMe);
  }

  // Drawers Toggle buttons
  if (routeToggleBtn) {
    routeToggleBtn.addEventListener("click", () => {
      if (routePanel && !routePanel.classList.contains("is-closed")) {
        closeRouteDrawer();
      } else {
        openRouteDrawer();
      }
    });
  }

  if (closeRoutePanel) {
    closeRoutePanel.addEventListener("click", closeRouteDrawer);
  }

  if (nearbyToggleBtn) {
    nearbyToggleBtn.addEventListener("click", () => {
      if (nearbyPanel && !nearbyPanel.classList.contains("is-closed")) {
        closeNearbyDrawer();
      } else {
        openNearbyDrawer();
      }
    });
  }

  if (closeNearbyPanel) {
    closeNearbyPanel.addEventListener("click", closeNearbyDrawer);
  }

  // Reset view to bounds of all reports or default center
  if (resetViewBtn) {
    resetViewBtn.addEventListener("click", () => {
      if (!map) return;
      if (allReports.length > 0) {
        const bounds = L.latLngBounds(
          allReports
            .filter((r) => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)))
            .map((r) => [Number(r.latitude), Number(r.longitude)])
        );
        if (bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 15, duration: 1 });
          showToast("Map view reset to all hazards.");
          return;
        }
      }
      map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 1 });
      showToast("Map view reset to default.");
    });
  }

  // Fullscreen toggle
  if (fullscreenBtn && mapFrameContainer) {
    fullscreenBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        mapFrameContainer.requestFullscreen().catch(() => {});
        fsEnterIcon?.classList.add("is-hidden");
        fsExitIcon?.classList.remove("is-hidden");
      } else {
        document.exitFullscreen().catch(() => {});
        fsEnterIcon?.classList.remove("is-hidden");
        fsExitIcon?.classList.add("is-hidden");
      }
      setTimeout(() => map?.invalidateSize(), 300);
    });

    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement) {
        fsEnterIcon?.classList.remove("is-hidden");
        fsExitIcon?.classList.add("is-hidden");
      }
      setTimeout(() => map?.invalidateSize(), 300);
    });
  }

  // Category filter chips
  categoryChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      categoryChips.forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      activeCategoryFilter = chip.getAttribute("data-filter") || "all";
      renderFilteredLayers();
    });
  });

  // Status dropdown filter
  if (statusFilterSelect) {
    statusFilterSelect.addEventListener("change", (e) => {
      activeStatusFilter = e.target.value;
      renderFilteredLayers();
    });
  }

  // View mode segmented control: Pins vs Heatmap vs Both
  segButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      segButtons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      activeViewMode = btn.getAttribute("data-mode") || "pins";
      renderFilteredLayers();
      showToast(`View mode: ${activeViewMode.toUpperCase()}`);
    });
  });

  // Tile Layer Picker
  if (layerSelect) {
    layerSelect.addEventListener("change", (e) => {
      switchTileLayer(e.target.value);
      showToast(`Map style updated to ${e.target.options[e.target.selectedIndex].text}`);
    });
  }

  // Route Drawer actions
  if (routeUseGpsBtn) {
    routeUseGpsBtn.addEventListener("click", () => {
      if (userCurrentPosition) {
        routeStartCoords = { ...userCurrentPosition };
        if (routeStartInput) routeStartInput.value = "My GPS Location";
        showToast("Start point set to current GPS.");
      } else {
        triggerLocateMe();
        showToast("Acquiring GPS location for route…");
      }
    });
  }

  if (routePickMapBtn) {
    routePickMapBtn.addEventListener("click", () => {
      isPickingRouteDestination = true;
      showToast("Click any location or hazard on the map to set destination.");
    });
  }

  if (calcRouteBtn) {
    calcRouteBtn.addEventListener("click", calculateSafeRoute);
  }

  if (clearRouteBtn) {
    clearRouteBtn.addEventListener("click", clearRoute);
  }

  // Legend Collapse Toggle
  if (toggleLegendBtn && legendContent) {
    toggleLegendBtn.addEventListener("click", () => {
      const isExpanded = toggleLegendBtn.getAttribute("aria-expanded") === "true";
      toggleLegendBtn.setAttribute("aria-expanded", !isExpanded);
      legendContent.classList.toggle("is-collapsed", isExpanded);
    });
  }

  // Photo Lightbox Modal controls
  if (photoModalClose) {
    photoModalClose.addEventListener("click", window.closePhotoModal);
  }
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", window.closePhotoModal);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && photoModal?.classList.contains("is-open")) {
      window.closePhotoModal();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Report Form Submission Handling & UI Enhancements                  */
/* ------------------------------------------------------------------ */
function setupReportFormEnhancements() {
  const cards = document.querySelectorAll(".hazard-cards-compact .hazard-select-card");
  const hiddenType = document.getElementById("hazard-type");
  const descArea = document.getElementById("description");
  const charCount = document.getElementById("char-count");
  const dropZone = document.getElementById("drop-zone");
  const photoInput = document.getElementById("photo");
  const dropIdle = document.getElementById("drop-zone-idle");
  const previewWrap = document.getElementById("photo-preview-wrap");
  const previewImg = document.getElementById("photo-preview-img");
  const previewFilename = document.getElementById("preview-filename");
  const previewFilesize = document.getElementById("preview-filesize");
  const removePhotoBtn = document.getElementById("remove-photo-btn");

  // 1. Hazard Selection Cards (Click & Keyboard)
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      cards.forEach((c) => {
        c.classList.remove("is-selected");
        c.setAttribute("aria-checked", "false");
      });
      card.classList.add("is-selected");
      card.setAttribute("aria-checked", "true");
      if (hiddenType) hiddenType.value = card.getAttribute("data-type") || "";
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.click();
      }
    });
  });

  // 2. Character Counter
  if (descArea && charCount) {
    descArea.addEventListener("input", () => {
      const len = descArea.value.trim().length;
      charCount.textContent = String(len);
    });
  }

  // 3. Drag-and-Drop Image Upload
  if (dropZone && photoInput) {
    dropZone.addEventListener("click", (e) => {
      if (e.target !== removePhotoBtn && !removePhotoBtn?.contains(e.target)) {
        photoInput.click();
      }
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add("is-dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove("is-dragover");
      });
    });

    dropZone.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          photoInput.files = dt.files;
        } catch (_e) {}
        handlePreview(file);
      }
    });

    photoInput.addEventListener("change", () => {
      if (photoInput.files && photoInput.files[0]) {
        handlePreview(photoInput.files[0]);
      }
    });

    function handlePreview(file) {
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        setFormMessage("The photo is too large. Maximum size is 5 MB.", "error");
        clearPhoto();
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        if (previewImg) previewImg.src = e.target.result;
        if (previewFilename) previewFilename.textContent = file.name;
        if (previewFilesize) previewFilesize.textContent = (file.size / (1024 * 1024)).toFixed(1) + " MB";
        dropIdle?.classList.add("is-hidden");
        previewWrap?.classList.remove("is-hidden");
      };
      reader.readAsDataURL(file);
    }

    function clearPhoto() {
      photoInput.value = "";
      if (previewImg) previewImg.src = "";
      dropIdle?.classList.remove("is-hidden");
      previewWrap?.classList.add("is-hidden");
    }

    if (removePhotoBtn) {
      removePhotoBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        clearPhoto();
      });
    }
  }
}

function clientValidate() {
  const hazardType  = document.getElementById("hazard-type")?.value;
  const description = document.getElementById("description")?.value.trim() ?? "";
  const latitude    = latitudeInput?.value.trim() ?? "";
  const longitude   = longitudeInput?.value.trim() ?? "";
  const photo       = document.getElementById("photo")?.files[0];

  if (!hazardType) return "Choose a hazard category card.";
  if (description.length < 10) return "Please write a description of at least 10 characters.";
  if (!latitude || !longitude) return "Click or search the map to choose a location.";
  if (photo && photo.size > 5 * 1024 * 1024) return "The photo is too large. Maximum size is 5 MB.";
  return null;
}

if (reportForm) {
  setupReportFormEnhancements();

  reportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFormMessage("");

    const validationError = clientValidate();
    if (validationError) {
      setFormMessage(validationError, "error");
      return;
    }

    const submitBtn = reportForm.querySelector('button[type="submit"]');
    const submitSpinner = document.getElementById("submit-spinner");
    const submitBtnText = document.getElementById("submit-btn-text");

    if (submitBtn) submitBtn.disabled = true;
    if (submitSpinner) submitSpinner.classList.remove("is-hidden");
    if (submitBtnText) submitBtnText.textContent = "Submitting report…";

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        body: new FormData(reportForm),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        setFormMessage("Your session expired. Please log in again.", "error");
        setTimeout(() => { window.location.href = "/login"; }, 1200);
        return;
      }

      if (!response.ok) {
        setFormMessage(data.error || "The report could not be saved.", "error");
        return;
      }

      // Reset form fields
      reportForm.reset();
      const hiddenType = document.getElementById("hazard-type");
      if (hiddenType) hiddenType.value = "";
      document.querySelectorAll(".hazard-cards-compact .hazard-select-card").forEach((c) => {
        c.classList.remove("is-selected");
        c.setAttribute("aria-checked", "false");
      });
      const charCount = document.getElementById("char-count");
      if (charCount) charCount.textContent = "0";
      const previewWrap = document.getElementById("photo-preview-wrap");
      const dropIdle = document.getElementById("drop-zone-idle");
      previewWrap?.classList.add("is-hidden");
      dropIdle?.classList.remove("is-hidden");

      if (latitudeInput) latitudeInput.value = "";
      if (longitudeInput) longitudeInput.value = "";
      if (coordHint) coordHint.textContent = "Search or click the map above to place the hazard pin. You can drag the pin to refine the exact spot.";
      if (selectedMarker) {
        map.removeLayer(selectedMarker);
        selectedMarker = null;
      }

      setFormMessage("Report submitted successfully. It is now live on the map.", "success");
      showToast("Hazard report saved.");
      await loadReports();

      // Pan to the newly created report
      if (data.report && map && Number.isFinite(Number(data.report.latitude)) && Number.isFinite(Number(data.report.longitude))) {
        map.flyTo([Number(data.report.latitude), Number(data.report.longitude)], 16, { duration: 1.2 });
      }
    } catch (_err) {
      setFormMessage("Network error. Please check that the server is active.", "error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (submitSpinner) submitSpinner.classList.add("is-hidden");
      if (submitBtnText) submitBtnText.textContent = "Submit report";
    }
  });
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                          */
/* ------------------------------------------------------------------ */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMap);
} else {
  initMap();
}
