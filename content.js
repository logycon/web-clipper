const textTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'DIV', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'PRE', 'CODE'];
let currentElement = null;
let toolWindow = null;
let isToolWindowVisible = false; // Default to false
const currentDomain = window.location.hostname;

// Add this at the top with other variables
let lastDoubleClickTime = 0;
const DOUBLE_CLICK_DELAY = 300; // milliseconds

// Function to load visibility state for current domain
function loadVisibilityState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['hiddenDomains'], function(result) {
      const hiddenDomains = result.hiddenDomains || [];
      isToolWindowVisible = !hiddenDomains.includes(currentDomain);
      resolve(isToolWindowVisible);
    });
  });
}

// Function to save visibility state for current domain
function saveVisibilityState() {
  chrome.storage.local.get(['hiddenDomains'], function(result) {
    let hiddenDomains = result.hiddenDomains || [];
    
    if (isToolWindowVisible) {
      // Remove domain from hidden list
      hiddenDomains = hiddenDomains.filter(domain => domain !== currentDomain);
    } else {
      // Add domain to hidden list if not already there
      if (!hiddenDomains.includes(currentDomain)) {
        hiddenDomains.push(currentDomain);
      }
    }
    
    chrome.storage.local.set({ hiddenDomains: hiddenDomains });
  });
}

// Define collectTextFromElement first
async function collectTextFromElement(elem, depth = 0) {
  if (elem.nodeType === Node.TEXT_NODE) {
    return elem.textContent.trim();
  }
  
  if (elem.nodeType === Node.ELEMENT_NODE) {
    if (window.getComputedStyle(elem).display === 'none') {
      return '';
    }

    let text = '';
    
    if (elem.tagName === 'IMG') {
      try {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              
              let imageType = 'image/jpeg';
              const srcLower = elem.src.toLowerCase();
              if (srcLower.endsWith('.png')) {
                imageType = 'image/png';
              } else if (srcLower.endsWith('.gif')) {
                imageType = 'image/gif';
              } else if (srcLower.endsWith('.webp')) {
                imageType = 'image/webp';
              }
              
              try {
                const base64 = canvas.toDataURL(imageType, 0.8);
                resolve(`\n[IMAGE:${base64}]\n`);
              } catch (e) {
                console.error('Failed with detected type, trying JPEG:', e);
                try {
                  const jpegBase64 = canvas.toDataURL('image/jpeg', 0.8);
                  resolve(`\n[IMAGE:${jpegBase64}]\n`);
                } catch (e2) {
                  console.error('Failed with JPEG fallback:', e2);
                  resolve(`\n[IMAGE:${elem.src}]\n`);
                }
              }
            } catch (canvasError) {
              console.error('Canvas operation failed:', canvasError);
              resolve(`\n[IMAGE:${elem.src}]\n`);
            }
          };
          
          img.onerror = () => {
            console.error('Failed to load image:', elem.src);
            resolve(`\n[IMAGE:${elem.src}]\n`);
          };
          
          img.src = elem.src;
          
          setTimeout(() => {
            if (!img.complete) {
              console.error('Image load timeout:', elem.src);
              resolve(`\n[IMAGE:${elem.src}]\n`);
            }
          }, 5000);
        });
      } catch (e) {
        console.error('Top level image handling error:', e);
        return `\n[IMAGE:${elem.src}]\n`;
      }
    }

    if (elem.tagName === 'TABLE') {
      return collectTableText(elem);
    }
    
    if (elem.tagName === 'LI') {
      const listType = elem.parentElement.tagName === 'OL' ? 'ol' : 'ul';
      const listIndex = Array.from(elem.parentElement.children).indexOf(elem) + 1;
      text += '  '.repeat(depth) + (listType === 'ol' ? `${listIndex}. ` : '• ');
    } else if (textTags.includes(elem.tagName)) {
      if (depth > 0 && getComputedStyle(elem).display === 'block') {
        text += '\n' + '  '.repeat(depth);
      }
    }

    for (let child of elem.childNodes) {
      const childText = await collectTextFromElement(child, depth + 1);
      text += childText;
    }

    if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'DIV', 'BLOCKQUOTE', 'PRE'].includes(elem.tagName)) {
      text += '\n';
    }

    return text;
  }
  
  return '';
}

