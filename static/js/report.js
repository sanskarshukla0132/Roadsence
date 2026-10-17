/**
 * RoadSense — Dedicated Report Submission Controller
 * High-performance, accessible, interactive light-map hazard reporter.
 */

(function () {
  "use strict";

  // Configuration & Defaults
  const DEFAULT_CENTER = [28.6139, 77.209]; // New Delhi
  const DEFAULT_ZOOM = 14;
  const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
  const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
  const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
  const ALLOWED_EXTS = ["jpg", "jpeg", "png", "webp"];

  // DOM Elements
  const form = document.getElementById("report-form");
  if (!form) return; // Only runs when report form is present

  const hazardTypeInput = document.getElementById("hazard-type");
  const hazardCards = document.querySelectorAll(".hazard-select-card");
  const hazardError = document.getElementById("hazard-error");

  const descriptionInput = document.getElementById("description");
  const charCountEl = document.getElementById("char-count");
  const charCounterPill = document.getElementById("char-counter");
  const descStatusBadge = document.getElementById("desc-status-badge");
  const descStatusText = document.getElementById("desc-status-text");

  const dropZone = document.getElementById("drop-zone");
  const photoInput = document.getElementById("photo");
  const dropZoneIdle = document.getElementById("drop-zone-idle");
  const photoPreviewWrap = document.getElementById("photo-preview-wrap");
  const photoPreviewImg = document.getElementById("photo-preview-img");
  const previewFilename = document.getElementById("preview-filename");
  const previewFilesize = document.getElementById("preview-filesize");
  const removePhotoBtn = document.getElementById("remove-photo-btn");
  const photoError = document.getElementById("photo-error");

  const latitudeInput = document.getElementById("latitude");
  const longitudeInput = document.getElementById("longitude");
  const pinStatusText = document.getElementById("pin-status-text");
  const addressPreviewText = document.getElementById("resolved-address-text");
  const btnReportLocate = document.getElementById("btn-report-locate");
  const locateBtnText = document.getElementById("locate-btn-text");

  const reportGeoSearchInput = document.getElementById("report-geo-search");
  const btnReportSearch = document.getElementById("btn-report-search");

  const progressFill = document.getElementById("progress-fill");
  const stepNodes = [
    document.getElementById("step-node-1"),
    document.getElementById("step-node-2"),
    document.getElementById("step-node-3"),
    document.getElementById("step-node-4"),
  ];

  const formMessage = document.getElementById("form-message");
  const submitBtn = document.getElementById("submit-report-btn");
  const submitSpinner = document.getElementById("submit-spinner");
  const submitBtnText = document.getElementById("submit-btn-text");
  const submitArrowIcon = document.getElementById("submit-arrow-icon");

  const successView = document.getElementById("report-success-view");
  const successValType = document.getElementById("success-val-type");
  const successValCoords = document.getElementById("success-val-coords");
  const btnReportAnother = document.getElementById("btn-report-another");

  // Map state
  let miniMap = null;
  let reportMarker = null;

  /* ------------------------------------------------------------------ */
  /* 1. Interactive Light Map Initialization                            */
  /* ------------------------------------------------------------------ */
  function initMiniMap() {
    const mapContainer = document.getElementById("report-mini-map");
    if (!mapContainer || typeof L === "undefined") return;

    miniMap = L.map("report-mini-map", {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    // Clean, reliable, keyless OpenStreetMap Standard light tiles
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(miniMap);

    // Click on map to place or reposition pin
    miniMap.on("click", function (e) {
      setCoordinates(e.latlng.lat, e.latlng.lng, true);
    });

    // Invalidate size once rendered
    setTimeout(function () {
      if (miniMap) miniMap.invalidateSize();
    }, 250);
  }

  function createCustomPinIcon() {
    return L.divIcon({
      className: "report-custom-pin-wrap",
      html: `
        <div class="report-pin-marker">
          <span class="report-pin-radar"></span>
          <div class="report-pin-head">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="white">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/>
            </svg>
          </div>
          <span class="report-pin-stem"></span>
        </div>
      `,
      iconSize: [32, 42],
      iconAnchor: [16, 42],
    });
  }

  function setCoordinates(lat, lng, shouldReverseGeocode = false) {
    const cleanLat = Number(lat).toFixed(6);
    const cleanLng = Number(lng).toFixed(6);

    if (latitudeInput) latitudeInput.value = cleanLat;
    if (longitudeInput) longitudeInput.value = cleanLng;

    if (pinStatusText) {
      pinStatusText.textContent = `Pin placed at ${cleanLat}, ${cleanLng}`;
    }

    if (!miniMap) return;

    if (!reportMarker) {
      reportMarker = L.marker([lat, lng], {
        icon: createCustomPinIcon(),
        draggable: true,
        title: "Drag to adjust hazard position",
        zIndexOffset: 1500,
      }).addTo(miniMap);

      reportMarker.on("dragend", function (e) {
        const pos = e.target.getLatLng();
        setCoordinates(pos.lat, pos.lng, true);
      });
    } else {
      reportMarker.setLatLng([lat, lng]);
    }

    miniMap.panTo([lat, lng], { animate: true, duration: 0.8 });

    updateStepper();

    if (shouldReverseGeocode) {
      reverseGeocode(lat, lng);
    }
  }

  async function reverseGeocode(lat, lng) {
    if (!addressPreviewText) return;
    addressPreviewText.textContent = `Resolving address for ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}…`;

    try {
      const url = `/api/reverse-geocode?lat=${lat}&lon=${lng}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Reverse geocode response not ok");
      const data = await res.json();
      if (data && data.display_name) {
        addressPreviewText.textContent = `📍 ${data.display_name}`;
      } else {
        addressPreviewText.textContent = `📍 Location set: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
      }
    } catch (_err) {
      addressPreviewText.textContent = `📍 Coordinates: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 2. Geolocation Auto-Detection                                      */
  /* ------------------------------------------------------------------ */
  function autoDetectLocation() {
    if (!navigator.geolocation) {
      alertLocationError("Geolocation is not supported by your browser.");
      return;
    }

    if (btnReportLocate) {
      btnReportLocate.disabled = true;
      if (locateBtnText) locateBtnText.textContent = "Acquiring GPS Signal…";
    }

    navigator.geolocation.getCurrentPosition(
      function (position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        if (miniMap) miniMap.setView([lat, lng], 16);
        setCoordinates(lat, lng, true);

        if (btnReportLocate) {
          btnReportLocate.disabled = false;
          if (locateBtnText) locateBtnText.textContent = "✓ GPS Located";
        }
      },
      function (error) {
        if (btnReportLocate) {
          btnReportLocate.disabled = false;
          if (locateBtnText) locateBtnText.textContent = "📍 Auto-detect My Location";
        }
        let msg = "Could not obtain GPS location.";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "Location permission denied. Click anywhere on the map instead.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = "GPS signal unavailable. Please click on the map to set location.";
        }
        alertLocationError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function alertLocationError(msg) {
    if (pinStatusText) pinStatusText.textContent = msg;
    if (addressPreviewText) addressPreviewText.textContent = msg;
  }

  /* ------------------------------------------------------------------ */
  /* 3. Map Location Search                                             */
  /* ------------------------------------------------------------------ */
  async function searchMapLocation() {
    if (!reportGeoSearchInput) return;
    const query = reportGeoSearchInput.value.trim();
    if (!query) return;

    if (btnReportSearch) {
      btnReportSearch.disabled = true;
      btnReportSearch.innerHTML = `<span>Searching…</span>`;
    }

    try {
      const url = `/api/geocode?q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      const data = await res.json();
      const results = data.results || [];

      if (results && results.length > 0) {
        const lat = parseFloat(results[0].lat);
        const lng = parseFloat(results[0].lon);
        if (miniMap) miniMap.setView([lat, lng], 15);
        setCoordinates(lat, lng, false);
        if (addressPreviewText) {
          addressPreviewText.textContent = `📍 ${results[0].display_name}`;
        }
        if (pinStatusText) pinStatusText.textContent = "Location selected from search.";
      } else {
        if (pinStatusText) pinStatusText.textContent = `No results found for "${query}".`;
      }
    } catch (_err) {
      if (pinStatusText) pinStatusText.textContent = "Location search failed. Check your connection.";
    } finally {
      if (btnReportSearch) {
        btnReportSearch.disabled = false;
        btnReportSearch.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>Find</span>
        `;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* 4. Hazard Selection Cards                                          */
  /* ------------------------------------------------------------------ */
  function selectHazardCard(card) {
    const selectedType = card.getAttribute("data-type");
    if (!selectedType) return;

    hazardCards.forEach(function (c) {
      c.classList.remove("is-selected");
      c.setAttribute("aria-checked", "false");
    });

    card.classList.add("is-selected");
    card.setAttribute("aria-checked", "true");

    if (hazardTypeInput) {
      hazardTypeInput.value = selectedType;
    }

    if (hazardError) {
      hazardError.classList.add("is-hidden");
    }

    updateStepper();
  }

  /* ------------------------------------------------------------------ */
  /* 5. Live Character Counter & Inline Validation                      */
  /* ------------------------------------------------------------------ */
  function handleDescriptionInput() {
    if (!descriptionInput) return;
    const len = descriptionInput.value.trim().length;

    if (charCountEl) {
      charCountEl.textContent = String(len);
    }

    if (len === 0) {
      setDescBadge("state-neutral", "•", "Minimum 10 characters required");
      charCounterPill?.classList.remove("is-valid", "is-warning", "is-error");
    } else if (len < 10) {
      const remaining = 10 - len;
      setDescBadge("state-warning", "!", `Need ${remaining} more character${remaining > 1 ? "s" : ""}`);
      charCounterPill?.classList.remove("is-valid", "is-error");
      charCounterPill?.classList.add("is-warning");
    } else if (len <= 900) {
      setDescBadge("state-valid", "✓", "Good description");
      charCounterPill?.classList.remove("is-warning", "is-error");
      charCounterPill?.classList.add("is-valid");
    } else {
      setDescBadge("state-limit", "!", "Approaching 1000 character limit");
      charCounterPill?.classList.remove("is-valid");
      charCounterPill?.classList.add("is-warning");
    }

    updateStepper();
  }

  function setDescBadge(stateClass, icon, text) {
    if (!descStatusBadge || !descStatusText) return;
    descStatusBadge.className = `desc-status-badge ${stateClass}`;
    const iconEl = descStatusBadge.querySelector(".status-icon");
    if (iconEl) iconEl.textContent = icon;
    descStatusText.textContent = text;
  }

  /* ------------------------------------------------------------------ */
  /* 6. Drag-and-Drop Image Uploader                                    */
  /* ------------------------------------------------------------------ */
  function handleFileSelected(file) {
    if (!file) return;

    if (photoError) {
      photoError.textContent = "";
      photoError.classList.add("is-hidden");
    }

    // Validate size (5 MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      showPhotoError("File is too large. Maximum size allowed is 5 MB.");
      clearPhotoInput();
      return;
    }

    // Validate extension
    const ext = file.name.split(".").pop().toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      showPhotoError("Invalid file type. Please upload a JPG, PNG, or WEBP image.");
      clearPhotoInput();
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = function (e) {
      if (photoPreviewImg) photoPreviewImg.src = e.target.result;
      if (previewFilename) previewFilename.textContent = file.name;
      if (previewFilesize) previewFilesize.textContent = formatBytes(file.size);

      if (dropZoneIdle) dropZoneIdle.classList.add("is-hidden");
      if (photoPreviewWrap) photoPreviewWrap.classList.remove("is-hidden");
    };
    reader.readAsDataURL(file);
  }

  function clearPhotoInput() {
    if (photoInput) photoInput.value = "";
    if (photoPreviewImg) photoPreviewImg.src = "";
    if (dropZoneIdle) dropZoneIdle.classList.remove("is-hidden");
    if (photoPreviewWrap) photoPreviewWrap.classList.add("is-hidden");
  }

  function showPhotoError(msg) {
    if (photoError) {
      photoError.textContent = msg;
      photoError.classList.remove("is-hidden");
    }
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /* ------------------------------------------------------------------ */
  /* 7. Stepper & Completion Progress Bar                               */
  /* ------------------------------------------------------------------ */
  function updateStepper() {
    const hasCategory = Boolean(hazardTypeInput && hazardTypeInput.value);
    const hasDesc = Boolean(descriptionInput && descriptionInput.value.trim().length >= 10);
    const hasLocation = Boolean(latitudeInput && latitudeInput.value && longitudeInput && longitudeInput.value);

    // Calculate percent
    let completedSteps = 0;
    if (hasCategory) completedSteps += 1;
    if (hasDesc) completedSteps += 1;
    if (hasLocation) completedSteps += 1;

    let percentage = 25;
    if (completedSteps === 1) percentage = 50;
    if (completedSteps === 2) percentage = 75;
    if (completedSteps === 3) percentage = 100;

    if (progressFill) progressFill.style.width = `${percentage}%`;

    // Step 1 node
    if (stepNodes[0]) {
      stepNodes[0].classList.toggle("is-completed", hasCategory);
      stepNodes[0].classList.toggle("is-active", !hasCategory);
    }
    // Step 2 node
    if (stepNodes[1]) {
      stepNodes[1].classList.toggle("is-completed", hasDesc);
      stepNodes[1].classList.toggle("is-active", hasCategory && !hasDesc);
    }
    // Step 3 node
    if (stepNodes[2]) {
      stepNodes[2].classList.toggle("is-completed", hasLocation);
      stepNodes[2].classList.toggle("is-active", hasCategory && hasDesc && !hasLocation);
    }
    // Step 4 node
    if (stepNodes[3]) {
      stepNodes[3].classList.toggle("is-active", hasCategory && hasDesc && hasLocation);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 8. Form Validation & Submission                                    */
  /* ------------------------------------------------------------------ */
  function validateForm() {
    hideFormMessage();

    if (!hazardTypeInput || !hazardTypeInput.value) {
      if (hazardError) hazardError.classList.remove("is-hidden");
      showFormMessage("Please select a hazard category (Step 1).", "error");
      const categorySec = document.getElementById("section-category");
      if (categorySec) categorySec.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }

    const desc = descriptionInput ? descriptionInput.value.trim() : "";
    if (desc.length < 10) {
      showFormMessage("Description must be at least 10 characters.", "error");
      if (descriptionInput) descriptionInput.focus();
      return false;
    }
    if (desc.length > 1000) {
      showFormMessage("Description is too long (maximum 1000 characters).", "error");
      if (descriptionInput) descriptionInput.focus();
      return false;
    }

    const lat = latitudeInput ? latitudeInput.value.trim() : "";
    const lng = longitudeInput ? longitudeInput.value.trim() : "";
    if (!lat || !lng) {
      showFormMessage("Please pinpoint the hazard location on the map or use GPS auto-detect (Step 3).", "error");
      const locSec = document.getElementById("section-location");
      if (locSec) locSec.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }

    return true;
  }

  function showFormMessage(msg, type = "error") {
    if (!formMessage) return;
    formMessage.textContent = msg;
    formMessage.className = `form-message-banner is-${type}`;
    formMessage.classList.remove("is-hidden");
  }

  function hideFormMessage() {
    if (!formMessage) return;
    formMessage.textContent = "";
    formMessage.className = "form-message-banner is-hidden";
  }

  function setSubmittingState(isSubmitting) {
    if (submitBtn) submitBtn.disabled = isSubmitting;
    if (submitSpinner) submitSpinner.classList.toggle("is-hidden", !isSubmitting);
    if (submitArrowIcon) submitArrowIcon.classList.toggle("is-hidden", isSubmitting);
    if (submitBtnText) {
      submitBtnText.textContent = isSubmitting ? "Submitting Report…" : "Submit Hazard Report";
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!validateForm()) return;

    setSubmittingState(true);

    try {
      const formData = new FormData(form);
      const response = await fetch("/api/reports", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        showFormMessage("Your session expired. Redirecting to login…", "error");
        setTimeout(function () {
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        }, 1200);
        return;
      }

      if (!response.ok) {
        showFormMessage(data.error || "The report could not be submitted. Please check the fields.", "error");
        setSubmittingState(false);
        return;
      }

      // Success! Show success view
      renderSuccessView(data.report || {});
    } catch (_err) {
      showFormMessage("Network error. Could not connect to the RoadSense server.", "error");
      setSubmittingState(false);
    }
  }

  function renderSuccessView(report) {
    if (form) form.classList.add("is-hidden");
    if (successView) {
      successView.classList.remove("is-hidden");
      successView.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (successValType) successValType.textContent = report.hazard_type || hazardTypeInput.value;
    if (successValCoords) {
      const lat = report.latitude ?? latitudeInput.value;
      const lng = report.longitude ?? longitudeInput.value;
      successValCoords.textContent = `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
    }
  }

  function resetFormAndViews() {
    form.reset();
    clearPhotoInput();
    hazardCards.forEach((c) => {
      c.classList.remove("is-selected");
      c.setAttribute("aria-checked", "false");
    });
    if (hazardTypeInput) hazardTypeInput.value = "";
    if (latitudeInput) latitudeInput.value = "";
    if (longitudeInput) longitudeInput.value = "";
    if (reportMarker && miniMap) {
      miniMap.removeLayer(reportMarker);
      reportMarker = null;
    }
    if (pinStatusText) pinStatusText.textContent = "Click anywhere on the map to place hazard pin";
    if (addressPreviewText) addressPreviewText.textContent = "No location selected yet. Click map or auto-detect GPS.";
    handleDescriptionInput();
    updateStepper();
    hideFormMessage();
    setSubmittingState(false);

    if (successView) successView.classList.add("is-hidden");
    if (form) form.classList.remove("is-hidden");
  }

  /* ------------------------------------------------------------------ */
  /* 9. Event Listeners Setup                                           */
  /* ------------------------------------------------------------------ */
  function setupEventListeners() {
    // Hazard Card Clicks & Keyboard
    hazardCards.forEach(function (card) {
      card.addEventListener("click", function () {
        selectHazardCard(card);
      });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectHazardCard(card);
        }
      });
    });

    // Description text input
    if (descriptionInput) {
      descriptionInput.addEventListener("input", handleDescriptionInput);
    }

    // Drag-and-drop events
    if (dropZone) {
      dropZone.addEventListener("click", function (e) {
        if (e.target !== removePhotoBtn && !removePhotoBtn?.contains(e.target)) {
          if (photoInput) photoInput.click();
        }
      });
      dropZone.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (photoInput) photoInput.click();
        }
      });

      ["dragenter", "dragover"].forEach(function (eventName) {
        dropZone.addEventListener(eventName, function (e) {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.add("is-dragover");
        });
      });

      ["dragleave", "drop"].forEach(function (eventName) {
        dropZone.addEventListener(eventName, function (e) {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.remove("is-dragover");
        });
      });

      dropZone.addEventListener("drop", function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          const file = e.dataTransfer.files[0];
          // Assign to file input using DataTransfer
          const dt = new DataTransfer();
          dt.items.add(file);
          if (photoInput) photoInput.files = dt.files;
          handleFileSelected(file);
        }
      });
    }

    // Photo input file change
    if (photoInput) {
      photoInput.addEventListener("change", function () {
        if (photoInput.files && photoInput.files[0]) {
          handleFileSelected(photoInput.files[0]);
        }
      });
    }

    // Remove photo
    if (removePhotoBtn) {
      removePhotoBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        clearPhotoInput();
      });
    }

    // Auto-detect GPS button
    if (btnReportLocate) {
      btnReportLocate.addEventListener("click", autoDetectLocation);
    }

    // Search location
    if (btnReportSearch) {
      btnReportSearch.addEventListener("click", searchMapLocation);
    }
    if (reportGeoSearchInput) {
      reportGeoSearchInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          searchMapLocation();
        }
      });
    }

    // Form submit
    form.addEventListener("submit", handleSubmit);

    // Report another button
    if (btnReportAnother) {
      btnReportAnother.addEventListener("click", resetFormAndViews);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Bootstrap Initialization                                           */
  /* ------------------------------------------------------------------ */
  function init() {
    initMiniMap();
    setupEventListeners();
    updateStepper();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
