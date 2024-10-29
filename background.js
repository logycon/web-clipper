// Initialize items array
let collectedItems = [];

// Load items when extension starts
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['collectedItems'], function(result) {
    collectedItems = result.collectedItems || [];
  });
});

// Add this near the top of the file, after other initialization code
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "webClipperMenu",
    title: "Web Clipper",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "addClip",
    parentId: "webClipperMenu",
    title: "Add clip",
    contexts: ["selection"]
  });

  // Add new context menu for iframes
  chrome.contextMenus.create({
    id: "openIframe",
    title: "Open iframe in new tab",
    contexts: ["frame"]  // This makes it only appear on iframes
  });

  chrome.contextMenus.create({
    id: "openIframeWindow",
    title: "Open iframe in new window",
    contexts: ["frame"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "summarizeSelection") {
    chrome.tabs.sendMessage(tab.id, { action: "summarizeSelection" });
  }
  if (info.menuItemId === "addClip") {
    chrome.tabs.sendMessage(tab.id, { action: "addClip", text: info.selectionText });
  }
  if (info.menuItemId === "openIframe") {
    // Open iframe URL in new tab
    if (info.frameUrl) {
      chrome.tabs.create({ url: info.frameUrl });
    }
  }
  if (info.menuItemId === "openIframeWindow") {
    if (info.frameUrl) {
      chrome.windows.create({ 
        url: info.frameUrl,
        width: 1024,
        height: 768
      });
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTexts") {
    try {
      // Filter items for the current domain
      const currentDomain = request.domain;
      const filteredItems = collectedItems.filter(item => item.domain === currentDomain);
      sendResponse({ items: filteredItems });
    } catch (e) {
      console.error('Error filtering items:', e);
      sendResponse({ items: [] });
    }
  } else if (request.action === "removeText") {
    collectedItems.splice(request.index, 1);
    saveCollectedItems();
    
    // Filter items for the current domain
    const currentDomain = request.domain;
    const filteredItems = collectedItems.filter(item => item.domain === currentDomain);
    sendResponse({ items: filteredItems });
  } else if (request.action === "clearAll") {
    collectedItems = [];
    saveCollectedItems();
    sendResponse({ items: [] });
  } else if (request.action === "addText") {
    collectedItems.push(request.data);
    saveCollectedItems();
    
    // Filter items for the current domain
    const currentDomain = request.data.domain;
    const filteredItems = collectedItems.filter(item => item.domain === currentDomain);
    sendResponse({ items: filteredItems });
  }
  return true; // Keep message channel open for async response
});

function saveCollectedItems() {
  chrome.storage.local.set({collectedItems: collectedItems}, function() {
    chrome.tabs.query({}, function(tabs) {
      tabs.forEach(tab => {
        try {
          // Only process tabs with valid URLs
          if (tab.url && tab.url.startsWith('http')) {
            const tabUrl = new URL(tab.url);
            const tabDomain = tabUrl.hostname;
            
            // Filter items for that tab's domain
            const filteredItems = collectedItems.filter(item => item.domain === tabDomain);
            
            chrome.tabs.sendMessage(tab.id, {
              action: "updateToolWindow", 
              items: filteredItems
            }).catch(err => {
              // Ignore errors for tabs that can't receive messages
              console.debug('Error sending message to tab:', err);
            });
          }
        } catch (e) {
          console.debug('Invalid URL or chrome internal page:', tab.url);
        }
      });
    });
  });
}

// Add this near the top of the file with other initialization code
let toolWindowTabId = null;

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === toolWindowTabId) {
    toolWindowTabId = null;
  }
});

// Add this listener for the extension icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, {action: "toggleCollector"}, response => {
    console.debug('Toggle message sent');
  });
});

console.debug("Background script loaded");