// Then define selectElementText
async function selectElementText(element) {
  if (isWithinExtensionUI(element)) {
    return;
  }

  let collectedText = await collectTextFromElement(element);

  collectedText = collectedText
    .split('\n')
    .map(line => line.trim())
    .filter((line, index, array) => line !== '' || (line === '' && array[index - 1] !== ''))
    .join('\n')
    .trim();

  if (collectedText && collectedText.length >= 14) {
    const range = document.createRange();
    range.selectNodeContents(element);
    
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    addToCollection(collectedText, element);
  } else if (collectedText && collectedText.length < 14) {
    console.debug("Text not collected: less than 14 characters long");
  }
}

// Finally add the event listener
document.addEventListener('dblclick', async (event) => {
  // Prevent double processing
  const now = Date.now();
  if (now - lastDoubleClickTime < DOUBLE_CLICK_DELAY) {
    return;
  }
  lastDoubleClickTime = now;

  if (event.button !== 0) {
    return;
  }

  let target = event.target;

  if (target.closest('a') !== null) {
    console.debug("Double-click on a link element, not collecting text");
    return;
  }

  while (target && !textTags.includes(target.tagName)) {
    target = target.parentElement;
  }

  if (target && !isWithinExtensionUI(target)) {
    console.debug("Double-click event captured on text-containing element");
    await selectElementText(target);
  }
}, true);

// Load saved texts when the script starts
chrome.runtime.sendMessage({
  action: "getTexts",
  url: window.location.href,
  domain: window.location.hostname  // Add domain
}, function(response) {
  if (response && response.items) {  // Only check for items
    if (window.top === window.self) {
      updateToolWindow(response.items);
    }
  } else {
    console.debug("No items found or error loading items");
    if (window.top === window.self) {
      updateToolWindow([]); // Pass empty array to show "No items collected" message
    }
  }
});

// Listen for messages from the parent frame
window.addEventListener('message', function(event) {
  if (event.data.action === "summarizeSelection") {
    handleSummarizeSelection();
  } else if (event.data.action === "showSummary") {
    showSummaryPopup(event.data.summary);
  }
});

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.debug("Received message:", request);
  if (request.action === "summarizeSelection") {
    handleSummarizeSelection();
  } else if (request.action === "showSummary") {
    showSummaryPopup(request.summary);
  } else if (request.action === "updateToolWindow") {
    if (window.top === window.self) {
      updateToolWindow(request.items);
    }
  } else if (request.action === "addClip") {
    // New handler for the context menu "Add clip" action
    handleContextMenuClip(request.text);
  }
});

document.addEventListener('contextmenu', (event) => {
  console.debug("Right-click event captured");
  // Don't prevent default, allow context menu to appear
}, true);

function handleSummarizeSelection() {
  let selectedText = window.getSelection().toString();
  if (!selectedText && currentElement) {
    selectedText = currentElement.textContent.trim();
  }
  if (selectedText) {
    console.debug("Selected text:", selectedText);
    sendMessageToParent({ action: "summarize", text: selectedText });
  } else {
    console.debug("No text selected and no element highlighted");
  }
}

