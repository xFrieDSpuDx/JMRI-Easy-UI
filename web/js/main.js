import { initPanels } from "./ui/panels.js";
import { initDrawer } from "./ui/drawer.js";
import { populateCachedValues } from "./services/cachedValues.js";
import { initRoster } from "./controllers/roster/index.js";
import { initSettings } from "./controllers/settings/index.js";
import { initTurnouts } from "./controllers/turnouts/index.js";
import { initDom } from "./ui/dom.js";

(function boot() {
  initDom();
  initDrawer();
  populateCachedValues();
  initPanels();
  initRoster();
  initSettings();
  initTurnouts();
})();
