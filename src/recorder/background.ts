async function injectScript(
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab
) {
  // Only inject once the tab is completely loaded
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    !tab.url.startsWith("chrome://")
  ) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["inject.js"],
      });
    } catch (error) {
      console.log("Script injection failed:", error);
    }
  }
}

chrome.tabs.onUpdated.addListener(injectScript);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "RRWEB_EVENT") {
    console.log("[Recorder Background] got RRWEB_EVENT", message.event);
    sendResponse({ success: true });
    return true;
  }
});
