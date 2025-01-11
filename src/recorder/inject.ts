import * as rrweb from "rrweb";

// Start recording
rrweb.record({
  emit(event) {
    // For now, just log the events to console
    console.log("rrweb event", event);
    chrome.runtime.sendMessage(
      {
        type: "RRWEB_EVENT",
        event,
      },
      (response) => {
        if (!response.success) {
          console.error("[Recorder] Failed to save events:", response.error);
        }
      }
    );
  },
});
