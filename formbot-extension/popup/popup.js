// popup.js v4 — adds Ko-fi support footer on the main forms-list page

let currentStep = 1;
let extractedFields = [];
let autoSubmit = false;
let scheduleEnabled = false;
let selectedDays = [];

const DRAFT_KEY = "formbot_draft";
const KOFI_URL = "https://ko-fi.com/miteshbari";

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupToggle("toggle-autosubmit", (val) => { autoSubmit = val; });
  setupToggle("toggle-schedule", (val) => {
    scheduleEnabled = val;
    document.getElementById("schedule-options").style.display = val ? "block" : "none";
  });
  setupDayButtons();
  setupRepeatSelect();
  setupButtons();
  await restoreDraft();
  await renderFormsList();
  updateFormCount();
});

// ─── Support footer (Ko-fi) — injected on the home/forms-list tab ────────────
function injectSupportFooter() {
  // Avoid duplicate insertion if renderFormsList runs more than once
  if (document.getElementById("formbot-support-footer")) return;

  const homeTab = document.getElementById("tab-home");
  if (!homeTab) return; // safety check in case tab id differs

  const footer = document.createElement("div");
  footer.id = "formbot-support-footer";
  footer.style.cssText = `
    padding: 10px 16px 14px;
    text-align: center;
    font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
    border-top: 1px solid var(--border, #2d2d44);
    margin-top: 8px;
  `;

  footer.innerHTML = `
    <a href="#" id="formbot-support-link" style="
      color: var(--accent, #a78bfa);
      font-size: 12.5px;
      text-decoration: none;
      opacity: 0.85;
    ">☕ Enjoying FormBot? Support the project</a>
  `;

  homeTab.appendChild(footer);

  document.getElementById("formbot-support-link").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ action: "OPEN_SUPPORT_LINK", url: KOFI_URL });
  });
}

// ─── Draft: save everything including URL to storage ─────────────────────────
async function saveDraft(extraFields = {}) {
  const draft = {
    step: currentStep,
    url: document.getElementById("form-url").value.trim(),
    name: document.getElementById("form-name").value.trim(),
    fields: extractedFields,
    ...extraFields,
  };
  await chrome.storage.local.set({ [DRAFT_KEY]: draft });
  return draft;
}

async function restoreDraft() {
  const result = await chrome.storage.local.get(DRAFT_KEY);
  const draft = result[DRAFT_KEY];
  if (!draft) return;

  // Always restore URL and name first — this is what was getting lost
  if (draft.url) document.getElementById("form-url").value = draft.url;
  if (draft.name) document.getElementById("form-name").value = draft.name;

  if (draft.fields && draft.fields.length > 0) {
    extractedFields = draft.fields;
    renderFieldInputs(extractedFields);
  }

  if (draft.step && draft.step >= 2) {
    goToStep(draft.step);
    document.querySelector('[data-tab="add"]').click();
  }
}

async function clearDraft() {
  await chrome.storage.local.remove([DRAFT_KEY, "formbot_pending_tab"]);
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
    });
  });
}

function setupToggle(id, onChange) {
  const el = document.getElementById(id);
  el.addEventListener("click", () => {
    el.classList.toggle("on");
    onChange(el.classList.contains("on"));
  });
}

function setupDayButtons() {
  document.querySelectorAll(".day-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("selected");
      const day = btn.dataset.day;
      if (btn.classList.contains("selected")) {
        if (!selectedDays.includes(day)) selectedDays.push(day);
      } else {
        selectedDays = selectedDays.filter((d) => d !== day);
      }
    });
  });
}

function setupRepeatSelect() {
  document.getElementById("schedule-repeat").addEventListener("change", (e) => {
    document.getElementById("days-picker").style.display =
      e.target.value === "weekly" ? "block" : "none";
  });
}

