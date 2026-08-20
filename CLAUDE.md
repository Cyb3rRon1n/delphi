# CLAUDE.md

Guidance for working in this repo.

## What this is

A Chrome MV3 extension: select a practice question on a page, trigger it manually (context menu or `Ctrl+Shift+E`), get an LLM explanation with the answer hidden behind a reveal. Self-study tool, deliberately **not** built for live/proctored exams — see README's "Not for live/proctored exams" section before adding any feature that leans toward continuous/covert monitoring. That line is a scope boundary, not a suggestion.

## Architecture

No build step — MV3 supports ES modules natively, so `src/background.js` and everything it imports (`src/lib/`, `src/providers/`) use plain `import`/`export`. `src/content.js` is a classic script (injected via `chrome.scripting.executeScript({files: [...]})`, not an ES module) since it has no imports of its own.

**Nothing runs until the user acts.** There's no `content_scripts` entry in `manifest.json` — `src/content.js` is injected on demand by `background.js`, only after a context-menu click or the keyboard command fires. This is both the privacy-correct choice and the lazy one: no MutationObserver, no polling, no permission broader than `activeTab`.

**Message flow** (`src/background.js` → `src/content.js`):
1. Context menu / command → `runFor(tabId, selectedText)`.
2. Injects `content.js` (idempotent — guards on `window.__delphiInjected`), sends `{type: "DELPHI_SHOW", text}` so the panel shows a "Thinking…" state immediately.
3. Builds the prompt (`src/lib/prompt-template.js`), calls the active provider (`src/providers/index.js`), parses the reply, sends `{type: "DELPHI_RESULT", explanation, answer, mode}` (or `{error}`).
4. `content.js` renders into a shadow-DOM panel (`all: initial` on the host, to avoid the page's CSS leaking in or the panel's CSS leaking out).

**Providers** (`src/providers/*.js`) share the shape `{id, label, isAvailable(config), generate(prompt, config)}`. `src/providers/index.js` reads the active provider + its config from `chrome.storage.sync` (written by `src/options/options.js`) and dispatches. Default provider is `chrome-ai` (Chrome's built-in Gemini Nano via the Prompt API) — free, on-device, zero setup, which is why it's the default rather than requiring a key or a local server on first install.

**Prompt design**: `buildPrompt()` in explain mode explicitly asks the model to cover *why the wrong choices are wrong*, not just why the right one is right — that's the specific gap in most mock-test tooling this project exists to fill. Don't simplify that instruction away.

## Known scope gaps (not bugs — deliberate v0.1 boundaries)

- **No OCR / image support.** If a question is rendered as an image or canvas (not selectable DOM text), there's nothing to select. Adding OCR (e.g. Tesseract.js) is real added complexity — MV3's CSP forbids remotely-fetched *code*, so it'd need to be vendored locally, and the language-data fetch behavior needs checking against CSP too. Don't add this speculatively; add it when a real page needs it.
- **No auto-detection of questions.** Everything is manual-trigger. Auto-scanning the DOM for MC-shaped content is a real heuristics problem and starts to resemble the covert-monitoring tools this project deliberately avoids being. If it's ever added, it must stay visible (an on-page indicator, not silent) and opt-in per site.
- **Firefox unsupported.** Chrome-only for v1 to use the built-in Prompt API. A cross-browser build would need a provider abstraction for the "free local LLM" case that Firefox doesn't have (Ollama becomes the only free-local option there).

## Testing

`tests/test_prompt_template.js` — plain `node --experimental` free, assert-based, no framework (run with `node tests/test_prompt_template.js`). Add to this file, don't add a test framework, for the same reason there's no build step: nothing here justifies the machinery yet.
