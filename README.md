# delphi

A Chrome extension for self-study: select a practice question on any page, get an explanation of the reasoning — including why the *other* choices are wrong, which is the part most practice tests and mock exams skip — with the answer revealed on click.

**Not for live/proctored exams.** No background scanning, no screen capture, no covert overlay — it only runs when you explicitly trigger it (right-click a selection → "Explain with Delphi", or `Ctrl+Shift+E`), and the panel it shows is a normal in-page UI element, not something designed to hide from a screen share or a proctor. It exists to fix a specific self-study problem: mock tests that tell you an answer is wrong without ever saying why.

## How it works

1. Select a question (and its choices) on any page.
2. Trigger it via the context menu or the keyboard shortcut.
3. Delphi sends the selected text to an LLM with a prompt asking for reasoning first, then the answer.
4. The answer is hidden behind a "Reveal answer" button by default — read the explanation, think about it, then check yourself.

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

v0.1 — manual-trigger only, text selection only (no OCR/image support yet — if a question is rendered as an image/canvas rather than selectable text, select the surrounding text or skip it for now).

## Tests

```
node tests/test_prompt_template.js
```