function setupButtons() {
  document.getElementById("btn-load-form").addEventListener("click", loadFormFields);
  document.getElementById("btn-manual-entry").addEventListener("click", manualEntry);
  document.getElementById("btn-back-1").addEventListener("click", async () => { await clearDraft(); goToStep(1); });
  document.getElementById("btn-to-schedule").addEventListener("click", async () => { await saveDraft(); goToStep(3); });
  document.getElementById("btn-back-2").addEventListener("click", () => goToStep(2));
  document.getElementById("btn-save-form").addEventListener("click", saveForm);
  document.getElementById("btn-clear-all").addEventListener("click", clearAllForms);
}

function goToStep(n) {
  currentStep = n;
  [1, 2, 3].forEach((i) => {
    document.getElementById(`step-${i}`).style.display = i === n ? "block" : "none";
    const ind = document.getElementById(`step-ind-${i}`);
    ind.classList.remove("active", "done");
    if (i === n) ind.classList.add("active");
    else if (i < n) ind.classList.add("done");
  });
}

// ─── Load form: open tab in BACKGROUND so popup stays open ───────────────────
async function loadFormFields() {
  const url = document.getElementById("form-url").value.trim();
  const alertEl = document.getElementById("url-alert");

  if (!url || (!url.includes("docs.google.com/forms") && !url.includes("forms.gle"))) {
    showAlert(alertEl, "error", "Please enter a valid Google Forms URL.");
    return;
  }

  showAlert(alertEl, "info", "Opening form in background tab…");
  document.getElementById("btn-load-form").disabled = true;
  document.getElementById("btn-load-form").textContent = "Loading…";

  // Save draft with current URL before anything else
  await saveDraft();

  // Open tab in BACKGROUND (active: false) — this keeps the popup open!
  const tab = await chrome.tabs.create({ url, active: false });
  await chrome.storage.local.set({ formbot_pending_tab: tab.id });

  showAlert(alertEl, "info", "Waiting for form to load…");

  // Poll the tab until it's complete, then extract
  let attempts = 0;
  const maxAttempts = 20;

  const poll = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(poll);
      showAlert(alertEl, "error", "Form took too long to load. Try again or use manual entry.");
      resetLoadButton();
      return;
    }

    let tab;
    try {
      const result = await chrome.tabs.get(
        (await chrome.storage.local.get("formbot_pending_tab")).formbot_pending_tab
      );
      tab = result;
    } catch {
      clearInterval(poll);
      showAlert(alertEl, "error", "Tab was closed. Please try again.");
      resetLoadButton();
      return;
    }

    if (tab.status !== "complete") return; // keep polling

    clearInterval(poll);

    // Small delay to let Google Forms JS render questions
    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: "PING" });
      } catch {
        showAlert(alertEl, "error", "Form loaded but script not ready. Try clicking Load again.");
        resetLoadButton();
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_FIELDS" });
      extractedFields = response?.fields || [];

      await chrome.storage.local.remove("formbot_pending_tab");

      if (extractedFields.length === 0) {
        showAlert(alertEl, "error", "No fields found. Use \"Enter Manually\" instead.");
        resetLoadButton();
        return;
      }

      // Save draft with fields + current URL preserved
      await saveDraft({ fields: extractedFields, step: 2 });

      renderFieldInputs(extractedFields);
      goToStep(2);
      resetLoadButton();
    }, 1500);

  }, 1000);
}

function resetLoadButton() {
  const btn = document.getElementById("btn-load-form");
  btn.disabled = false;
  btn.innerHTML = "<span>🔍 Load Form Fields Automatically</span>";
}

// ─── Check for pending tab on popup open (fallback for when it closed anyway) ─
async function tryExtractOnOpen() {
  const { formbot_pending_tab: tabId } = await chrome.storage.local.get("formbot_pending_tab");
  if (!tabId) return;

  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch {
    await chrome.storage.local.remove("formbot_pending_tab");
    return;
  }

  if (!tab?.url?.includes("docs.google.com/forms")) return;
  if (tab.status !== "complete") return;

  try { await chrome.tabs.sendMessage(tabId, { action: "PING" }); } catch { return; }

  const response = await chrome.tabs.sendMessage(tabId, { action: "EXTRACT_FIELDS" });
  if (!response?.fields?.length) return;

  extractedFields = response.fields;
  await chrome.storage.local.remove("formbot_pending_tab");

  // Merge fields into existing draft WITHOUT overwriting URL
  const existing = await chrome.storage.local.get(DRAFT_KEY);
  const draft = existing[DRAFT_KEY] || {};
  await chrome.storage.local.set({
    [DRAFT_KEY]: { ...draft, fields: extractedFields, step: 2 }
  });

  renderFieldInputs(extractedFields);
  goToStep(2);
  document.querySelector('[data-tab="add"]').click();
}

