/* RoadSense — navigation, map, location search, and report form */

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */
const DEFAULT_CENTER = [28.6139, 77.209];
const DEFAULT_ZOOM   = 12;
const NOMINATIM_URL  = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_UA   = "RoadSense/1.0 (student road-safety project; contact: roadsense-dev@example.com)";
/* Nominatim policy: max 1 req/sec. We debounce at 600 ms and enforce
   a 1 000 ms minimum gap between actual network requests.            */
const SEARCH_DEBOUNCE_MS  = 600;
const SEARCH_MIN_CHARS    = 2;

/* ------------------------------------------------------------------ */
/* DOM references                                                       */
/* ------------------------------------------------------------------ */
const navToggle      = document.querySelector(".nav-toggle");
const navLinks       = document.querySelector(".nav-links");
const toast          = document.getElementById("toast");
const mapStatus      = document.getElementById("map-status");
const searchInput    = document.getElementById("location-search");
const suggestionList = document.getElementById("search-suggestions");
const searchStatus   = document.getElementById("search-status");
const geolocateBtn   = document.getElementById("geolocate-btn");
const reportForm     = document.getElementById("report-form");
const formMessage    = document.getElementById("form-message");
const latitudeInput  = document.getElementById("latitude");
const longitudeInput = document.getElementById("longitude");
const coordHint      = document.getElementById("coord-hint");

/* ------------------------------------------------------------------ */
/* Map state                                                            */
/* ------------------------------------------------------------------ */
let map;
let reportsLayer;
let selectedMarker;       // Draggable pin the user places
let lastSearchTime = 0;   // Timestamp of last Nominatim request

/* ------------------------------------------------------------------ */
/* Nav menu                                                             */
/* ------------------------------------------------------------------ */
function closeMenu() {
  if (!navLinks || !navToggle) return;
  navLinks.classList.remove("open");
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.setAttribute("aria-label", "Open menu");
}

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  });
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });
}

/* ------------------------------------------------------------------ */
/* Toast                                                                */
/* ------------------------------------------------------------------ */
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3500);
}

/* ------------------------------------------------------------------ */
/* Map status bar                                                       */
/* ------------------------------------------------------------------ */
function setMapStatus(message, kind) {
  if (!mapStatus) return;
  mapStatus.textContent = message;
  mapStatus.classList.remove("is-error", "is-empty", "is-hidden");
  if (kind === "error")  mapStatus.classList.add("is-error");
  else if (kind === "empty") mapStatus.classList.add("is-empty");
  else if (kind === "hidden") mapStatus.classList.add("is-hidden");
}

/* ------------------------------------------------------------------ */
/* Search status line                                                   */
/* ------------------------------------------------------------------ */
function setSearchStatus(message, kind) {
  if (!searchStatus) return;
  searchStatus.textContent = message;
  searchStatus.className = "search-status";
  if (kind === "error") searchStatus.classList.add("is-error");
  else if (kind === "loading") searchStatus.classList.add("is-loading");
  else if (!message) searchStatus.classList.add("is-hidden");
}

/* ------------------------------------------------------------------ */
/* Form message                                                         */
/* ------------------------------------------------------------------ */
function setFormMessage(message, kind) {
  if (!formMessage) return;
  formMessage.textContent = message;
  formMessage.classList.remove("is-error", "is-success");
  if (kind === "error")   formMessage.classList.add("is-error");
  if (kind === "success") formMessage.classList.add("is-success");
}

/* ------------------------------------------------------------------ */
/* HTML escaping                                                        */
/* ------------------------------------------------------------------ */
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* ------------------------------------------------------------------ */
/* Coordinate update — shared by click, drag, search, and geolocation  */
/* ------------------------------------------------------------------ */
function applyCoordinates(lat, lng) {
  if (latitudeInput)  latitudeInput.value  = lat.toFixed(6);
  if (longitudeInput) longitudeInput.value = lng.toFixed(6);
  if (coordHint) {
    coordHint.textContent =
      `Selected: ${lat.toFixed(6)}, ${lng.toFixed(6)} — drag the pin to refine.`;
  }
}

