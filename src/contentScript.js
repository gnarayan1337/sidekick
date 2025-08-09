// Content script for Sidekick AI Chrome Extension

// State management
let selectedText = '';
let actionPalette = null;
let resultPanel = null;
let selectionRect = null;

// Initialize content script
(function() {
  console.log('Sidekick AI Content Script loaded');
  
  // Listen for text selection
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('selectionchange', handleSelectionChange);
  
  // Listen for clicks outside palette to close it
  document.addEventListener('click', handleClickOutside);
  
  // Clean up on page unload
  window.addEventListener('beforeunload', cleanup);
})();

// Handle text selection
function handleTextSelection(event) {
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  if (text.length > 0 && text !== selectedText) {
    selectedText = text;
    selectionRect = selection.getRangeAt(0).getBoundingClientRect();
    
    // Small delay to ensure selection is complete
    setTimeout(() => {
      if (window.getSelection().toString().trim() === text) {
        showActionPalette();
      }
    }, 200);
  } else if (text.length === 0) {
    hideActionPalette();
  }
}

// Handle selection changes
function handleSelectionChange() {
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  if (text.length === 0) {
    selectedText = '';
    hideActionPalette();
  }
}

// Show the action palette
async function showActionPalette() {
  // Get context information
  const context = {
    url: window.location.href,
    title: document.title,
    domain: window.location.hostname
  };
  
  // Request prioritized actions from background script
  chrome.runtime.sendMessage({
    type: 'GET_ACTIONS',
    context: context,
    selectedText: selectedText
  }, (response) => {
    if (response && response.actions) {
      createActionPalette(response.actions);
      positionPalette();
    }
  });
}

// Create the action palette UI
function createActionPalette(actions) {
  // Remove existing palette if any
  hideActionPalette();
  
  // Create palette container
  actionPalette = document.createElement('div');
  actionPalette.className = 'sidekick-action-palette';
  actionPalette.setAttribute('data-sidekick', 'true');
  
  // Create action buttons
  actions.forEach(action => {
    const button = document.createElement('button');
    button.className = 'sidekick-action-button';
    button.setAttribute('data-action', action.id);
    button.innerHTML = `
      <span class="sidekick-action-icon">${action.icon}</span>
      <span class="sidekick-action-label">${action.label}</span>
    `;
    button.addEventListener('click', () => executeAction(action.id));
    actionPalette.appendChild(button);
  });
  
  // Add to page
  document.body.appendChild(actionPalette);
}

// Position the palette near the selected text
function positionPalette() {
  if (!actionPalette || !selectionRect) return;
  
  const paletteHeight = 50; // Approximate height
  const paletteWidth = actionPalette.offsetWidth;
  const padding = 10;
  
  // Calculate position
  let top = selectionRect.top + window.scrollY - paletteHeight - padding;
  let left = selectionRect.left + window.scrollX + (selectionRect.width / 2) - (paletteWidth / 2);
  
  // Adjust if palette would be off-screen
  if (top < window.scrollY) {
    top = selectionRect.bottom + window.scrollY + padding;
  }
  
  if (left < 0) {
    left = padding;
  } else if (left + paletteWidth > window.innerWidth) {
    left = window.innerWidth - paletteWidth - padding;
  }
  
  // Apply position
  actionPalette.style.top = `${top}px`;
  actionPalette.style.left = `${left}px`;
  
  // Add show animation
  setTimeout(() => {
    actionPalette.classList.add('sidekick-show');
  }, 10);
}

// Execute selected action
function executeAction(actionId) {
  if (!selectedText) return;
  
  // Show loading state
  showLoadingState();
  
  // Get context
  const context = {
    url: window.location.href,
    title: document.title,
    domain: window.location.hostname
  };
  
  // Send request to background script
  chrome.runtime.sendMessage({
    type: 'EXECUTE_ACTION',
    action: actionId,
    text: selectedText,
    context: context
  }, (response) => {
    hideLoadingState();
    
    if (response.success) {
      showResultPanel(response.result);
    } else {
      showError(response.error);
    }
  });
}

// Show loading state
function showLoadingState() {
  if (actionPalette) {
    actionPalette.classList.add('sidekick-loading');
    const buttons = actionPalette.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = true);
  }
}

// Hide loading state
function hideLoadingState() {
  if (actionPalette) {
    actionPalette.classList.remove('sidekick-loading');
    const buttons = actionPalette.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = false);
  }
}