// ─── Manual entry ─────────────────────────────────────────────────────────────
function manualEntry() {
  const url = document.getElementById("form-url").value.trim();
  if (!url) {
    showAlert(document.getElementById("url-alert"), "error", "Please enter the form URL first.");
    return;
  }
  extractedFields = [
    { id: "f0", title: "Question 1", type: "text", options: [], required: false },
    { id: "f1", title: "Question 2", type: "text", options: [], required: false },
    { id: "f2", title: "Question 3", type: "text", options: [], required: false },
  ];
  renderFieldInputs(extractedFields, true);
  saveDraft();
  goToStep(2);
}

// ─── Render fields ────────────────────────────────────────────────────────────
function renderFieldInputs(fields, editableTitles = false) {
  const container = document.getElementById("fields-container");
  container.innerHTML = "";

  fields.forEach((field, idx) => {
    const item = document.createElement("div");
    item.className = "question-item";

    const titleHTML = editableTitles
      ? `<input type="text" class="field-title-edit" data-idx="${idx}" value="${esc(field.title)}"
           placeholder="Paste exact question text from the form"
           style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:6px;
                  color:var(--text);font-family:'Space Grotesk',sans-serif;font-size:12px;
                  padding:5px 8px;outline:none;margin-bottom:6px;"/>`
      : `<div class="question-title">${esc(field.title)}${field.required ? '<span class="question-required">*</span>' : ''}
           <span style="font-size:10px;color:var(--muted);font-weight:400;margin-left:6px;">${field.type}</span>
         </div>`;

    let inputHTML = "";
    if (field.type === "radio" || field.type === "dropdown") {
      inputHTML = `<select data-field-idx="${idx}"
        style="width:100%;background:var(--surface);border:1.5px solid var(--border);
               border-radius:8px;color:var(--text);font-family:'Space Grotesk',sans-serif;
               font-size:13px;padding:8px 10px;outline:none;">
        <option value="">— Select —</option>
        ${field.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}
      </select>`;
    } else if (field.type === "checkbox") {
      inputHTML = field.options.map((o) => `
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer;font-size:13px;">
          <input type="checkbox" data-field-idx="${idx}" value="${esc(o)}"
            style="accent-color:var(--accent);width:15px;height:15px;"/> ${esc(o)}
        </label>`).join("");
    } else if (field.type === "textarea") {
      inputHTML = `<textarea data-field-idx="${idx}" placeholder="Your answer…"
        style="width:100%;background:var(--surface);border:1.5px solid var(--border);
               border-radius:8px;color:var(--text);font-family:'Space Grotesk',sans-serif;
               font-size:13px;padding:8px 10px;outline:none;resize:vertical;min-height:70px;"></textarea>`;
    } else {
      inputHTML = `<input type="text" data-field-idx="${idx}" placeholder="Your answer…"
        style="width:100%;background:var(--surface);border:1.5px solid var(--border);
               border-radius:8px;color:var(--text);font-family:'Space Grotesk',sans-serif;
               font-size:13px;padding:8px 10px;outline:none;"/>`;
    }

    item.innerHTML = titleHTML + inputHTML;
    container.appendChild(item);
  });

  if (editableTitles) {
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-secondary";
    addBtn.style.cssText = "width:100%;margin-top:6px;font-size:12px;";
    addBtn.textContent = "+ Add Question";
    addBtn.addEventListener("click", () => {
      extractedFields.push({ id: `f${Date.now()}`, title: `Question ${extractedFields.length + 1}`, type: "text", options: [], required: false });
      renderFieldInputs(extractedFields, true);
    });
    container.appendChild(addBtn);
  }
}

