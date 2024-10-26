// Initialize items array
let collectedItems = [];

// Load items when extension starts
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['collectedItems'], function(result) {
    collectedItems = result.collectedItems || [];
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log("Context menu clicked", info, tab);
  if (info.menuItemId === "summarizeSelection") {
    chrome.tabs.sendMessage(tab.id, { action: "summarizeSelection" });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTexts") {
    // Filter items by domain instead of URL
    const currentDomain = request.domain;
    const filteredItems = collectedItems.filter(item => {
      try {
        return item.domain === currentDomain;
      } catch (e) {
        console.error('Error filtering items:', e);
        return false;
      }
    });
    
    sendResponse({ items: filteredItems });
  } else if (request.action === "removeText") {
    collectedItems.splice(request.index, 1);
    saveCollectedItems();
    sendResponse({ items: collectedItems });
  } else if (request.action === "clearAll") {
    collectedItems = [];
    saveCollectedItems();
    sendResponse({ items: [] });
  } else if (request.action === "addText") {
    collectedItems.push(request.data);
    saveCollectedItems();
    
    // Filter items for the current domain before sending response
    const currentDomain = request.data.domain;
    const filteredItems = collectedItems.filter(item => item.domain === currentDomain);
    sendResponse({ items: filteredItems });
  }
  return true; // Keep message channel open for async response
});

function saveCollectedItems() {
  chrome.storage.local.set({collectedItems: collectedItems}, function() {
    console.log('Collected items saved');
    chrome.tabs.query({}, function(tabs) {
      tabs.forEach(tab => {
        // Get the domain of each tab
        const tabUrl = new URL(tab.url);
        const tabDomain = tabUrl.hostname;
        
        // Filter items for that tab's domain
        const filteredItems = collectedItems.filter(item => item.domain === tabDomain);
        
        chrome.tabs.sendMessage(tab.id, {
          action: "updateToolWindow", 
          items: filteredItems
        }).catch(err => {
          // Handle error or ignore if tab doesn't have content script
          console.log('Error sending message to tab:', err);
        });
      });
    });
  });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === toolWindowTabId) {
    toolWindowTabId = null;
  }
});

console.log("Background script loaded");