/* ------------------------------------------------------------------ */
/* Selection marker: draggable pin                                      */
/* ------------------------------------------------------------------ */
function placeSelectionMarker(latlng) {
  if (!map) return;
  if (selectedMarker) {
    selectedMarker.setLatLng(latlng);
  } else {
    selectedMarker = L.marker(latlng, {
      draggable: true,
      title: "Drag to adjust location",
      alt: "Selected hazard location",
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: "selection-marker-icon",
        html: `<div class="sel-pin"></div>`,
        iconSize:   [24, 36],
        iconAnchor: [12, 36],
        popupAnchor:[0, -36],
      }),
    }).addTo(map);

    selectedMarker.on("dragend", () => {
      const { lat, lng } = selectedMarker.getLatLng();
      applyCoordinates(lat, lng);
    });

    selectedMarker.on("drag", () => {
      const { lat, lng } = selectedMarker.getLatLng();
      if (latitudeInput)  latitudeInput.value  = lat.toFixed(6);
      if (longitudeInput) longitudeInput.value = lng.toFixed(6);
    });
  }
  applyCoordinates(latlng.lat, latlng.lng);
}

/* ------------------------------------------------------------------ */
/* Suggestions dropdown                                                 */
/* ------------------------------------------------------------------ */
function openSuggestions(results) {
  if (!suggestionList || !searchInput) return;
  suggestionList.innerHTML = "";
  if (results.length === 0) {
    const li = document.createElement("li");
    li.className = "suggestion-item suggestion-empty";
    li.textContent = "No results found.";
    li.setAttribute("role", "option");
    li.setAttribute("aria-disabled", "true");
    suggestionList.appendChild(li);
  } else {
    results.forEach((result, index) => {
      const li = document.createElement("li");
      li.className = "suggestion-item";
      li.setAttribute("role", "option");
      li.setAttribute("id", `suggestion-${index}`);
      li.textContent = result.display_name;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus on input
        selectSuggestion(result);
      });
      suggestionList.appendChild(li);
    });
  }
  suggestionList.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
}

function closeSuggestions() {
  if (!suggestionList || !searchInput) return;
  suggestionList.hidden = true;
  searchInput.setAttribute("aria-expanded", "false");
}

