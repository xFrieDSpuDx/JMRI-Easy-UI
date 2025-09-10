// js/ui/tabs.js
// Accessible tab wiring for any container (dialog, panel, etc.)

/**
 * Initialize all tablists within root.
 * - Click switches tabs
 * - Arrow keys (Left/Right/Home/End) navigate tabs
 * @param {HTMLElement|Document} root
 */
export function initTabs(root = document) {
  const tablists = root.querySelectorAll('[role="tablist"]');
  tablists.forEach((tablist) => wireTablist(tablist));
}

function wireTablist(tablist) {
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  if (tabs.length === 0) return;

  // Ensure one tab is active
  if (!tabs.some((t) => t.getAttribute("aria-selected") === "true")) {
    tabs[0].setAttribute("aria-selected", "true");
  }
  updatePanelsForTabs(tabs);

  // Click → activate
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activateTab(tab, tabs);
    });
  });
}

function activateTab(nextTab, allTabs, opts = {}) {
  const { focus = false } = opts;

  allTabs.forEach((t) =>
    t.setAttribute("aria-selected", t === nextTab ? "true" : "false")
  );
  updatePanelsForTabs(allTabs);

  if (focus) nextTab.focus();
}

function updatePanelsForTabs(tabs) {
  const controlledIds = tabs
    .map((t) => t.getAttribute("aria-controls"))
    .filter(Boolean);

  // Hide all controlled panels first
  controlledIds.forEach((id) => {
    const panel = document.getElementById(id);
    if (panel) panel.hidden = true;
  });

  // Show the active panel
  const active = tabs.find((t) => t.getAttribute("aria-selected") === "true");
  if (active) {
    const id = active.getAttribute("aria-controls");
    const panel = id ? document.getElementById(id) : null;
    if (panel) panel.hidden = false;
  }
}

/**
 * Ensure a dialog opens on a default tab and scrolled to the top.
 * - If defaultPanelId is provided, tries to activate the tab that controls it.
 * - Otherwise, activates the first tab.
 * - Then scrolls .modal-body (or the dialog itself) to top.
 */
export function resetDialogTabsAndScroll(dialogElement, defaultPanelId = null) {
  if (!dialogElement) return;

  const tabButtons = Array.from(dialogElement.querySelectorAll('[role="tab"]'));

  let tabToActivate = null;
  if (defaultPanelId) {
    tabToActivate =
      tabButtons.find(
        (button) =>
          button.getAttribute("aria-controls") === defaultPanelId ||
          button.dataset.panel === defaultPanelId ||
          button.dataset.target === defaultPanelId
      ) || null;
  }
  if (!tabToActivate) {
    tabToActivate = tabButtons[0] || null;
  }

  if (tabToActivate) {
    activateTabButton(dialogElement, tabToActivate);
  }

  const scrollContainer =
    dialogElement.querySelector(".modal-body") || dialogElement;

  scrollContainer.scrollTop = 0;
}

/**
 * Activate a specific tab button and show its panel.
 * Works with tabs that use [role="tab"] + [role="tabpanel"] and
 * either aria-controls="<panelId>" or data-panel="<panelId>".
 */
function activateTabButton(dialogElement, tabButtonElement) {
  const allTabButtons = dialogElement.querySelectorAll('[role="tab"]');
  const allPanels = dialogElement.querySelectorAll('[role="tabpanel"]');

  // De-select all tabs
  allTabButtons.forEach((button) => button.setAttribute("aria-selected", "false"));

  // Select this one
  tabButtonElement.setAttribute("aria-selected", "true");

  // Find its target panel id
  const targetPanelId =
    tabButtonElement.getAttribute("aria-controls") ||
    tabButtonElement.dataset.panel ||
    tabButtonElement.dataset.target ||
    "";

  // Show only the target panel
  allPanels.forEach((panel) => {
    panel.hidden = panel.id !== targetPanelId;
  });
}