function showSummaryPopup(summary) {
  if (window.top !== window.self) return; // Don't show popup in iframes

  const popup = document.createElement('div');
  popup.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: white;
    border: 1px solid #ccc;
    padding: 10px;
    z-index: 9999;
    max-width: 300px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  `;
  
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.onclick = () => popup.remove();
  
  const summaryText = document.createElement('p');
  summaryText.textContent = summary;
  
  popup.appendChild(summaryText);
  popup.appendChild(closeButton);
  document.body.appendChild(popup);
}

function highlightElement(element) {
  console.debug("Selecting element:", element);
  if (currentElement) {
    console.debug("Removing selection from previous element");
    // Remove this line to prevent visual changes:
    // currentElement.classList.remove('summator-highlight');
  }
  currentElement = element;
  // Remove this line to prevent visual changes:
  // currentElement.classList.add('summator-highlight');
  
  // Select all text inside the element
  selectElementText(element);
  
  // Log the selected element's text content
  const text = currentElement.textContent.trim();
  console.debug("Text content of selected element:", text);
}

function collectTableText(table) {
  let text = '\n';
  const rows = table.rows;

  // Iterate through each row
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].cells;
    // Iterate through each cell in the row
    for (let j = 0; j < cells.length; j++) {
      const cellText = cells[j].textContent.trim();
      text += cellText + '\n\n'; // Add each cell's text followed by two newlines
    }
  }

  return text;
}

function addToCollection(text, element, position = null) {
  // Skip UI check if element is null (from iframe)
  if (element && isWithinExtensionUI(element)) {
    return;
  }

  if (text && text.length >= 14) {
    const url = window.location.href;
    const domain = window.location.hostname;
    
    // Use provided position or get it from element
    const finalPosition = position || (element ? getElementPosition(element) : { x: 0, y: 0 });

    chrome.runtime.sendMessage({
      action: "addText", 
      data: {
        text: text,
        url: url,
        domain: domain,
        position: finalPosition
      }
    }, function(response) {
      if (response && response.items) {
        if (window.top === window.self) {
          updateToolWindow(response.items.filter(item => item.domain === domain));
        }
      }
    });
  }
}

function getElementPosition(element) {
  const rect = element.getBoundingClientRect();
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  return {
    x: rect.left + scrollLeft,
    y: rect.top + scrollTop
  };
}

function updateToolWindow(items) {
  if (window.top !== window.self) return;

  if (!toolWindow) {
    toolWindow = createToolWindow();
  }
  
  const listContainer = toolWindow.querySelector('.summator-list-container');
  listContainer.innerHTML = '';
  
  if (Array.isArray(items) && items.length > 0) {
    items.forEach((item, index) => {
      const listItem = document.createElement('li');
      listItem.style.listStyleType = 'none';
      listItem.innerHTML = `
        <div style="display: flex; flex-direction: column; width: 100%;">
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <span class="summator-item-text">${index + 1}. ${item.text.substring(0, 50)}...</span>
            <button class="summator-remove-btn" data-index="${index}">×</button>
          </div>
          <a href="${item.url}" target="_blank" title="Position: (${Math.round(item.position.x)}, ${Math.round(item.position.y)})">
            ${item.domain}
          </a>
        </div>
      `;
      listContainer.appendChild(listItem);

      // Add click listener to the text span
      listItem.querySelector('.summator-item-text').addEventListener('click', () => {
        showFullTextModal(item.text);
      });
    });

    // Add event listeners for remove buttons
    listContainer.querySelectorAll('.summator-remove-btn').forEach(button => {
      button.addEventListener('click', function() {
        const index = parseInt(this.getAttribute('data-index'));
        removeCollectedText(index);
      });
    });

    // Scroll to bottom after adding items
    setTimeout(() => {
      listContainer.scrollTop = listContainer.scrollHeight;
    }, 100);
  } else {
    listContainer.innerHTML = '<li style="padding: 10px !important;">No items collected yet.</li>';
  }
}

function createToolWindow() {
  if (window.top !== window.self) return null;

  const toolWindow = document.createElement('div');
  toolWindow.id = 'summator-tool-window';
  // Set initial display to 'none'
  toolWindow.setAttribute('style', 'display: none !important');
  
  toolWindow.innerHTML = `
    <h3>Web Content Clipper</h3>
    <ul class="summator-list-container"></ul>
    <div class="summator-button-container">
      <button id="summator-show-all-btn" class="summator-btn">Show All</button>
      <button id="summator-clear-btn" class="summator-btn">Clear All</button>
    </div>
  `;
  
  toolWindow.querySelector('#summator-show-all-btn').addEventListener('click', showAllCollectedText);
  toolWindow.querySelector('#summator-clear-btn').addEventListener('click', clearAllCollectedText);
  
  document.body.appendChild(toolWindow);
  return toolWindow;
}

function summarizeCollectedText() {
  chrome.runtime.sendMessage({action: "getTexts"}, function(response) {
    if (response.texts.length > 0) {
      const text = response.texts.join('\n\n');
      sendMessageToParent({ action: "summarize", text: text });
    } else {
      console.debug("No text collected for summarization");
    }
  });
}

function clearAllCollectedText() {
  chrome.runtime.sendMessage({
    action: "clearAll"
  }, function(response) {
    // Don't check for success property
    if (window.top === window.self) {
      updateToolWindow([]);
    }
  });
}

function removeCollectedText(index) {
  const currentDomain = window.location.hostname;
  chrome.runtime.sendMessage({
    action: "removeText", 
    index: index,
    domain: currentDomain  // Add domain to the request
  }, function(response) {
    if (response && response.items) {
      // Filter items for current domain
      const domainItems = response.items.filter(item => item.domain === currentDomain);
      if (window.top === window.self) {
        updateToolWindow(domainItems);
      }
    } else {
      // If no items, update with empty array
      updateToolWindow([]);
    }
  });
}

function sendMessageToParent(message) {
  if (window.parent === window) {
    // We're in the top-level window, send directly to the extension
    chrome.runtime.sendMessage(message);
  } else {
    // We're in an iframe, send to the parent window
    window.parent.postMessage(message, '*');
  }
}

// Only create the tool window if we're in the top-level window
if (window.top === window.self) {
  chrome.runtime.sendMessage({action: "registerToolWindow"}, function(response) {
    if (response.success) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "updateToolWindow") {
          updateToolWindow(request.items);
        }
      });
    }
  });
}

function isWithinExtensionUI(element) {
  if (!element || !element.closest) {
    return false;
  }
  return element.closest('#summator-tool-window') !== null;
}

// Add this function to create and show notifications
function showNotification(message) {
  // Remove any existing notification first
  const existingNotification = document.querySelector('.summator-notification');
  if (existingNotification) {
    document.body.removeChild(existingNotification);
  }

  // Create new notification
  const notification = document.createElement('div');
  notification.className = 'summator-notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  // Force a reflow
  notification.offsetHeight;

  // Show notification
  notification.style.opacity = '1';
  notification.style.transform = 'translate(-50%, 0)';

  // Hide and remove after delay
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translate(-50%, 20px)';
    setTimeout(() => {
      if (notification.parentElement) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 2000);
}

// Update the showFullTextModal function
function showFullTextModal(text) {
  const modal = document.createElement('div');
  modal.className = 'summator-modal';
  
  const formattedContent = text.replace(/\[IMAGE:([^\]]+)\]/g, (match, base64) => {
    if (base64.startsWith('data:image')) {
      return `<img src="${base64}" style="max-width: 100%; height: auto; margin: 10px 0;">`;
    }
    return `<img src="${base64}" style="max-width: 100%; height: auto; margin: 10px 0;">`;
  });

  modal.innerHTML = `
    <div class="summator-modal-content">
      <div class="summator-modal-header">
        <h2>Full Text</h2>
        <div class="summator-modal-controls">
          <button class="summator-copy-btn">Copy</button>
          <button class="summator-close-btn">×</button>
        </div>
      </div>
      <div class="summator-full-text">${formattedContent}</div>
    </div>
  `;

  // Prevent background scroll when modal is open
  document.body.style.overflow = 'hidden';
  document.body.appendChild(modal);

  // Add copy functionality
  const copyBtn = modal.querySelector('.summator-copy-btn');
  copyBtn.addEventListener('click', async () => {
    try {
      const textToCopy = modal.querySelector('.summator-full-text').textContent;
      await navigator.clipboard.writeText(textToCopy);
      showNotification('Copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy text:', err);
      showNotification('Failed to copy text');
    }
  });

  // Add close functionality
  const closeBtn = modal.querySelector('.summator-close-btn');
  closeBtn.addEventListener('click', () => {
    document.body.style.overflow = ''; // Restore scrolling
    document.body.removeChild(modal);
  });

  // Close on outside click
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      document.body.style.overflow = ''; // Restore scrolling
      document.body.removeChild(modal);
    }
  });

  // Prevent scroll propagation
  modal.querySelector('.summator-full-text').addEventListener('wheel', (e) => {
    e.stopPropagation();
  });
}

function wrapLongLines(text, maxLineLength) {
  return text.split('\n').map(line => {
    if (line.length <= maxLineLength) {
      return line;
    }
    let wrappedLine = '';
    while (line.length > maxLineLength) {
      let splitIndex = line.lastIndexOf(' ', maxLineLength);
      if (splitIndex === -1) splitIndex = maxLineLength;
      wrappedLine += line.substring(0, splitIndex) + '\n';
      line = line.substring(splitIndex + 1);
    }
    return wrappedLine + line;
  }).join('\n');
}

// Helper function to escape HTML special characters
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

function showAllCollectedText() {
  chrome.runtime.sendMessage({
    action: "getTexts",
    url: window.location.href,  // Add the current URL
    domain: window.location.hostname  // Add domain
  }, function(response) {
    if (response && response.items && response.items.length > 0) {
      const allText = response.items.map((item, index) => {
        return `Entry ${index + 1} (${item.domain}):\n\n${item.text}\n\n`;
      }).join('---\n\n');
      showFullTextModal(allText);
    } else {
      showFullTextModal("No text collected yet.");
    }
  });
}

// Add toggle functionality
function toggleToolWindow() {
  if (!toolWindow) {
    toolWindow = createToolWindow();
  }
  
  isToolWindowVisible = !isToolWindowVisible;
  if (isToolWindowVisible) {
    toolWindow.setAttribute('style', 'display: block !important');
  } else {
    toolWindow.setAttribute('style', 'display: none !important');
  }
  
  // Save the new state
  saveVisibilityState();
}

// Add message listener for toggle
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleCollector") {
    toggleToolWindow();
    sendResponse({ visible: isToolWindowVisible });
  }
});

// Update your initialization code to not show the window immediately
document.addEventListener('DOMContentLoaded', async function() {
  if (window.top === window.self) {
    await loadVisibilityState();
    toolWindow = createToolWindow();
  }
});

// Add this function to handle iframe messages
function sendMessageToParent(message) {
  try {
    window.top.postMessage({
      type: 'summator-iframe-event',
      data: message
    }, '*');
  } catch (e) {
    console.error('Failed to send message to parent:', e);
  }
}

// Update the double-click event listener
document.addEventListener('dblclick', async (event) => {
  // Prevent double processing
  const now = Date.now();
  if (now - lastDoubleClickTime < DOUBLE_CLICK_DELAY) {
    return;
  }
  lastDoubleClickTime = now;

  if (event.button !== 0) {
    return;
  }

  const textTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'DIV', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'PRE', 'CODE'];
  let target = event.target;

  if (target.closest('a') !== null) {
    console.debug("Double-click on a link element, not collecting text");
    return;
  }

  while (target && !textTags.includes(target.tagName)) {
    target = target.parentElement;
  }

  if (target && !isWithinExtensionUI(target)) {
    await selectElementText(target);
  }
}, true);

// Add message listener in the main window
if (window.top === window.self) {
  window.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'summator-iframe-event') {
      const message = event.data.data;
      if (message.action === 'selectText') {
        // Don't pass fake element object, just pass null since we know it's not within UI
        addToCollection(message.text, null, message.position);
      }
    }
  }, false);
}

// Update getElementPosition to handle iframes
function getElementPosition(element) {
  const rect = element.getBoundingClientRect();
  let x = rect.left;
  let y = rect.top;

  // Add iframe offset if we're in an iframe
  if (window !== window.top) {
    try {
      let frame = window.frameElement;
      while (frame) {
        const frameRect = frame.getBoundingClientRect();
        x += frameRect.left;
        y += frameRect.top;
        frame = frame.ownerDocument.defaultView.frameElement;
      }
    } catch (e) {
      console.error('Failed to calculate iframe position:', e);
    }
  }

  return { x, y };
}

// Add this new function to handle context menu clips
async function handleContextMenuClip(selectedText) {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer;
    
    // Find the closest element that contains the entire selection
    let container = commonAncestor.nodeType === Node.ELEMENT_NODE ? commonAncestor : commonAncestor.parentElement;
    while (container && !container.contains(range.startContainer) || !container.contains(range.endContainer)) {
      container = container.parentElement;
    }

    if (container) {
      // Check if the container or its parent is a table, div, or p
      const relevantElement = container.closest('table, div, p');
      if (relevantElement) {
        // Create a new range that only encompasses the selected content
        const newRange = document.createRange();
        newRange.setStart(range.startContainer, range.startOffset);
        newRange.setEnd(range.endContainer, range.endOffset);
        
        // Create a temporary element to hold the selected content
        const tempElement = document.createElement('div');
        tempElement.appendChild(newRange.cloneContents());
        
        // Collect text from the temporary element
        const collectedText = await collectTextFromElement(tempElement);
        addToCollection(collectedText, null, getElementPosition(relevantElement));
      } else {
        // If no relevant container found, just add the selected text
        addToCollection(selectedText, null);
      }
    } else {
      // Fallback to just adding the selected text
      addToCollection(selectedText, null);
    }
  } else {
    // Fallback to just adding the selected text
    addToCollection(selectedText, null);
  }
}