function selectSuggestion(result) {
  if (!map) return;
  closeSuggestions();
  if (searchInput) searchInput.value = result.display_name;

  const lat = parseFloat(result.lat);
  const lng = parseFloat(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  /* Zoom level: use the bounding box when available for a natural fit,
     but cap at zoom 17 to keep context visible.                         */
  if (result.boundingbox && result.boundingbox.length === 4) {
    const bb = result.boundingbox.map(Number);
    const bounds = [[bb[0], bb[2]], [bb[1], bb[3]]];
    map.fitBounds(bounds, { maxZoom: 17, padding: [20, 20] });
  } else {
    map.setView([lat, lng], 15);
  }

  /* Only place a selection pin if the report form is visible */
  if (latitudeInput) {
    placeSelectionMarker({ lat, lng });
  }
  setSearchStatus("");
}

/* ------------------------------------------------------------------ */
/* Keyboard navigation inside the suggestions list                      */
/* ------------------------------------------------------------------ */
let activeSuggestionIndex = -1;

function moveSuggestionFocus(delta) {
  if (!suggestionList || suggestionList.hidden) return;
  const items = suggestionList.querySelectorAll(".suggestion-item:not(.suggestion-empty)");
  if (!items.length) return;

  activeSuggestionIndex = Math.max(0, Math.min(activeSuggestionIndex + delta, items.length - 1));
  items.forEach((el, i) => {
    el.classList.toggle("is-active", i === activeSuggestionIndex);
    if (i === activeSuggestionIndex) {
      searchInput.setAttribute("aria-activedescendant", el.id);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Nominatim geocoding (rate-limited to 1 req/s with debounce)         */
/* ------------------------------------------------------------------ */
let searchDebounceTimer = null;

async function geocode(query) {
  if (!query || query.trim().length < SEARCH_MIN_CHARS) {
    closeSuggestions();
    setSearchStatus("");
    return;
  }

  /* Rate-limit: enforce at least 1 000 ms between requests */
  const now = Date.now();
  const msUntilAllowed = 1000 - (now - lastSearchTime);
  if (msUntilAllowed > 0) {
    await new Promise((resolve) => setTimeout(resolve, msUntilAllowed));
  }

  setSearchStatus("Searching…", "loading");
  lastSearchTime = Date.now();

  try {
    const params = new URLSearchParams({
      q:              query.trim(),
      format:         "json",
      limit:          "6",
      addressdetails: "0",
      /* Bounding box bias: India/South-Asia region — soft hint only */
      viewbox:        "68.0,8.0,97.5,37.1",
      bounded:        "0",
    });
    const response = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        "User-Agent": NOMINATIM_UA,
        "Accept-Language": "en",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const results = await response.json();
    setSearchStatus("");

    /* Guard: make sure the user hasn't cleared the input while we waited */
    if (!searchInput || searchInput.value.trim().length < SEARCH_MIN_CHARS) {
      closeSuggestions();
      return;
    }
    openSuggestions(results);
  } catch (err) {
    setSearchStatus("Search unavailable. Check your connection.", "error");
    closeSuggestions();
  }
}

/* ------------------------------------------------------------------ */
/* Search input events                                                  */
/* ------------------------------------------------------------------ */
if (searchInput) {
  searchInput.addEventListener("input", () => {
    activeSuggestionIndex = -1;
    clearTimeout(searchDebounceTimer);
    const q = searchInput.value.trim();
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
      moveSuggestionFocus(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSuggestionFocus(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!suggestionList || suggestionList.hidden) {
        /* Trigger an immediate search */
        clearTimeout(searchDebounceTimer);
        geocode(searchInput.value.trim());
        return;
      }
      const items = suggestionList.querySelectorAll(".suggestion-item:not(.suggestion-empty)");
      const idx = activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0;
      if (items[idx]) items[idx].dispatchEvent(new MouseEvent("mousedown"));
    } else if (e.key === "Escape") {
      closeSuggestions();
    }
  });

  searchInput.addEventListener("blur", () => {
    /* Small delay so mousedown on a suggestion fires first */
    setTimeout(closeSuggestions, 200);
  });

  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim().length >= SEARCH_MIN_CHARS &&
        suggestionList && !suggestionList.hidden) {
      suggestionList.hidden = false;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Browser geolocation                                                  */
/* ------------------------------------------------------------------ */
if (geolocateBtn) {
  geolocateBtn.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      setSearchStatus("Geolocation is not supported by your browser.", "error");
      return;
    }
    geolocateBtn.disabled = true;
    geolocateBtn.classList.add("is-loading");
    setSearchStatus("Locating you…", "loading");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        geolocateBtn.disabled = false;
        geolocateBtn.classList.remove("is-loading");
        setSearchStatus("Location found.", "");
        setTimeout(() => setSearchStatus(""), 3000);

        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        if (map) map.setView([lat, lng], 16);
        if (latitudeInput) placeSelectionMarker({ lat, lng });
      },
      (error) => {
        geolocateBtn.disabled = false;
        geolocateBtn.classList.remove("is-loading");
        let msg;
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg = "Location access was denied. Allow it in your browser settings.";
            break;
          case error.POSITION_UNAVAILABLE:
            msg = "Your location could not be determined.";
            break;
          case error.TIMEOUT:
            msg = "Location request timed out.";
            break;
          default:
            msg = "Could not get your location.";
        }
        setSearchStatus(msg, "error");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

/* ------------------------------------------------------------------ */
/* Map initialisation                                                   */
/* ------------------------------------------------------------------ */
function initMap() {
  const mapElement = document.getElementById("hazard-map");
  if (!mapElement || typeof L === "undefined") {
    setMapStatus("The map library could not be loaded.", "error");
    return;
  }

  map = L.map("hazard-map").setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  reportsLayer = L.layerGroup().addTo(map);

  /* Click to place / move selection pin */
  map.on("click", (event) => {
    if (!latitudeInput || !longitudeInput) return;
    placeSelectionMarker(event.latlng);
  });

  window.setTimeout(() => map.invalidateSize(), 200);
  window.addEventListener("resize", () => map.invalidateSize());

  loadReports();
}

/* ------------------------------------------------------------------ */
/* Popup HTML for saved hazard reports                                  */
/* ------------------------------------------------------------------ */
function popupHtml(report) {
  const description = escapeHtml(report.description);
  const hazardType  = escapeHtml(report.hazard_type);
  const status      = escapeHtml(report.status);
  let html = `
    <strong>${hazardType}</strong>
    <p>${description}</p>
    <p>Status: ${status}</p>
  `;
  if (report.photo_url) {
    const photoUrl = escapeHtml(report.photo_url);
    html += `<p><img src="${photoUrl}" alt="Hazard photograph" style="max-width:100%;max-height:160px;border-radius:6px;display:block;margin-top:6px;object-fit:cover;" /></p>`;
  }
  return html;
}

/* ------------------------------------------------------------------ */
/* Load saved reports from the API and add to the map                  */
/* ------------------------------------------------------------------ */
async function loadReports() {
  if (!reportsLayer) return;

  setMapStatus("Loading reports…");
  reportsLayer.clearLayers();

  try {
    const response = await fetch("/api/reports");
    if (!response.ok) throw new Error("Could not load reports.");
    const data    = await response.json();
    const reports = data.reports || [];

    let validCount = 0;
    reports.forEach((report) => {
      const lat = Number(report.latitude);
      const lng = Number(report.longitude);
      if (
        !Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180
      ) return;

      const marker = L.circleMarker([lat, lng], {
        radius:      8,
        color:       "#12243f",
        weight:      2,
        fillColor:   "#f26a21",
        fillOpacity: 0.9,
      });
      marker.bindPopup(popupHtml(report));
      reportsLayer.addLayer(marker);
      validCount++;
    });

    if (validCount === 0) {
      setMapStatus("No reports yet. Submit one to see a marker.", "empty");
      return;
    }
    setMapStatus(`${validCount} report(s) on the map.`, "hidden");
  } catch (_err) {
    setMapStatus("Could not load reports. Try refreshing the page.", "error");
  }
}

/* ------------------------------------------------------------------ */
/* Client-side form validation                                          */
/* ------------------------------------------------------------------ */
function clientValidate() {
  const hazardType  = document.getElementById("hazard-type")?.value;
  const description = document.getElementById("description")?.value.trim() ?? "";
  const latitude    = latitudeInput?.value.trim()  ?? "";
  const longitude   = longitudeInput?.value.trim() ?? "";
  const photo       = document.getElementById("photo")?.files[0];

  if (!hazardType)           return "Choose a hazard type.";
  if (description.length < 10) return "Please write a description of at least 10 characters.";
  if (!latitude || !longitude) return "Search or click the map to choose a location.";
  if (photo && photo.size > 5 * 1024 * 1024) return "The photo is too large. Maximum size is 5 MB.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Report form submission                                               */
/* ------------------------------------------------------------------ */
if (reportForm) {
  reportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFormMessage("");

    const validationError = clientValidate();
    if (validationError) {
      setFormMessage(validationError, "error");
      return;
    }

    const submitButton = reportForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        body:   new FormData(reportForm),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        setFormMessage("Your session expired. Please log in again.", "error");
        window.setTimeout(() => { window.location.href = "/login"; }, 1200);
        return;
      }

      if (!response.ok) {
        setFormMessage(data.error || "The report could not be saved.", "error");
        return;
      }

      /* Reset form and pin */
      reportForm.reset();
      if (latitudeInput)  latitudeInput.value  = "";
      if (longitudeInput) longitudeInput.value = "";
      if (coordHint)      coordHint.textContent = "Search or click the map above to place the hazard pin. You can drag the pin to refine the exact spot.";
      if (selectedMarker) {
        map.removeLayer(selectedMarker);
        selectedMarker = null;
      }

      setFormMessage("Report saved. It now appears on the map.", "success");
      showToast("Hazard report saved.");
      await loadReports();

      /* Pan to the newly created report */
      if (data.report &&
          map &&
          Number.isFinite(Number(data.report.latitude)) &&
          Number.isFinite(Number(data.report.longitude))) {
        map.panTo([Number(data.report.latitude), Number(data.report.longitude)]);
      }
    } catch (_err) {
      setFormMessage("Network error. Check that the Flask server is running.", "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                            */
/* ------------------------------------------------------------------ */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMap);
} else {
  initMap();
}
