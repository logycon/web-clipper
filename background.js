let collectedItems = [];

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['collectedItems'], function(result) {
    if (result.collectedItems) {
      collectedItems = result.collectedItems;
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log("Context menu clicked", info, tab);
  if (info.menuItemId === "summarizeSelection") {
    chrome.tabs.sendMessage(tab.id, { action: "summarizeSelection" });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "addText") {
    collectedItems.push(request.data);
    saveCollectedItems();
    sendResponse({success: true});
  } else if (request.action === "removeText") {
    collectedItems.splice(request.index, 1);
    saveCollectedItems();
    sendResponse({success: true});
  } else if (request.action === "clearAll") {
    collectedItems = [];
    saveCollectedItems();
    sendResponse({success: true});
  } else if (request.action === "getTexts") {
    sendResponse({items: collectedItems});
  }
  return true;
});

function saveCollectedItems() {
  chrome.storage.local.set({collectedItems: collectedItems}, function() {
    console.log('Collected items saved');
    chrome.tabs.query({}, function(tabs) {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {action: "updateToolWindow", items: collectedItems});
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
