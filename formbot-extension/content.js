// content.js - Injected into Google Forms pages

(function () {
  let isExtracting = false;

  // ─── Listen for messages from popup / background ───────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "EXTRACT_FIELDS") {
      const fields = extractFormFields();
      sendResponse({ fields });
    }

    if (msg.action === "FILL_FORM") {
      fillForm(msg.answers, msg.autoSubmit);
      sendResponse({ ok: true });
    }

    if (msg.action === "PING") {
      sendResponse({ ok: true });
    }

    return true; // keep channel open for async
  });

  // ─── Extract all question fields from the rendered form ───────────────────
  function extractFormFields() {
    const fields = [];

    // Google Forms renders questions inside [data-params] divs or role="listitem"
    const questionContainers = document.querySelectorAll(
      '[role="listitem"], .freebirdFormviewerViewItemsItemItem',
    );

    questionContainers.forEach((container, idx) => {
      // Question title
      const titleEl =
        container.querySelector('[role="heading"]') ||
        container.querySelector(".freebirdFormviewerViewItemsItemItemTitle") ||
        container.querySelector(".M7eMe");

      if (!titleEl) return;
      const title = titleEl.innerText.trim();
      if (!title) return;

      // Detect field type
      const textInput = container.querySelector(
        'input[type="text"], input[type="email"], input[type="number"]',
      );
      const textarea = container.querySelector("textarea");
      const radios = container.querySelectorAll('[role="radio"]');
      const checkboxes = container.querySelectorAll('[role="checkbox"]');
      const dropdowns = container.querySelectorAll('[role="option"]');
      const dateInput = container.querySelector('input[type="date"]');
      const timeInput = container.querySelector('input[type="time"]');

      let type = "text";
      let options = [];

      if (radios.length > 0) {
        type = "radio";
        radios.forEach((r) => {
          const label =
            r.getAttribute("aria-label") ||
            r.closest("[data-value]")?.getAttribute("data-value") ||
            "";
          if (label) options.push(label);
        });
      } else if (checkboxes.length > 0) {
        type = "checkbox";
        checkboxes.forEach((c) => {
          const label = c.getAttribute("aria-label") || "";
          if (label) options.push(label);
        });
      } else if (dropdowns.length > 0) {
        type = "dropdown";
        dropdowns.forEach((d) => {
          const label =
            d.getAttribute("data-value") || d.innerText?.trim() || "";
          if (label && label !== "Choose") options.push(label);
        });
      } else if (textarea) {
        type = "textarea";
      } else if (dateInput) {
        type = "date";
      } else if (timeInput) {
        type = "time";
      }

      const required =
        container.querySelector('[aria-required="true"]') !== null ||
        container.querySelector(
          ".freebirdFormviewerViewItemsItemRequiredAsterisk",
        ) !== null;

      fields.push({ id: `field_${idx}`, title, type, options, required });
    });

    return fields;
  }

  // ─── Fill the form with stored answers ────────────────────────────────────
  function fillForm(answers, autoSubmit) {
    if (!answers || Object.keys(answers).length === 0) return;

    const questionContainers = document.querySelectorAll(
      '[role="listitem"], .freebirdFormviewerViewItemsItemItem',
    );

    let filled = 0;

    questionContainers.forEach((container, idx) => {
      const titleEl =
        container.querySelector('[role="heading"]') ||
        container.querySelector(".freebirdFormviewerViewItemsItemItemTitle") ||
        container.querySelector(".M7eMe");

      if (!titleEl) return;
      const title = titleEl.innerText.trim();
      const answer = answers[title];
      if (!answer && answer !== 0) return;

      const textInput = container.querySelector(
        'input[type="text"], input[type="email"], input[type="number"]',
      );
      const textarea = container.querySelector("textarea");
      const radios = container.querySelectorAll('[role="radio"]');
      const checkboxes = container.querySelectorAll('[role="checkbox"]');
      const dateInput = container.querySelector('input[type="date"]');

      if (textInput || textarea) {
        const el = textInput || textarea;
        el.focus();
        el.value = answer;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        filled++;
      } else if (radios.length > 0) {
        radios.forEach((radio) => {
          const label = radio.getAttribute("aria-label") || "";
          if (label === answer) {
            radio.click();
            filled++;
          }
        });
      } else if (checkboxes.length > 0) {
        const selected = Array.isArray(answer) ? answer : [answer];
        checkboxes.forEach((cb) => {
          const label = cb.getAttribute("aria-label") || "";
          if (selected.includes(label)) {
            const isChecked = cb.getAttribute("aria-checked") === "true";
            if (!isChecked) {
              cb.click();
              filled++;
            }
          }
        });
      } else if (dateInput) {
        dateInput.value = answer;
        dateInput.dispatchEvent(new Event("input", { bubbles: true }));
        dateInput.dispatchEvent(new Event("change", { bubbles: true }));
        filled++;
      }
    });

    // Notify background about fill result
    chrome.runtime.sendMessage({
      action: "FORM_FILLED",
      filled,
      autoSubmit,
    });

    if (autoSubmit) {
      setTimeout(() => {
        const submitBtn = document.querySelector(
          '[role="button"][jsname="M2UYVd"], .freebirdFormviewerViewNavigationSubmitButton',
        );
        if (submitBtn) {
          submitBtn.click();
        }
      }, 800);
    } else {
      // Show overlay notification
      showFillOverlay(filled);
    }
  }

  // ─── Overlay UI shown after filling (no auto-submit) ──────────────────────
  function showFillOverlay(count) {
    const existing = document.getElementById("formbot-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "formbot-overlay";
    overlay.style.cssText = `
      position: fixed;
      bottom: 28px;
      right: 28px;
      background: #1a1a2e;
      color: #e0e0ff;
      border: 1.5px solid #6c63ff;
      border-radius: 14px;
      padding: 18px 24px;
      z-index: 999999;
      font-family: 'Segoe UI', sans-serif;
      font-size: 14px;
      box-shadow: 0 8px 32px rgba(108,99,255,0.35);
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 260px;
      animation: formbotSlideIn 0.4s cubic-bezier(0.16,1,0.3,1);
    `;

    overlay.innerHTML = `
      <style>
        @keyframes formbotSlideIn {
          from { opacity:0; transform: translateY(20px) scale(0.95); }
          to   { opacity:1; transform: translateY(0) scale(1); }
        }
        #formbot-overlay button {
          cursor: pointer;
          border: none;
          border-radius: 8px;
          padding: 9px 16px;
          font-size: 13px;
          font-weight: 600;
          transition: opacity 0.2s;
        }
        #formbot-overlay button:hover { opacity: 0.85; }
      </style>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:22px;"><img src="" id="ext-icon">
<script>
  document.getElementById('ext-icon').src = chrome.runtime.getURL('icons/icon16.png');
</script></span>
        <div>
          <div style="font-weight:700;font-size:15px;color:#a78bfa;">FormBot</div>
          <div style="color:#c4b5fd;font-size:13px;">${count} field${count !== 1 ? "s" : ""} filled automatically</div>
        </div>
        <button onclick="document.getElementById('formbot-overlay').remove()"
          style="margin-left:auto;background:transparent;color:#888;font-size:18px;padding:2px 6px;">×</button>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="formbot-submit-btn"
          style="background:#6c63ff;color:#fff;flex:1;">
          ✓ Submit Form
        </button>
        <button onclick="document.getElementById('formbot-overlay').remove()"
          style="background:#2d2d44;color:#c4b5fd;">
          Review first
        </button>
      </div>
      <div style="text-align:center;margin-top:-2px;">
        <a href="#" id="formbot-support-link" style="
          color:#a78bfa;
          font-size:12px;
          text-decoration:none;
          opacity:0.85;
        ">☕ Support FormBot</a>
      </div>
    `;

    document.body.appendChild(overlay);

    document
      .getElementById("formbot-submit-btn")
      .addEventListener("click", () => {
        const submitBtn = document.querySelector(
          '[role="button"][jsname="M2UYVd"], .freebirdFormviewerViewNavigationSubmitButton',
        );
        if (submitBtn) submitBtn.click();
        overlay.remove();
      });

    document
      .getElementById("formbot-support-link")
      .addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({
          action: "OPEN_SUPPORT_LINK",
          url: CONFIG.KOFI_URL,
        });
      });

    // Auto-dismiss after 30s
    setTimeout(() => overlay?.remove(), 30000);
  }
})();