// ─── Collect answers (index-based, immune to title escaping bugs) ─────────────
function collectAnswers() {
  // Sync editable titles back to extractedFields array first
  document.querySelectorAll(".field-title-edit").forEach((el) => {
    const idx = parseInt(el.dataset.idx);
    if (extractedFields[idx]) extractedFields[idx].title = el.value.trim();
  });

  const answers = {};
  const container = document.getElementById("fields-container");

  container.querySelectorAll("input[type=text][data-field-idx], textarea[data-field-idx], select[data-field-idx]").forEach((el) => {
    const idx = parseInt(el.dataset.fieldIdx);
    const field = extractedFields[idx];
    if (field && el.value.trim()) answers[field.title] = el.value.trim();
  });

  container.querySelectorAll("input[type=checkbox]:checked[data-field-idx]").forEach((cb) => {
    const idx = parseInt(cb.dataset.fieldIdx);
    const field = extractedFields[idx];
    if (!field) return;
    if (!answers[field.title]) answers[field.title] = [];
    if (Array.isArray(answers[field.title])) answers[field.title].push(cb.value);
  });

  return answers;
}

// ─── Save form ────────────────────────────────────────────────────────────────
async function saveForm() {
  // Read URL from storage draft as fallback (in case input was cleared)
  let url = document.getElementById("form-url").value.trim();
  if (!url) {
    const result = await chrome.storage.local.get(DRAFT_KEY);
    url = result[DRAFT_KEY]?.url || "";
  }

  const name = document.getElementById("form-name").value.trim() ||
    (await chrome.storage.local.get(DRAFT_KEY))[DRAFT_KEY]?.name || "Untitled Form";

  if (!url) {
    alert("Form URL is missing. Please go back to step 1 and enter the URL.");
    return;
  }

  const answers = collectAnswers();
  if (Object.keys(answers).length === 0) {
    alert("Please fill in at least one answer before saving.");
    return;
  }

  const schedule = scheduleEnabled
    ? {
        enabled: true,
        time: document.getElementById("schedule-time").value || "09:00",
        repeat: document.getElementById("schedule-repeat").value || "daily",
        days: selectedDays,
      }
    : { enabled: false };

  const formId = `form_${Date.now()}`;
  const formData = { id: formId, url, name, answers, autoSubmit, schedule };

  const result = await chrome.storage.local.get("forms");
  const forms = result.forms || {};
  forms[formId] = formData;
  await chrome.storage.local.set({ forms });

  if (schedule.enabled) {
    chrome.runtime.sendMessage({ action: "SCHEDULE_FORM", formId, schedule });
  }

  await clearDraft();
  resetAddForm();
  await renderFormsList();
  updateFormCount();
  document.querySelector('[data-tab="home"]').click();
}