// Show result panel
function showResultPanel(result) {
  // Hide action palette
  hideActionPalette();
  
  // Create result panel
  resultPanel = document.createElement('div');
  resultPanel.className = 'sidekick-result-panel';
  resultPanel.setAttribute('data-sidekick', 'true');
  
  // Add content
  resultPanel.innerHTML = `
    <div class="sidekick-result-header">
      <span class="sidekick-result-title">Sidekick AI Result</span>
      <button class="sidekick-result-close" aria-label="Close">×</button>
    </div>
    <div class="sidekick-result-content">${formatResult(result)}</div>
    <div class="sidekick-result-actions">
      <button class="sidekick-result-copy">Copy to Clipboard</button>
      <button class="sidekick-result-insert">Insert at Cursor</button>
    </div>
  `;
  
  // Add event listeners
  resultPanel.querySelector('.sidekick-result-close').addEventListener('click', hideResultPanel);
  resultPanel.querySelector('.sidekick-result-copy').addEventListener('click', () => copyToClipboard(result));
  resultPanel.querySelector('.sidekick-result-insert').addEventListener('click', () => insertAtCursor(result));
  
  // Position and show
  document.body.appendChild(resultPanel);
  positionResultPanel();
  
  setTimeout(() => {
    resultPanel.classList.add('sidekick-show');
  }, 10);
}

// Format result for display
function formatResult(result) {
  // Convert markdown-style formatting to HTML
  return result
    .replace(/\n/g, '<br>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
}

// Position result panel
function positionResultPanel() {
  if (!resultPanel) return;
  
  const panelWidth = Math.min(600, window.innerWidth - 40);
  const panelHeight = resultPanel.offsetHeight;
  
  // Center horizontally, position vertically based on selection
  const left = (window.innerWidth - panelWidth) / 2;
  let top = selectionRect ? selectionRect.bottom + window.scrollY + 20 : window.scrollY + 100;
  
  // Adjust if panel would be off-screen
  if (top + panelHeight > window.scrollY + window.innerHeight) {
    top = window.scrollY + (window.innerHeight - panelHeight) / 2;
  }
  
  resultPanel.style.width = `${panelWidth}px`;
  resultPanel.style.left = `${left}px`;
  resultPanel.style.top = `${top}px`;
}

// Copy to clipboard
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showNotification('Copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showNotification('Failed to copy to clipboard');
  });
}

// Insert at cursor position
function insertAtCursor(text) {
  // Find active editable element
  const activeElement = document.activeElement;
  
  if (activeElement && (activeElement.tagName === 'TEXTAREA' || 
      (activeElement.tagName === 'INPUT' && activeElement.type === 'text') ||
      activeElement.contentEditable === 'true')) {
    
    if (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT') {
      const start = activeElement.selectionStart;
      const end = activeElement.selectionEnd;
      const value = activeElement.value;
      activeElement.value = value.substring(0, start) + text + value.substring(end);
      activeElement.selectionStart = activeElement.selectionEnd = start + text.length;
    } else {
      // ContentEditable
      document.execCommand('insertText', false, text);
    }
    
    showNotification('Text inserted!');
    hideResultPanel();
  } else {
    showNotification('Please click in a text field first');
  }
}

// Show notification
function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'sidekick-notification';
  notification.textContent = message;
  notification.setAttribute('data-sidekick', 'true');
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('sidekick-show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('sidekick-show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 2000);
}

// Show error message
function showError(error) {
  showNotification(`Error: ${error}`);
  hideActionPalette();
}

// Hide action palette
function hideActionPalette() {
  if (actionPalette) {
    actionPalette.classList.remove('sidekick-show');
    setTimeout(() => {
      actionPalette.remove();
      actionPalette = null;
    }, 300);
  }
}

// Hide result panel
function hideResultPanel() {
  if (resultPanel) {
    resultPanel.classList.remove('sidekick-show');
    setTimeout(() => {
      resultPanel.remove();
      resultPanel = null;
    }, 300);
  }
}

// Handle clicks outside palette
function handleClickOutside(event) {
  if (actionPalette && !actionPalette.contains(event.target) && 
      !event.target.hasAttribute('data-sidekick')) {
    hideActionPalette();
  }
  
  if (resultPanel && !resultPanel.contains(event.target) && 
      !event.target.hasAttribute('data-sidekick')) {
    hideResultPanel();
  }
}

// Cleanup function
function cleanup() {
  hideActionPalette();
  hideResultPanel();
} 