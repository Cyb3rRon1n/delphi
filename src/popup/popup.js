// browser.* (Firefox, promise-only) when present, else chrome.* (Chrome/Brave).
const api = globalThis.browser ?? chrome;

document.getElementById("open-options").addEventListener("click", (e) => {
  e.preventDefault();
  api.runtime.openOptionsPage();
});

const toggle = document.getElementById("auto-toggle");

api.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  if (!tab?.id) return;
  api.runtime.sendMessage({ type: "DELPHI_GET_AUTO", tabId: tab.id }).then((enabled) => {
    toggle.checked = Boolean(enabled);
  });

  toggle.addEventListener("change", () => {
    api.runtime.sendMessage({ type: "DELPHI_SET_AUTO", tabId: tab.id, enabled: toggle.checked });
  });
});
