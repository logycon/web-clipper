let currentElement = null;
let collectedTexts = [];
let toolWindow = null;

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
    console.log("No items found or error loading items");
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
  console.log("Received message:", request);
  if (request.action === "summarizeSelection") {
    handleSummarizeSelection();
  } else if (request.action === "showSummary") {
    showSummaryPopup(request.summary);
  } else if (request.action === "updateToolWindow") {
    if (window.top === window.self) {
      updateToolWindow(request.items);
    }
  }
});

// Remove the contextmenu event listener and add a click event listener
document.addEventListener('click', (event) => {
  // Check if it's a left click (event.button === 0)
  if (event.button !== 0) {
    return;
  }

  const textTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'DIV', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'PRE', 'CODE'];
  let target = event.target;

  // Check if the clicked element or any of its ancestors is an <a> tag
  if (target.closest('a') !== null) {
    console.log("Click on a link element, not collecting text");
    return;
  }

  // Find the nearest ancestor that is a text-containing element
  while (target && !textTags.includes(target.tagName)) {
    target = target.parentElement;
  }

  if (target && !isWithinExtensionUI(target)) {
    console.log("Click event captured on text-containing element");
    selectElementText(target);
  }
}, true);

document.addEventListener('contextmenu', (event) => {
  console.log("Right-click event captured");
  // Don't prevent default, allow context menu to appear
}, true);

function handleSummarizeSelection() {
  let selectedText = window.getSelection().toString();
  if (!selectedText && currentElement) {
    selectedText = currentElement.textContent.trim();
  }
  if (selectedText) {
    console.log("Selected text:", selectedText);
    sendMessageToParent({ action: "summarize", text: selectedText });
  } else {
    console.log("No text selected and no element highlighted");
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
  console.log("Selecting element:", element);
  if (currentElement) {
    console.log("Removing selection from previous element");
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
  console.log("Text content of selected element:", text);
}

function selectElementText(element) {
  if (isWithinExtensionUI(element)) {
    return;  // Don't select text from our extension's UI
  }

  const textTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'DIV', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'PRE', 'CODE'];
  
  function collectTextFromElement(elem, depth = 0) {
    if (elem.nodeType === Node.TEXT_NODE) {
      return elem.textContent.trim();
    }
    
    if (elem.nodeType === Node.ELEMENT_NODE) {
      // Check if element is visible
      if (window.getComputedStyle(elem).display === 'none') {
        return '';
      }

      let text = '';
      
      // Handle images
      if (elem.tagName === 'IMG') {
        try {
          // Create a canvas to convert image to base64
          const canvas = document.createElement('canvas');
          canvas.width = elem.naturalWidth;
          canvas.height = elem.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(elem, 0, 0);
          const base64 = canvas.toDataURL('image/png');
          return `\n[IMAGE:${base64}]\n`;
        } catch (e) {
          console.error('Failed to convert image to base64:', e);
          return `\n[IMAGE:${elem.src}]\n`;
        }
      }

      // Rest of the existing function...
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

      // Collect text from child nodes
      for (let child of elem.childNodes) {
        text += collectTextFromElement(child, depth + 1);
      }

      if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'DIV', 'BLOCKQUOTE', 'PRE'].includes(elem.tagName)) {
        text += '\n';
      }

      return text;
    }
    
    return '';
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

  // Collect the text content
  let collectedText = collectTextFromElement(element);

  // Trim blank lines and reduce multiple consecutive blank lines to a single one
  collectedText = collectedText
    .split('\n')
    .map(line => line.trim())
    .filter((line, index, array) => line !== '' || (line === '' && array[index - 1] !== ''))
    .join('\n')
    .trim();

  if (collectedText && collectedText.length >= 14) {
    // Create a range for the collected text
    const range = document.createRange();
    range.selectNodeContents(element);
    
    // Select the range
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // After selecting the text, add it to the collection
    addToCollection(collectedText, element);
  } else if (collectedText && collectedText.length < 14) {
    console.log("Text not collected: less than 14 characters long");
  }
}

function addToCollection(text, element) {
  if (text && text.length >= 14 && !isWithinExtensionUI(element)) {
    const url = window.location.href;
    const domain = window.location.hostname;
    const position = getElementPosition(element);
    chrome.runtime.sendMessage({
      action: "addText", 
      data: {
        text: text,
        url: url,
        domain: domain,  // Add domain
        position: position
      }
    });
  } else if (text && text.length < 14) {
    console.log("Text not collected: less than 14 characters long");
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
  if (window.top !== window.self) return; // Don't update tool window in iframes

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

    // Scroll to the last added element
    setTimeout(() => {
      listContainer.scrollTop = listContainer.scrollHeight; // Scroll to the bottom
    }, 0);
  } else {
    listContainer.innerHTML = '<li style="padding: 10px !important;">No items collected yet.</li>';
  }
}

function createToolWindow() {
  if (window.top !== window.self) return null;

  const toolWindow = document.createElement('div');
  toolWindow.id = 'summator-tool-window';
  toolWindow.innerHTML = `
    <h3>Collector</h3>
    <ul class="summator-list-container"></ul>
    <div class="summator-button-container">
      <button id="summator-summarize-btn" class="summator-btn">Summarize</button>
      <button id="summator-show-all-btn" class="summator-btn">Show All</button>
      <button id="summator-clear-btn" class="summator-btn">Clear All</button>
    </div>
  `;
  
  // Add event listeners for buttons
  toolWindow.querySelector('#summator-show-all-btn').addEventListener('click', showAllCollectedText);
  toolWindow.querySelector('#summator-summarize-btn').addEventListener('click', summarizeCollectedText);
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
      console.log("No text collected for summarization");
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
  chrome.runtime.sendMessage({
    action: "removeText", 
    index: index
  }, function(response) {
    // Don't check for success property
    chrome.runtime.sendMessage({
      action: "getTexts",
      url: window.location.href
    }, function(response) {
      if (window.top === window.self && response && response.items) {
        updateToolWindow(response.items);
      }
    });
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

console.log("Content script loaded");

function isWithinExtensionUI(element) {
  return element.closest('#summator-tool-window') !== null || 
         element.closest('.summator-modal') !== null;
}

function showFullTextModal(text) {
  const modal = document.createElement('div');
  modal.className = 'summator-modal';
  
  // Convert text with image tags to HTML
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
        <span class="summator-close-btn">×</span>
      </div>
      <div class="summator-full-text">${formattedContent}</div>
    </div>
  `;

  // Prevent background scroll when modal is open
  document.body.style.overflow = 'hidden';

  document.body.appendChild(modal);

  // Prevent scroll propagation
  modal.querySelector('.summator-full-text').addEventListener('wheel', (e) => {
    e.stopPropagation();
  });

  const closeBtn = modal.querySelector('.summator-close-btn');
  closeBtn.onclick = () => {
    document.body.style.overflow = ''; // Restore scrolling
    document.body.removeChild(modal);
  };

  modal.onclick = (event) => {
    if (event.target === modal) {
      document.body.style.overflow = ''; // Restore scrolling
      document.body.removeChild(modal);
    }
  };
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
