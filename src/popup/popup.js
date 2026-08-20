document.getElementById("open-options").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

const toggle = document.getElementById("auto-toggle");

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab?.id) return;
  chrome.runtime.sendMessage({ type: "DELPHI_GET_AUTO", tabId: tab.id }, (enabled) => {
    toggle.checked = Boolean(enabled);
  });

  toggle.addEventListener("change", () => {
    chrome.runtime.sendMessage({ type: "DELPHI_SET_AUTO", tabId: tab.id, enabled: toggle.checked });
  });
});
