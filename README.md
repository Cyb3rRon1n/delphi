# delphi

A Chrome extension for self-study: get an explanation of the reasoning behind a practice question — including why the *other* choices are wrong, which is the part most practice tests and mock exams skip — with the answer revealed on click.

**Not for live/proctored exams.** Every answer requires an explicit click from you — nothing auto-answers, ever. The panel and buttons it shows are normal in-page UI elements, not something designed to hide from a screen share or a proctor. It exists to fix a specific self-study problem: mock tests that tell you an answer is wrong without ever saying why.

## How it works

Three ways to hand Delphi a question:

1. **Select text** → right-click → "Explain with Delphi", or `Ctrl+Shift+E`.
2. **Capture a region** → right-click anywhere (or on an image) → "Capture region with Delphi", or `Ctrl+Shift+D` → drag a box around a question that isn't selectable text (an image, a canvas-rendered quiz, a PDF viewer). Sent to a vision-capable model — no separate OCR step needed, the model reads the image directly.
3. **Auto-detect** (optional, off by default) → toggle it on in the popup for the current tab. Delphi scans the page for question-shaped text (a `?` plus multiple `A) B) C)`-style choices) and adds a small "Explain" button next to each one it finds. A "Delphi watching (N)" badge stays visible the whole time with a one-click stop, and the toggle resets automatically when you navigate to a new page — it's opt-in per page load, never silently persistent. Clicking a detected question's button is still what triggers the actual LLM call.

In every case, Delphi sends the content to an LLM with a prompt asking for reasoning first, then the answer. The answer is hidden behind a "Reveal answer" button by default — read the explanation, think about it, then check yourself.

## LLM providers

Configurable in the extension's Options page:

- **Chrome built-in AI (default)** — Gemini Nano via Chrome's [Prompt API](https://developer.chrome.com/docs/ai/prompt-api). Free, on-device, no API key, no network call once the model is downloaded. Requires a recent Chrome (148+) with the feature available.
- **Ollama (local)** — points at a local `ollama serve` instance. Free, private, works offline, needs Ollama installed with a model pulled.
- **Custom API** — any OpenAI-compatible chat completions endpoint (OpenAI, OpenRouter, Groq, etc.) with a key you supply and that stays in local extension storage.

## Modes

- **Explain first** (default) — reasoning, then a hidden answer you reveal when ready.
- **Answer only** — for a quick self-check pass once you've already reasoned it out yourself.

## Install (unpacked, for development)

1. `chrome://extensions` → enable Developer mode → "Load unpacked" → select this directory.
2. Open the extension's Options page and pick a provider (Chrome built-in AI works with zero setup, if available in your Chrome version).

## Status

v0.2 — text selection, region capture (image input, vision-capable providers), and opt-in per-tab auto-detect. Every path still ends in a manual click before any LLM call happens.

## Tests

```
node tests/test_prompt_template.js
```
