// js/ui/tabs.js
// Accessible tab wiring for any container (dialog, panel, etc.)

/**
 * Initialize all tablists within a root element.
 * - Click switches tabs
 * - Arrow keys may be wired by the host if desired
 *
 * @param {HTMLElement|Document} [root=document] - Root node to search within.
 * @returns {void}
 */
export function initTabs(root = document) {
  const tabLists = root.querySelectorAll('[role="tablist"]');
  tabLists.forEach((tabList) => wireTabList(tabList));
}

/**
 * Wire a single tablist element:
 * - Ensures one tab is marked selected
 * - Shows the corresponding panel
 * - Wires click handlers for activation
 *
 * @param {Element} tabList - The container with role="tablist".
 * @returns {void}
 */
function wireTabList(tabList) {
  const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
  if (tabs.length === 0) return;

  // Ensure one tab is active
  const anySelected = tabs.some((tabEl) => tabEl.getAttribute("aria-selected") === "true");
  if (!anySelected) {
    tabs[0].setAttribute("aria-selected", "true");
  }
  updatePanelsForTabs(tabs);

  // Click → activate
  tabs.forEach((tabEl) => {
    tabEl.addEventListener("click", () => {
      activateTab(tabEl, tabs);
    });
  });
}

/**
 * Activate a given tab, update aria-selected on all, and show its panel.
 *
 * @param {Element} nextTab - The tab to activate.
 * @param {Element[]} allTabs - All sibling tabs in the tablist.
 * @param {{ focus?: boolean }} [opts] - Optional behavior flags.
 * @returns {void}
 */
function activateTab(nextTab, allTabs, opts = {}) {
  const { focus = false } = opts;

  allTabs.forEach((tabEl) => {
    tabEl.setAttribute("aria-selected", tabEl === nextTab ? "true" : "false");
  });
  updatePanelsForTabs(allTabs);

  if (focus) nextTab.focus();
}

/**
 * Given a set of tabs, hide all controlled panels and show the active one.
 *
 * @param {Element[]} tabs - Tabs that control panels via aria-controls.
 * @returns {void}
 */
function updatePanelsForTabs(tabs) {
  const controlledIds = tabs
    .map((tabEl) => tabEl.getAttribute("aria-controls"))
    .filter(Boolean);

  // Hide all controlled panels first
  controlledIds.forEach((panelId) => {
    const panelEl = document.getElementById(panelId);
    if (panelEl) panelEl.hidden = true;
  });

  // Show the active panel
  const activeTab = tabs.find((tabEl) => tabEl.getAttribute("aria-selected") === "true");
  if (activeTab) {
    const panelId = activeTab.getAttribute("aria-controls");
    const panelEl = panelId ? document.getElementById(panelId) : null;
    if (panelEl) panelEl.hidden = false;
  }
}

/**
 * Ensure a dialog opens on a default tab and is scrolled to the top.
 * - If defaultPanelId is provided, activates the tab that controls it.
 * - Otherwise, activates the first tab.
 * - Then scrolls .modal-body (or the dialog itself) to top.
 *
 * @param {HTMLElement} dialogElement - The dialog element hosting the tabs.
 * @param {string|null} [defaultPanelId=null] - Optional panel id to activate.
 * @returns {void}
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

  const scrollContainer = dialogElement.querySelector(".modal-body") || dialogElement;
  scrollContainer.scrollTop = 0;
}

/**
 * Activate a specific tab button and show its panel.
 * Works with tabs that use [role="tab"] + [role="tabpanel"] and
 * either aria-controls="<panelId>" or data-panel / data-target.
 *
 * @param {HTMLElement} dialogElement - Container element hosting tabs and panels.
 * @param {Element} tabButtonElement - The tab button to activate.
 * @returns {void}
 */
function activateTabButton(dialogElement, tabButtonElement) {
  const allTabButtons = dialogElement.querySelectorAll('[role="tab"]');
  const allPanels = dialogElement.querySelectorAll('[role="tabpanel"]');

  // De-select all tabs
  allTabButtons.forEach((buttonEl) => buttonEl.setAttribute("aria-selected", "false"));

  // Select this one
  tabButtonElement.setAttribute("aria-selected", "true");

  // Find its target panel id
  const targetPanelId =
    tabButtonElement.getAttribute("aria-controls") ||
    tabButtonElement.dataset.panel ||
    tabButtonElement.dataset.target ||
    "";

  // Show only the target panel
  allPanels.forEach((panelEl) => {
    panelEl.hidden = panelEl.id !== targetPanelId;
  });
}
