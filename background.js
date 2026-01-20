
// Open the side panel when the extension icon is clicked
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// Initialize Context Menu
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "sendToATS",
        title: "Send to ResuFlux",
        contexts: ["selection"]
    }, () => {
        // If it exists, we get an error, which is fine.
        // If it doesn't, it's created.
        if (chrome.runtime.lastError) {
            console.log("ATS Menu setup:", chrome.runtime.lastError.message);
        } else {
            console.log("ATS Menu created successfully");
        }
    });
});

// Handle Context Menu Click
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "sendToATS" && info.selectionText) {

        // 1. Save text to storage
        chrome.storage.local.set({
            pendingJD: info.selectionText,
            sourceUrl: tab.url
        }, () => {
            console.log("ATS Background: Text saved to storage.");

            // 2. Open Side Panel (requires user gesture - context menu click counts!)
            chrome.sidePanel.open({ windowId: tab.windowId })
                .catch(err => console.error("Could not open side panel:", err));
        });
    }
});

console.log("ATS Background Service Worker Loaded");