// ─── Forms list ───────────────────────────────────────────────────────────────
async function renderFormsList() {
  await tryExtractOnOpen();

  const result = await chrome.storage.local.get("forms");
  const forms = result.forms || {};
  const container = document.getElementById("forms-list");
  const list = Object.values(forms);

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📋</div>
        <p>No forms saved yet.<br/>Click "+ Add Form" to get started.</p>
      </div>`;
  } else {
    container.innerHTML = `<div class="scroll-area">${list.map(renderFormCard).join("")}</div>`;
    list.forEach((f) => {
      document.getElementById(`fill-${f.id}`)?.addEventListener("click", () => fillFormNow(f));
      document.getElementById(`delete-${f.id}`)?.addEventListener("click", () => deleteForm(f.id));
      document.getElementById(`toggle-sched-${f.id}`)?.addEventListener("click", () => toggleSchedule(f));
    });
  }

  // Always ensure the support footer is present on the home/forms-list tab
  injectSupportFooter();
}

function renderFormCard(f) {
  const schedChip = f.schedule?.enabled
    ? `<span class="chip chip-active">${f.schedule.time} · ${f.schedule.repeat}</span>`
    : `<span class="chip chip-idle">No schedule</span>`;
  const autoChip = f.autoSubmit
    ? `<span class="chip chip-active">Auto-submit ON</span>`
    : `<span class="chip chip-idle">Manual submit</span>`;
  const answerCount = Object.keys(f.answers || {}).length;

  return `
    <div class="form-card">
      <div class="form-card-header">
        <div style="flex:1;min-width:0;">
          <div class="form-card-title">${esc(f.name)}</div>
          <div class="form-card-url">${esc(f.url)}</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;">
            ${schedChip} ${autoChip}
            <span class="chip chip-idle">${answerCount} answer${answerCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>
      <div class="form-card-actions">
        <button class="btn btn-primary" id="fill-${f.id}" style="flex:1;font-size:12px;padding:7px 10px;">▶ Fill Now</button>
        <button class="btn btn-secondary" id="toggle-sched-${f.id}" style="font-size:11px;">
          ${f.schedule?.enabled ? "⏸ Pause" : "Schedule"}
        </button>
        <button class="btn btn-danger" id="delete-${f.id}">🗑</button>
      </div>
    </div>`;
}

async function fillFormNow(form) {
  const tab = await chrome.tabs.create({ url: form.url, active: true });
  chrome.tabs.onUpdated.addListener(function listener(id, info) {
    if (id !== tab.id || info.status !== "complete") return;
    chrome.tabs.onUpdated.removeListener(listener);
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, {
        action: "FILL_FORM",
        answers: form.answers,
        autoSubmit: form.autoSubmit,
      });
    }, 2500);
  });
  window.close();
}

async function deleteForm(id) {
  if (!confirm("Delete this saved form?")) return;
  const result = await chrome.storage.local.get("forms");
  const forms = result.forms || {};
  delete forms[id];
  await chrome.storage.local.set({ forms });
  chrome.runtime.sendMessage({ action: "CANCEL_SCHEDULE", formId: id });
  await renderFormsList();
  updateFormCount();
}

async function toggleSchedule(form) {
  const result = await chrome.storage.local.get("forms");
  const forms = result.forms || {};
  const f = forms[form.id];
  if (!f) return;
  if (f.schedule?.enabled) {
    f.schedule.enabled = false;
    chrome.runtime.sendMessage({ action: "CANCEL_SCHEDULE", formId: f.id });
  } else {
    f.schedule = f.schedule?.time
      ? { ...f.schedule, enabled: true }
      : { enabled: true, time: "09:00", repeat: "daily", days: [] };
    chrome.runtime.sendMessage({ action: "SCHEDULE_FORM", formId: f.id, schedule: f.schedule });
  }
  forms[form.id] = f;
  await chrome.storage.local.set({ forms });
  await renderFormsList();
}

async function clearAllForms() {
  if (!confirm("Delete ALL saved forms? This cannot be undone.")) return;
  await chrome.storage.local.set({ forms: {} });
  await chrome.alarms.clearAll();
  await clearDraft();
  await renderFormsList();
  updateFormCount();
}

async function updateFormCount() {
  const result = await chrome.storage.local.get("forms");
  const n = Object.keys(result.forms || {}).length;
  document.getElementById("form-count").textContent = `${n} form${n !== 1 ? "s" : ""}`;
}

function resetAddForm() {
  document.getElementById("form-url").value = "";
  document.getElementById("form-name").value = "";
  document.getElementById("fields-container").innerHTML = "";
  document.getElementById("url-alert").style.display = "none";
  extractedFields = [];
  autoSubmit = false;
  scheduleEnabled = false;
  selectedDays = [];
  document.getElementById("toggle-autosubmit").classList.remove("on");
  document.getElementById("toggle-schedule").classList.remove("on");
  document.getElementById("schedule-options").style.display = "none";
  document.querySelectorAll(".day-btn").forEach((b) => b.classList.remove("selected"));
  goToStep(1);
}

function showAlert(el, type, msg) {
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = "block";
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}