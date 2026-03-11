# 🤖 FormBot – Google Forms Auto-Filler Chrome Extension

> Set your answers once. FormBot fills your recurring Google Forms automatically — on a schedule you define.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🔍 **Auto Field Extraction** | Opens the form and reads all fields automatically |
| ✏️ **One-Time Setup** | Enter your answers once; FormBot reuses them forever |
| ⏰ **Scheduling** | Daily, weekly (pick days), or one-time auto-fill |
| ✅ **Auto-Submit** | Optional: submit the form without any interaction |
| 🔔 **Smart Popup** | If auto-submit is off, shows a popup with a one-click Submit button |
| 🔒 **100% Local** | All data stored on-device via Chrome Storage — nothing sent to servers |

---

## 📦 Installation (Developer Mode)

Chrome extensions must be loaded in **Developer Mode** since this isn't on the Chrome Web Store yet.

### Steps:

1. **Download / unzip** this folder somewhere on your computer
2. Open Chrome and go to: `chrome://extensions`
3. Toggle **"Developer mode"** ON (top-right switch)
4. Click **"Load unpacked"**
5. Select the `formbot-extension` folder
6. The 🤖 FormBot icon will appear in your toolbar!

> **Tip:** Pin the extension by clicking the puzzle icon → FormBot → pin icon.

---

## 🚀 How to Use

### Adding a Form

1. Click the FormBot icon in your toolbar
2. Go to the **"+ Add Form"** tab
3. **Step 1 – URL:** Paste your Google Form link + give it a nickname → click "Load Form Fields"
4. **Step 2 – Answers:** Fill in your answers for each question (this is done once)
5. **Step 3 – Schedule:** 
   - Toggle **Auto Submit** if you want it to submit without asking
   - Toggle **Schedule** and pick a time + repeat pattern
6. Click **"💾 Save Form"**

### Filling a Form Manually

- Go to **My Forms** tab → click **"▶ Fill Now"** on any saved form
- A new tab opens, FormBot fills it, and either auto-submits or shows the overlay

### Scheduling

- When the scheduled time hits, FormBot opens the form in a background tab, fills it, and either:
  - **Auto-submits** (if enabled) → shows a Chrome notification
  - **Brings the tab to front** with the submit overlay

---

## 📁 File Structure

```
formbot-extension/
├── manifest.json          # Extension config (MV3)
├── background.js          # Service worker: scheduling + alarms
├── content.js             # Injected into Google Forms: extraction + filling
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── popup/
    ├── popup.html         # Extension popup UI
    └── popup.js           # All popup logic
```

---

## ⚙️ Permissions Explained

| Permission | Why |
|---|---|
| `activeTab` | To interact with the current Google Form tab |
| `storage` | To save form configurations locally |
| `alarms` | To schedule automatic form-fills |
| `notifications` | To show "Form Submitted" Chrome notifications |
| `scripting` | To inject the filler script into form tabs |
| `tabs` | To open/find/manage form tabs |

---

## 🔮 Future Ideas

- [ ] Support for Microsoft Forms / Typeform
- [ ] Multiple answer profiles per form (e.g., "Present" / "Absent")
- [ ] Google Calendar integration for smart scheduling
- [ ] Export/import form configs
- [ ] Chrome Web Store listing

---

## 🐛 Known Limitations

- Google Forms occasionally changes their internal DOM structure; field extraction may need updates
- Forms that require sign-in must be opened in a signed-in Chrome profile
- The extension won't work on PDFs or non-Google-Forms pages

---

*Built with ❤️ — no frameworks, no servers, just Chrome APIs.*
