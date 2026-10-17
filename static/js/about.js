/* ================================================================== */
/* RoadSense — Interactive 3D Road & Pothole WebGL Inspector (Three.js) */
/* ================================================================== */

(function () {
  "use strict";

  const canvas = document.getElementById("about-3d-canvas");
  const container = document.getElementById("canvas-container");
  const fallback = document.getElementById("sim-fallback");

  if (!canvas || !container || typeof THREE === "undefined") {
    if (fallback) fallback.classList.remove("is-hidden");
    return;
  }

  // Check reduced motion preference
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Scene variables
  let scene, camera, renderer;
  let roadGroup, potholeMesh, potholeRimMesh, coneGroup, beaconLight;
  let sunLight, ambientLight, headlightLeft, headlightRight;
  let isNightMode = false;
  let currentSeverity = 1; // 1, 2, or 3

  // Orbit control state (lightweight custom orbit without external OrbitControls dependency)
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let targetRotation = { x: 0.45, y: 0.75 };
  let currentRotation = { x: 0.45, y: 0.75 };
  let cameraDistance = 7.5;
  let targetDistance = 7.5;
  let autoRotateSpeed = prefersReducedMotion ? 0 : 0.003;
  let userInteracting = false;
  let interactTimeout;

  // Camera presets
  const CAM_PRESETS = {
    perspective: { rotX: 0.45, rotY: 0.75, dist: 7.5 },
    top:         { rotX: 1.45, rotY: 0.0,  dist: 8.0 },
    driver:      { rotX: 0.15, rotY: 0.0,  dist: 5.5 },
  };

  function init() {
    // 1. Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c111d);
    scene.fog = new THREE.FogExp2(0x0c111d, 0.045);

    // 2. Camera
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    updateCameraPosition();

    // 3. Renderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } catch (_e) {
      if (fallback) fallback.classList.remove("is-hidden");
      return;
    }

    // 4. Lights
    setupLights();

    // 5. 3D Meshes (Road, Markings, Pothole, Traffic Cone)
    buildRoadEnvironment();
    buildPothole(currentSeverity);
    buildTrafficCone();

    // 6. Event Listeners
    setupInteractions();

    // 7. Render Loop
    animate();
  }

  /* ------------------------------------------------------------------ */
  /* Lighting Setup                                                     */
  /* ------------------------------------------------------------------ */
  function setupLights() {
    // Ambient light
    ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    // Sunlight
    sunLight = new THREE.DirectionalLight(0xfffaed, 1.2);
    sunLight.position.set(6, 12, 8);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 30;
    sunLight.shadow.camera.left = -6;
    sunLight.shadow.camera.right = 6;
    sunLight.shadow.camera.top = 6;
    sunLight.shadow.camera.bottom = -6;
    sunLight.shadow.bias = -0.001;
    scene.add(sunLight);

    // Headlights (for night mode inspection)
    headlightLeft = new THREE.SpotLight(0xedf2ff, 0, 18, Math.PI / 6, 0.4, 1);
    headlightLeft.position.set(-1.2, 0.8, 6.5);
    headlightLeft.target.position.set(0, 0, 0);
    scene.add(headlightLeft);
    scene.add(headlightLeft.target);

    headlightRight = new THREE.SpotLight(0xedf2ff, 0, 18, Math.PI / 6, 0.4, 1);
    headlightRight.position.set(1.2, 0.8, 6.5);
    headlightRight.target.position.set(0, 0, 0);
    scene.add(headlightRight);
    scene.add(headlightRight.target);

    // Safety cone amber beacon light
    beaconLight = new THREE.PointLight(0xff7700, 0.8, 4);
    beaconLight.position.set(1.6, 1.5, -0.6);
    scene.add(beaconLight);
  }

  /* ------------------------------------------------------------------ */
  /* Build Road Environment                                             */
  /* ------------------------------------------------------------------ */
  function buildRoadEnvironment() {
    roadGroup = new THREE.Group();

    // Asphalt road surface
    const roadGeo = new THREE.BoxGeometry(7, 0.3, 12);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x181a20,
      roughness: 0.92,
      metalness: 0.08,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.position.y = -0.15;
    roadMesh.receiveShadow = true;
    roadGroup.add(roadMesh);

    // Concrete curbs
    const curbGeo = new THREE.BoxGeometry(0.35, 0.45, 12);
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.85,
    });
    const leftCurb = new THREE.Mesh(curbGeo, curbMat);
    leftCurb.position.set(-3.5 - 0.175, -0.075, 0);
    leftCurb.receiveShadow = true;
    leftCurb.castShadow = true;
    roadGroup.add(leftCurb);

    const rightCurb = new THREE.Mesh(curbGeo, curbMat);
    rightCurb.position.set(3.5 + 0.175, -0.075, 0);
    rightCurb.receiveShadow = true;
    rightCurb.castShadow = true;
    roadGroup.add(rightCurb);

    // Road markings: Dashed center yellow stripes
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    for (let z = -5; z <= 5; z += 2.2) {
      const stripeGeo = new THREE.PlaneGeometry(0.16, 1.1);
      const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
      stripeMesh.rotation.x = -Math.PI / 2;
      stripeMesh.position.set(0, 0.005, z);
      roadGroup.add(stripeMesh);
    }

    // White outer lane boundary stripes
    const whiteLineMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const leftLineGeo = new THREE.PlaneGeometry(0.12, 12);
    const leftLine = new THREE.Mesh(leftLineGeo, whiteLineMat);
    leftLine.rotation.x = -Math.PI / 2;
    leftLine.position.set(-3.1, 0.005, 0);
    roadGroup.add(leftLine);

    const rightLine = new THREE.Mesh(leftLineGeo, whiteLineMat);
    rightLine.rotation.x = -Math.PI / 2;
    rightLine.position.set(3.1, 0.005, 0);
    roadGroup.add(rightLine);

    scene.add(roadGroup);
  }

  /* ------------------------------------------------------------------ */
  /* Build Procedural 3D Pothole Crater                                 */
  /* ------------------------------------------------------------------ */
  function buildPothole(severity) {
    if (potholeMesh) scene.remove(potholeMesh);
    if (potholeRimMesh) scene.remove(potholeRimMesh);

    const scaleFactors = {
      1: { radius: 0.75, depth: 0.18, rubbleCount: 6 },
      2: { radius: 1.15, depth: 0.32, rubbleCount: 14 },
      3: { radius: 1.55, depth: 0.48, rubbleCount: 22 },
    };
    const cfg = scaleFactors[severity] || scaleFactors[2];

    const potholeGroup = new THREE.Group();

    // 1. Crater depression body using inverted deformed geometry
    const craterGeo = new THREE.CylinderGeometry(cfg.radius, cfg.radius * 0.65, cfg.depth, 24, 6);
    // Deform vertices to create organic rugged fracture edges
    const pos = craterGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);

      // Noise displacement
      const angle = Math.atan2(vz, vx);
      const noise = Math.sin(angle * 5) * 0.12 + Math.cos(angle * 3) * 0.08;
      pos.setX(i, vx + vx * noise);
      pos.setZ(i, vz + vz * noise);

      // Invert center downwards
      if (vy < 0) {
        pos.setY(i, vy - 0.05);
      }
    }
    craterGeo.computeVertexNormals();

    const craterMat = new THREE.MeshStandardMaterial({
      color: 0x090a0d,
      roughness: 0.98,
      metalness: 0.02,
    });
    potholeMesh = new THREE.Mesh(craterGeo, craterMat);
    potholeMesh.position.set(-0.6, -cfg.depth / 2 + 0.01, 0.4);
    potholeMesh.receiveShadow = true;
    potholeGroup.add(potholeMesh);

    // 2. Fractured rim edge ring (elevated lip caused by wheel impact pressure)
    const rimGeo = new THREE.RingGeometry(cfg.radius * 0.95, cfg.radius * 1.25, 24);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x222630,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
    potholeRimMesh = new THREE.Mesh(rimGeo, rimMat);
    potholeRimMesh.rotation.x = -Math.PI / 2;
    potholeRimMesh.position.set(-0.6, 0.008, 0.4);
    potholeRimMesh.receiveShadow = true;
    potholeGroup.add(potholeRimMesh);

    // 3. Displaced asphalt rubble fragments inside crater
    const rubbleGeo = new THREE.DodecahedronGeometry(0.08, 0);
    const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x1f232b, roughness: 0.95 });
    for (let j = 0; j < cfg.rubbleCount; j++) {
      const rubble = new THREE.Mesh(rubbleGeo, rubbleMat);
      const rAngle = (j / cfg.rubbleCount) * Math.PI * 2 + Math.random();
      const rDist = Math.random() * (cfg.radius * 0.7);
      rubble.position.set(
        -0.6 + Math.cos(rAngle) * rDist,
        -cfg.depth * 0.6 + Math.random() * 0.05,
        0.4 + Math.sin(rAngle) * rDist
      );
      rubble.rotation.set(Math.random(), Math.random(), Math.random());
      const s = 0.5 + Math.random() * 0.8;
      rubble.scale.set(s, s, s);
      rubble.castShadow = true;
      rubble.receiveShadow = true;
      potholeGroup.add(rubble);
    }

    scene.add(potholeGroup);
  }

  /* ------------------------------------------------------------------ */
  /* Build 3D Safety Traffic Cone                                       */
  /* ------------------------------------------------------------------ */
  function buildTrafficCone() {
    coneGroup = new THREE.Group();

    // Base square
    const baseGeo = new THREE.BoxGeometry(0.7, 0.06, 0.7);
    const orangeMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.45,
      metalness: 0.1,
    });
    const baseMesh = new THREE.Mesh(baseGeo, orangeMat);
    baseMesh.position.y = 0.03;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    coneGroup.add(baseMesh);

    // Conical body
    const coneBodyGeo = new THREE.CylinderGeometry(0.06, 0.32, 1.25, 20);
    const coneBodyMesh = new THREE.Mesh(coneBodyGeo, orangeMat);
    coneBodyMesh.position.y = 0.65;
    coneBodyMesh.castShadow = true;
    coneBodyMesh.receiveShadow = true;
    coneGroup.add(coneBodyMesh);

    // Reflective white bands
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.4,
    });
    const band1Geo = new THREE.CylinderGeometry(0.18, 0.22, 0.2, 20);
    const band1 = new THREE.Mesh(band1Geo, whiteMat);
    band1.position.y = 0.55;
    coneGroup.add(band1);

    const band2Geo = new THREE.CylinderGeometry(0.11, 0.15, 0.16, 20);
    const band2 = new THREE.Mesh(band2Geo, whiteMat);
    band2.position.y = 0.88;
    coneGroup.add(band2);

    // Amber LED warning beacon at cone tip
    const beaconGeo = new THREE.SphereGeometry(0.065, 12, 12);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.position.y = 1.32;
    coneGroup.add(beaconMesh);

    coneGroup.position.set(1.5, 0, -0.6);
    scene.add(coneGroup);
  }

  /* ------------------------------------------------------------------ */
  /* Camera & Orbit Math                                                */
  /* ------------------------------------------------------------------ */
  function updateCameraPosition() {
    const x = cameraDistance * Math.sin(currentRotation.y) * Math.cos(currentRotation.x);
    const y = cameraDistance * Math.sin(currentRotation.x);
    const z = cameraDistance * Math.cos(currentRotation.y) * Math.cos(currentRotation.x);

    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
  }

  /* ------------------------------------------------------------------ */
  /* User Interactions & Controls                                       */
  /* ------------------------------------------------------------------ */
  function setupInteractions() {
    // Mouse / Pointer drag rotation
    canvas.addEventListener("pointerdown", (e) => {
      isDragging = true;
      userInteracting = true;
      clearTimeout(interactTimeout);
      previousMousePosition = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      targetRotation.y += deltaX * 0.007;
      targetRotation.x = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, targetRotation.x + deltaY * 0.007));

      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    const stopDrag = () => {
      isDragging = false;
      interactTimeout = setTimeout(() => { userInteracting = false; }, 3000);
    };
    canvas.addEventListener("pointerup", stopDrag);
    canvas.addEventListener("pointercancel", stopDrag);

    // Zoom via wheel
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      userInteracting = true;
      clearTimeout(interactTimeout);
      targetDistance = Math.max(4.0, Math.min(14.0, targetDistance + e.deltaY * 0.008));
      interactTimeout = setTimeout(() => { userInteracting = false; }, 3000);
    }, { passive: false });

    // Window resize
    window.addEventListener("resize", () => {
      if (!renderer || !camera || !container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });

    // Preset Buttons
    const btnPerspective = document.getElementById("cam-perspective");
    const btnTop = document.getElementById("cam-top");
    const btnDriver = document.getElementById("cam-driver");

    function setPreset(pKey, activeBtn) {
      document.querySelectorAll(".sim-btn-group .sim-btn").forEach((b) => b.classList.remove("is-active"));
      activeBtn.classList.add("is-active");
      const p = CAM_PRESETS[pKey];
      targetRotation.x = p.rotX;
      targetRotation.y = p.rotY;
      targetDistance = p.dist;
      userInteracting = true;
      clearTimeout(interactTimeout);
      interactTimeout = setTimeout(() => { userInteracting = false; }, 4000);
    }

    if (btnPerspective) btnPerspective.addEventListener("click", () => setPreset("perspective", btnPerspective));
    if (btnTop) btnTop.addEventListener("click", () => setPreset("top", btnTop));
    if (btnDriver) btnDriver.addEventListener("click", () => setPreset("driver", btnDriver));

    // Severity Buttons
    const sevButtons = [
      document.getElementById("sev-mild"),
      document.getElementById("sev-deep"),
      document.getElementById("sev-severe"),
    ];
    sevButtons.forEach((btn, index) => {
      if (!btn) return;
      btn.addEventListener("click", () => {
        sevButtons.forEach((b) => b?.classList.remove("is-active"));
        btn.classList.add("is-active");
        currentSeverity = index + 1;
        buildPothole(currentSeverity);
      });
    });

    // Night Mode Toggle Button
    const lightToggle = document.getElementById("toggle-light-mode");
    const lightIcon = document.getElementById("light-mode-icon");
    const lightText = document.getElementById("light-mode-text");

    if (lightToggle) {
      lightToggle.addEventListener("click", () => {
        isNightMode = !isNightMode;
        if (isNightMode) {
          // Night mode
          scene.background.set(0x05070c);
          scene.fog.color.set(0x05070c);
          ambientLight.intensity = 0.15;
          sunLight.intensity = 0.05;
          headlightLeft.intensity = 2.4;
          headlightRight.intensity = 2.4;
          if (lightIcon) lightIcon.textContent = "☀️";
          if (lightText) lightText.textContent = "Daylight View";
          lightToggle.classList.add("is-active");
        } else {
          // Daylight mode
          scene.background.set(0x0c111d);
          scene.fog.color.set(0x0c111d);
          ambientLight.intensity = 0.65;
          sunLight.intensity = 1.2;
          headlightLeft.intensity = 0;
          headlightRight.intensity = 0;
          if (lightIcon) lightIcon.textContent = "🌙";
          if (lightText) lightText.textContent = "Night Inspection";
          lightToggle.classList.remove("is-active");
        }
      });
    }

    // Reset Camera
    const resetBtn = document.getElementById("reset-cam-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        targetRotation.x = CAM_PRESETS.perspective.rotX;
        targetRotation.y = CAM_PRESETS.perspective.rotY;
        targetDistance = CAM_PRESETS.perspective.dist;
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Main Animation Loop                                                */
  /* ------------------------------------------------------------------ */
  let clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const elapsedTime = clock.getElapsedTime();

    // Auto rotate gently if user is not dragging
    if (!userInteracting && autoRotateSpeed > 0) {
      targetRotation.y += autoRotateSpeed;
    }

    // Smooth lerp camera rotation and distance
    currentRotation.x += (targetRotation.x - currentRotation.x) * 0.08;
    currentRotation.y += (targetRotation.y - currentRotation.y) * 0.08;
    cameraDistance += (targetDistance - cameraDistance) * 0.08;

    updateCameraPosition();

    // Pulsing safety cone beacon light
    if (beaconLight) {
      beaconLight.intensity = 0.5 + Math.sin(elapsedTime * 4) * 0.5;
    }

    renderer.render(scene, camera);
  }

  // Initialize on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
