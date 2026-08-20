# Walkthrough

## 1. Load it

**Fastest path:**
```
git clone https://github.com/Cyb3rRon1n/delphi.git
cd delphi && ./install.sh
```
This launches Chrome/Chromium/Brave with Delphi already loaded, in a separate throwaway profile so it never touches your normal browsing setup. First run: click the toolbar puzzle-piece icon and pin Delphi so it's visible.

**Manual path** (or if `install.sh` can't find your browser): `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `delphi` folder. Whenever you edit a file, come back here and click the reload icon (↻) on Delphi's card — it doesn't auto-reload.

## 2. Confirm the LLM backend

This is the step most likely to need a moment, and it depends on your browser build:

1. On Delphi's card in `chrome://extensions`, click **service worker** — opens a devtools console attached to the extension's background script.
2. Run: `await LanguageModel.availability()`
3. What it returns:
   - `"available"` — done, works immediately.
   - `"downloadable"` — run `await LanguageModel.create()` once to trigger the on-device model download, wait, then re-check.
   - `"unavailable"` / `LanguageModel is not defined` — check `chrome://version` (need 148+), and try enabling `chrome://flags/#prompt-api-for-gemini-nano` and `chrome://flags/#optimization-guide-on-device-model`. If it's still not available, switch to Ollama in Options instead of waiting on it — see below.

**Prefer a local server instead of the on-device model?** Open Delphi's **Options** (right-click the toolbar icon → Options, or the side panel's "Settings" link) → pick **Ollama** → point it at your `ollama serve` instance. Set both the text model and the vision model (they're separate fields — one general-purpose model is rarely good at both).

## 3. Try it on the built-in test page

```
cd manual-test && python3 -m http.server 8123
```
Open `http://localhost:8123/` (not `file://` — extensions need an extra permission toggle for that). The page has a plain-text MC question, a question split across a list, a rendered-as-image question, and two distractor blocks that should *not* get flagged by auto-detect.

Try each input path against it:
- **Select the plain-text question** → right-click → *Explain with Delphi* (or `Ctrl+Shift+E`).
- **Right-click the image question** → *Capture region with Delphi* (or `Ctrl+Shift+D`) → drag a box around it.
- **Toggle auto-detect** in the side panel → confirm buttons appear next to the real questions, not the distractors.
- **Click "Check this page"** in the side panel → confirm it finds all the questions on the page, not just what's visible without scrolling.

## 4. What "working" looks like

- A result shows up in the side panel's history, collapsed to just the question label — click it to expand.
- The explanation is broken into separate lines, not one dense paragraph, and the answer sits in its own labeled box behind "Reveal answer".
- While anything is actually running, the side panel shows a "Delphi is thinking" banner. If you don't see it and nothing seems to be happening, check the service worker console (step 2) for an error.

From here: [README](../README.md) covers every feature in full; [CLAUDE.md](../CLAUDE.md) covers the architecture and the real bugs found building this, if you're modifying the code.
