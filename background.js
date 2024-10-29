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
      
      // Update badge for this tab
      if (sender.tab) {
        updateBadge(sender.tab.id, currentDomain);
      }
      
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

// Function to update badge with number of items for current domain
function updateBadge(tabId, domain) {
  chrome.storage.local.get(['collectedItems'], function(result) {
    const items = result.collectedItems || [];
    const domainItems = items.filter(item => item.domain === domain);
    const count = domainItems.length;

    // Add spaces around the number to make it appear larger
    const badgeText = count > 0 ? ` ${count} ` : '';

    // Set badge text (empty string to hide badge when count is 0)
    chrome.action.setBadgeText({
      text: badgeText,
      tabId: tabId
    });

    // Set badge background color
    chrome.action.setBadgeBackgroundColor({
      color: '#4688F1',  // Google blue
      tabId: tabId
    });

    // Set badge text color to yellow
    chrome.action.setBadgeTextColor({
      color: '#FFFF00',  // Yellow
      tabId: tabId
    });

    // Update tooltip/hint text
    const tooltipText = count > 0 
      ? `${count} item${count === 1 ? '' : 's'} collected on ${domain}`
      : 'Web Clipper - No items collected yet';
    
    chrome.action.setTitle({
      title: tooltipText,
      tabId: tabId
    });
  });
}

// Update the saveCollectedItems function to update badges
function saveCollectedItems() {
  chrome.storage.local.set({collectedItems: collectedItems}, function() {
    chrome.tabs.query({}, function(tabs) {
      tabs.forEach(tab => {
        try {
          // Only process tabs with valid URLs
          if (tab.url && tab.url.startsWith('http')) {
            const tabUrl = new URL(tab.url);
            const tabDomain = tabUrl.hostname;
            
            // Update badge for this tab
            updateBadge(tab.id, tabDomain);
            
            // Filter items for that tab's domain
            const filteredItems = collectedItems.filter(item => item.domain === tabDomain);
            
            chrome.tabs.sendMessage(tab.id, {
              action: "updateToolWindow", 
              items: filteredItems
            }).catch(err => {
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

// Add listeners to update badge when tabs change
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.url && tab.url.startsWith('http')) {
      const tabUrl = new URL(tab.url);
      updateBadge(tab.id, tabUrl.hostname);
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    const tabUrl = new URL(tab.url);
    updateBadge(tabId, tabUrl.hostname);
  }
});

// Update badge when items are cleared
function clearAllCollectedText() {
  collectedItems = [];
  saveCollectedItems();
  // Clear badge on all tabs
  chrome.tabs.query({}, function(tabs) {
    tabs.forEach(tab => {
      chrome.action.setBadgeText({
        text: '',
        tabId: tab.id
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

chrome.action.setBadgeTextColor({
  color: '#FFFFFF'  // White
});

console.debug("Background script loaded");
