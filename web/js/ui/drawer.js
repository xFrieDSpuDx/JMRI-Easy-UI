/**
 * Initialize the slide-out drawer UI:
 * - Toggles open/close from any element matching "#menuBtn" or ".menu-btn"
 * - Closes on ESC, outside click, or when a nav item inside the drawer is clicked
 *
 * @returns {void}
 */
export function initDrawer() {
  const drawer = document.getElementById("drawer");
  if (!drawer) return;

  // Toggle from any button (support id OR class so you don’t rely on duplicate IDs)
  const toggles = Array.from(document.querySelectorAll("#menuBtn, .menu-btn"));
  const handleToggleClick = (event) => {
    event.stopPropagation(); // avoid bubbling to outside-click handler
    drawer.classList.toggle("open");
  };
  toggles.forEach((btn) => btn.addEventListener("click", handleToggleClick));

  // Close when clicking a nav item inside the drawer
  drawer.addEventListener("click", (event) => {
    if (event.target.closest(".drawer .nav-btn")) {
      drawer.classList.remove("open");
    }
  });

  // Close on ESC
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") drawer.classList.remove("open");
  });

  // Close when clicking anywhere outside the drawer or toggle buttons
  document.addEventListener("click", (event) => {
    if (!drawer.classList.contains("open")) return;
    if (event.target.closest(".drawer, #menuBtn, .menu-btn")) return;
    drawer.classList.remove("open");
  });
}
