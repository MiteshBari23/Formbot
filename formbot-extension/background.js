// background.js - Service worker for scheduling, tab management, and support link

importScripts("/popup/config.js"); // adjust path if config.js lives elsewhere relative to background.js

// ─── Alarm handler (scheduled form fills) ────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("formbot_")) return;

  const formId = alarm.name.replace("formbot_", "");
  const { forms = {} } = await chrome.storage.local.get("forms");
  const form = forms[formId];

  if (!form) return;

  // Open the form URL in a new tab
  const tab = await chrome.tabs.create({ url: form.url, active: false });

  // Wait for the tab to load, then fill
  chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
    if (tabId !== tab.id || info.status !== "complete") return;
    chrome.tabs.onUpdated.removeListener(listener);

    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, {
        action: "FILL_FORM",
        answers: form.answers,
        autoSubmit: form.autoSubmit,
      });

      // Make tab active so user sees the notification/overlay
      if (!form.autoSubmit) {
        chrome.tabs.update(tab.id, { active: true });
      }
    }, 2000); // give the form JS time to render
  });

  // Re-schedule next alarm if recurring
  if (form.schedule?.enabled && form.schedule?.repeat !== "once") {
    scheduleNextAlarm(formId, form.schedule);
  }
});

// ─── Handle messages from content / popup ────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "SCHEDULE_FORM") {
    scheduleNextAlarm(msg.formId, msg.schedule);
    sendResponse({ ok: true });
  }

  if (msg.action === "CANCEL_SCHEDULE") {
    chrome.alarms.clear(`formbot_${msg.formId}`);
    sendResponse({ ok: true });
  }

  if (msg.action === "FORM_FILLED") {
    if (msg.autoSubmit) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "FormBot – Form Submitted ✓",
        message: `${msg.filled} fields filled and form submitted automatically.`,
      });
    }
  }

  // ─── Support link: open Ko-fi (or whichever URL is passed) in a new tab ───
  // Content scripts and the popup can't call chrome.tabs.create with
  // arbitrary external URLs as reliably in all contexts, so route it here.
 if (msg.action === "OPEN_SUPPORT_LINK") {
  const url = msg.url || CONFIG.KOFI_URL;
  chrome.tabs.create({ url });
  sendResponse({ ok: true });
}

  return true;
});

// ─── Schedule alarm based on schedule config ─────────────────────────────────
function scheduleNextAlarm(formId, schedule) {
  const { time, repeat, days } = schedule; // time = "HH:MM", repeat = "daily"|"weekly"|"once"
  const [hours, minutes] = time.split(":").map(Number);

  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1); // push to tomorrow if time passed
  }

  // For weekly, find next matching day
  if (repeat === "weekly" && days?.length > 0) {
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const targetDays = days.map((d) => dayMap[d]);
    let offset = 0;
    for (let i = 0; i < 7; i++) {
      const dayToCheck = (now.getDay() + i) % 7;
      if (targetDays.includes(dayToCheck)) {
        const candidate = new Date(now);
        candidate.setDate(now.getDate() + i);
        candidate.setHours(hours, minutes, 0, 0);
        if (candidate > now) {
          target.setTime(candidate.getTime());
          break;
        }
      }
    }
  }

  chrome.alarms.create(`formbot_${formId}`, {
    when: target.getTime(),
  });
}