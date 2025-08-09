// Popup JavaScript for Sidekick AI

// Open options page
document.getElementById('optionsButton').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// Open help page
document.getElementById('helpButton').addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://github.com/your-username/sidekick-ai#readme'  // Update with your actual repo
  });
  window.close();
}); 