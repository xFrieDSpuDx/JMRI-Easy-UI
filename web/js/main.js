import { initPanels } from "./ui/panels.js";
import { initDrawer } from "./ui/drawer.js";
import { populateCachedValues } from "./services/cachedValues.js";
import { initRoster } from "./controllers/roster/index.js";
import { initSettings } from "./controllers/settings/index.js";
import { initTurnouts } from "./controllers/turnouts/index.js";
import { initDom } from "./ui/dom.js";

/**
 * Bootstrap the application:
 * - Initialize DOM-bound UI (header, etc.)
 * - Wire the navigation drawer
 * - Prime cached values (panels file & active connection)
 * - Initialize panels + controllers
 */
(function initializeApplication() {
  // Fire-and-forget initializers; none need to block the others.
  initDom();
  initDrawer();
  populateCachedValues();
  initPanels();
  initRoster();
  initSettings();
  initTurnouts();
})();
