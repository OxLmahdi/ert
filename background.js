// Background service worker
chrome.runtime.onInstalled.addListener(() => {
    console.log('DocuSearch Pro installed');
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSearchData') {
        chrome.storage.local.get(['docIndex', 'invertedIndex'], result => {
            sendResponse(result);
        });
        return true; // Keep channel open for async
    }
});

// Context menu for quick access
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'searchSelection',
        title: 'Search in document',
        contexts: ['selection']
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'searchSelection') {
        chrome.storage.local.get(['invertedIndex'], result => {
            if (result.invertedIndex) {
                // Send search query to popup
                chrome.action.openPopup();
            }
        });
    }
});
