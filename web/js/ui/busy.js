// js/ui/busy.js

// Create a single global instance shared across all imports.
(function initGlobalBusyOverlay() {
  const KEY = "__APP_BUSY_OVERLAY__";
  if (window[KEY]) return;

  /** Internal singleton state + helpers */
  const overlay = {
    // State
    count: 0,
    dialogEl: null, // <dialog id="appBusy"> (top-layer when supported)
    fallbackEl: null, // <div id="appBusy"> (fallback)
    labelEl: null, // <div id="appBusyLabel">
    watchdogTimer: null,

    /** Feature detection */
    supportsDialog() {
      return typeof HTMLDialogElement !== "undefined";
    },

    /** Ensure overlay DOM exists (lazy-created on first use) */
    ensureOverlay() {
      if (this.dialogEl || this.fallbackEl) return;

      if (this.supportsDialog()) {
        const dlg = document.createElement("dialog");
        dlg.id = "appBusy";
        dlg.setAttribute("aria-live", "polite");
        dlg.setAttribute("aria-busy", "true");
        dlg.addEventListener("cancel", (e) => e.preventDefault()); // prevent ESC close

        const panel = document.createElement("div");
        panel.className = "panel";
        panel.innerHTML = `
          <div class="spinner" aria-hidden="true"></div>
          <div class="label" id="appBusyLabel">Working…</div>
        `;

        dlg.appendChild(panel);
        document.body.appendChild(dlg);

        this.dialogEl = dlg;
        this.labelEl = panel.querySelector("#appBusyLabel");
      } else {
        const div = document.createElement("div");
        div.id = "appBusy";
        div.innerHTML = `
          <div class="panel" role="alert" aria-live="assertive">
            <div class="spinner" aria-hidden="true"></div>
            <div class="label" id="appBusyLabel">Working…</div>
          </div>
        `;
        document.body.appendChild(div);

        this.fallbackEl = div;
        this.labelEl = div.querySelector("#appBusyLabel");
      }
    },

    /** Open/Show the overlay (top-layer if <dialog> is supported) */
    openOverlay(message) {
      this.ensureOverlay();

      const root = document.getElementById("appBusy");
      if (root) root.style.display = "grid"; // ensures visibility even during reflow

      if (this.labelEl) this.labelEl.textContent = message || "Working…";

      if (this.dialogEl) {
        if (!this.dialogEl.open) this.dialogEl.showModal(); // place on top layer
        document.body.setAttribute("aria-busy", "true");
      } else if (this.fallbackEl) {
        this.fallbackEl.classList.add("active");
        document.documentElement.style.pointerEvents = "none";
        this.fallbackEl.style.pointerEvents = "auto";
      }
    },

    /** Close/Hide the overlay (defensive across ticks) */
    closeOverlay() {
      const root = document.getElementById("appBusy");
      if (root) root.style.display = "none";

      if (this.dialogEl) {
        try {
          if (this.dialogEl.open) this.dialogEl.close();
        } catch (_) {}
        document.body.removeAttribute("aria-busy");
      }
      if (this.fallbackEl) {
        this.fallbackEl.classList.remove("active");
        document.documentElement.style.pointerEvents = "";
      }
    },

    /** Ensure close happens even if the frame is busy (microtask/RAF retries) */
    scheduleCloseWatchdog() {
      if (this.watchdogTimer) return;
      this.watchdogTimer = setTimeout(() => {
        this.watchdogTimer = null;
        if (this.count === 0) {
          this.closeOverlay();
          queueMicrotask(() => this.closeOverlay());
          requestAnimationFrame(() => this.closeOverlay());
        }
      }, 0);
    },
  };

  // Expose singleton on window for all modules to share.
  window[KEY] = overlay;
})();

/* ---------- Public API (shared singleton) ---------- */

const BUSY = window.__APP_BUSY_OVERLAY__;

/** Show the global busy overlay. Re-entrant and cross-module safe. */
export function showBusy(message = "Working…") {
  BUSY.count += 1;
  if (BUSY.count === 1) {
    BUSY.openOverlay(message);
  } else if (BUSY.labelEl) {
    BUSY.labelEl.textContent = message;
  }
}

/** Hide the overlay when no more busy operations remain. */
export function hideBusy() {
  if (BUSY.count > 0) BUSY.count -= 1;
  if (BUSY.count < 0) BUSY.count = 0;

  // Keep the spinner hidden immediately, regardless of dialog timing.
  const root = document.getElementById("appBusy");
  if (root) root.style.display = "none";

  if (BUSY.count === 0) {
    BUSY.scheduleCloseWatchdog();
  }
}

/** Run an async task while the overlay is visible. Always hides afterwards. */
export async function busyWhile(task, message = "Working…") {
  showBusy(message);
  try {
    return await task();
  } finally {
    hideBusy();
  }
}

/** Emergency helper: immediately clear any visible overlay. */
export function forceClearBusy() {
  BUSY.count = 0;
  BUSY.closeOverlay();
}
