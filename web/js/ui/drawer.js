export function initDrawer() {
  const drawer = document.getElementById("drawer");
  if (!drawer) return;

  // Toggle from any button (support id OR class so you don’t rely on duplicate IDs)
  const toggles = Array.from(document.querySelectorAll("#menuBtn, .menu-btn"));
  const onToggle = (ev) => {
    ev.stopPropagation(); // avoid bubbling to outside-click handler
    drawer.classList.toggle("open");
  };
  toggles.forEach((btn) => btn.addEventListener("click", onToggle));

  // Close when clicking a nav item inside the drawer
  drawer.addEventListener("click", (e) => {
    if (e.target.closest(".drawer .nav-btn")) {
      drawer.classList.remove("open");
    }
  });

  // Close on ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") drawer.classList.remove("open");
  });

  // Close when clicking anywhere outside the drawer or toggle buttons
  document.addEventListener("click", (e) => {
    if (!drawer.classList.contains("open")) return;
    if (e.target.closest(".drawer, #menuBtn, .menu-btn")) return;
    drawer.classList.remove("open");
  });
}
