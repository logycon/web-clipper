document.getElementById('toggleCollector').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "toggleCollector"}, response => {
        console.log('Toggle message sent');
        // Close the popup after toggling
        window.close();
      });
    }
  });
});
