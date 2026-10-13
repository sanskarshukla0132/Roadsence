/* RoadSense — shared UI: navigation, header state, reveal animations, 3D hero tilt */
(function () {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Mobile navigation */
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");

  function setMenu(open) {
    if (!navLinks || !navToggle) return;
    navLinks.classList.toggle("open", open);
    navToggle.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      setMenu(!navLinks.classList.contains("open"));
    });
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setMenu(false));
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && navLinks.classList.contains("open")) {
        setMenu(false);
        navToggle.focus();
      }
    });
  }

  /* Header elevation on scroll */
  const header = document.querySelector(".site-header");
  if (header) {
    const updateHeader = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
  }

  /* Scroll reveal */
  const revealTargets = document.querySelectorAll("[data-reveal]");
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    revealTargets.forEach((el) => el.classList.add("is-visible"));
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealTargets.forEach((el, index) => {
      el.style.setProperty("--reveal-delay", `${(index % 4) * 70}ms`);
      observer.observe(el);
    });
  }

  /* 3D hero tilt (fine pointers only) */
  const scene = document.querySelector(".hero-scene");
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  if (scene && finePointer && !prefersReducedMotion) {
    let frame = 0;
    scene.parentElement.addEventListener("pointermove", (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = scene.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        scene.style.setProperty("--tilt-x", `${(-y * 8).toFixed(2)}deg`);
        scene.style.setProperty("--tilt-y", `${(x * 10).toFixed(2)}deg`);
      });
    });
    scene.parentElement.addEventListener("pointerleave", () => {
      scene.style.setProperty("--tilt-x", "0deg");
      scene.style.setProperty("--tilt-y", "0deg");
    });
  }
})();
