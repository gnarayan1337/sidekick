// Content script for Sidekick AI Chrome Extension

// State management
let selectedText = '';
let actionPalette = null;
let resultPanel = null;
let selectionRect = null;
let currentActions = [];
let isLoadingActions = false;
let clickAnalysisMode = false;
let lastClickTarget = null;

// Initialize content script
(function() {
  console.log('Sidekick AI Content Script loaded');
  
  // Listen for text selection
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('selectionchange', handleSelectionChange);
  
  // Listen for alt+click to analyze elements
  document.addEventListener('click', handleElementClick);
  
  // Listen for clicks outside palette to close it
  document.addEventListener('click', handleClickOutside);
  
  // Clean up on page unload
  window.addEventListener('beforeunload', cleanup);
})();

// Handle element click for analysis
function handleElementClick(event) {
  // Check if Alt key is pressed for element analysis
  if (event.altKey && !event.target.closest('[data-sidekick]')) {
    event.preventDefault();
    event.stopPropagation();
    
    // Clear any text selection
    window.getSelection().removeAllRanges();
    selectedText = '';
    
    // Set click analysis mode
    clickAnalysisMode = true;
    lastClickTarget = event.target;
    
    // Get element context
    const elementContext = extractElementContext(event.target);
    
    // Position based on click
    const clickRect = {
      top: event.pageY - window.scrollY - 10,
      bottom: event.pageY - window.scrollY + 10,
      left: event.pageX - window.scrollX - 10,
      right: event.pageX - window.scrollX + 10,
      width: 20,
      height: 20
    };
    selectionRect = clickRect;
    
    // Show palette for element
    showElementActionPalette(elementContext);
  }
}

// Extract context from clicked element
function extractElementContext(element) {
  const context = {
    tagName: element.tagName.toLowerCase(),
    className: element.className,
    id: element.id,
    text: element.textContent.substring(0, 200).trim(),
    attributes: {},
    parentContext: '',
    type: 'unknown'
  };
  
  // Get relevant attributes
  ['src', 'href', 'alt', 'title', 'data-type', 'role', 'aria-label'].forEach(attr => {
    if (element.hasAttribute(attr)) {
      context.attributes[attr] = element.getAttribute(attr);
    }
  });
  
  // Get parent context
  if (element.parentElement) {
    context.parentContext = element.parentElement.className || element.parentElement.tagName.toLowerCase();
  }
  
  // Detect element type
  if (element.tagName === 'IMG' || element.querySelector('img')) {
    context.type = 'image';
  } else if (element.tagName === 'VIDEO' || element.querySelector('video')) {
    context.type = 'video';
  } else if (element.tagName === 'TABLE' || element.closest('table')) {
    context.type = 'table';
  } else if (element.tagName === 'CANVAS') {
    context.type = 'canvas';
  } else if (element.closest('.chart, .graph, [class*="chart"], [class*="graph"]')) {
    context.type = 'chart';
  } else if (element.tagName === 'BUTTON' || element.tagName === 'A') {
    context.type = 'interactive';
  } else if (element.closest('form')) {
    context.type = 'form';
  } else if (/\d+[\.\,]\d+/.test(element.textContent)) {
    context.type = 'numeric';
  } else if (element.querySelector('ul, ol') || element.tagName === 'LI') {
    context.type = 'list';
  }
  
  return context;
}

// Show action palette for clicked element
async function showElementActionPalette(elementContext) {
  // Set loading flag
  isLoadingActions = true;
  
  // Show loading state while fetching actions
  showLoadingPalette();
  
  // Get page context
  const context = {
    url: window.location.href,
    title: document.title,
    domain: window.location.hostname,
    elementContext: elementContext
  };
  
  // Request contextual actions from background script
  chrome.runtime.sendMessage({
    type: 'GET_ACTIONS',
    context: context,
    selectedText: elementContext.text || `[${elementContext.type} element: ${elementContext.tagName}]`,
    isElementAnalysis: true
  }, (response) => {
    isLoadingActions = false;
    
    if (response && response.actions) {
      currentActions = response.actions;
      createActionPalette(response.actions);
      positionPalette();
    } else {
      // If no response or error, hide the palette
      hideActionPalette();
    }
  });
}

// Handle text selection
function handleTextSelection(event) {
  // Ignore if clicking on our own elements
  if (event.target.closest('[data-sidekick]')) {
    return;
  }
  
  // Ignore if Alt key is pressed (element analysis mode)
  if (event.altKey) {
    return;
  }
  
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  if (text.length > 0 && text !== selectedText) {
    selectedText = text;
    clickAnalysisMode = false;
    
    try {
      selectionRect = selection.getRangeAt(0).getBoundingClientRect();
    } catch (e) {
      // Selection might be invalid, ignore
      return;
    }
    
    // Small delay to ensure selection is complete
    setTimeout(() => {
      if (window.getSelection().toString().trim() === text) {
        showActionPalette();
      }
    }, 200);
  } else if (text.length === 0 && !isLoadingActions) {
    hideActionPalette();
  }
}

// Handle selection changes
function handleSelectionChange() {
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  if (text.length === 0 && !isLoadingActions && !clickAnalysisMode) {
    selectedText = '';
    hideActionPalette();
  }
}

// Show the action palette
async function showActionPalette() {
  // Set loading flag
  isLoadingActions = true;
  clickAnalysisMode = false;
  
  // Show loading state while fetching actions
  showLoadingPalette();
  
  // Get context information
  const context = {
    url: window.location.href,
    title: document.title,
    domain: window.location.hostname
  };
  
  // Request contextual actions from background script
  chrome.runtime.sendMessage({
    type: 'GET_ACTIONS',
    context: context,
    selectedText: selectedText,
    isElementAnalysis: false
  }, (response) => {
    isLoadingActions = false;
    
    if (response && response.actions) {
      currentActions = response.actions;
      createActionPalette(response.actions);
      positionPalette();
    } else {
      // If no response or error, hide the palette
      hideActionPalette();
    }
  });
}

// Show loading palette
function showLoadingPalette() {
  hideActionPalette();
  
  actionPalette = document.createElement('div');
  actionPalette.className = 'sidekick-action-palette sidekick-loading-state';
  actionPalette.setAttribute('data-sidekick', 'true');
  actionPalette.innerHTML = `
    <div class="sidekick-loading-spinner"></div>
    <span class="sidekick-loading-text">Analyzing...</span>
  `;
  
  document.body.appendChild(actionPalette);
  positionPalette();
  
  setTimeout(() => {
    if (actionPalette) {
      actionPalette.classList.add('sidekick-show');
    }
  }, 10);
}

// Create the action palette UI
function createActionPalette(actions) {
  // Store current position before removing old palette
  const currentTop = actionPalette ? actionPalette.style.top : null;
  const currentLeft = actionPalette ? actionPalette.style.left : null;
  
  // Remove existing palette if any
  if (actionPalette) {
    actionPalette.remove();
  }
  
  // Create palette container
  actionPalette = document.createElement('div');
  actionPalette.className = 'sidekick-action-palette';
  actionPalette.setAttribute('data-sidekick', 'true');
  
  // Add mode indicator for element analysis
  if (clickAnalysisMode) {
    const modeIndicator = document.createElement('div');
    modeIndicator.className = 'sidekick-mode-indicator';
    modeIndicator.innerHTML = '🎯 Element Analysis';
    actionPalette.appendChild(modeIndicator);
  }
  
  // Create action buttons
  actions.forEach(action => {
    const button = document.createElement('button');
    button.className = 'sidekick-action-button';
    button.setAttribute('data-action', action.id);
    button.setAttribute('data-sidekick', 'true');
    button.setAttribute('title', action.description); // Tooltip
    button.innerHTML = `
      <span class="sidekick-action-icon">${action.icon}</span>
      <span class="sidekick-action-label">${action.label}</span>
    `;
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      executeAction(action);
    });
    actionPalette.appendChild(button);
  });
  
  // Add to page
  document.body.appendChild(actionPalette);
  
  // Restore position if we had one
  if (currentTop && currentLeft) {
    actionPalette.style.top = currentTop;
    actionPalette.style.left = currentLeft;
    actionPalette.classList.add('sidekick-show');
  } else {
    positionPalette();
    setTimeout(() => {
      if (actionPalette) {
        actionPalette.classList.add('sidekick-show');
      }
    }, 10);
  }
}

// Position the palette near the selected text
function positionPalette() {
  if (!actionPalette || !selectionRect) return;
  
  const paletteHeight = clickAnalysisMode ? 70 : 50; // Extra height for mode indicator
  const paletteWidth = actionPalette.offsetWidth || 200; // Fallback width
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
}

// Execute selected action
function executeAction(action) {
  if (!selectedText && !clickAnalysisMode) return;
  
  // Show loading state
  showLoadingState();
  
  // Get context
  const context = {
    url: window.location.href,
    title: document.title,
    domain: window.location.hostname
  };
  
  // Add element context if in click analysis mode
  if (clickAnalysisMode && lastClickTarget) {
    context.elementContext = extractElementContext(lastClickTarget);
  }
  
  // Send request to background script
  chrome.runtime.sendMessage({
    type: 'EXECUTE_ACTION',
    action: action,
    text: selectedText || `Analyzing ${context.elementContext?.type || 'element'}: ${context.elementContext?.text || ''}`,
    context: context,
    isElementAnalysis: clickAnalysisMode
  }, (response) => {
    hideLoadingState();
    
    if (response && response.success) {
      showResultPanel(response.result, action);
    } else {
      showError(response ? response.error : 'No response from extension');
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
function showResultPanel(result, action) {
  // Hide action palette
  hideActionPalette();
  
  // Create result panel
  resultPanel = document.createElement('div');
  resultPanel.className = 'sidekick-result-panel';
  resultPanel.setAttribute('data-sidekick', 'true');
  
  // Add content
  resultPanel.innerHTML = `
    <div class="sidekick-result-header">
      <span class="sidekick-result-title">
        <span class="sidekick-result-icon">${action.icon}</span>
        ${action.label} Result
      </span>
      <button class="sidekick-result-close" aria-label="Close" data-sidekick="true">×</button>
    </div>
    <div class="sidekick-result-content">${formatResult(result)}</div>
    <div class="sidekick-result-actions">
      <button class="sidekick-result-copy" data-sidekick="true">Copy to Clipboard</button>
      <button class="sidekick-result-insert" data-sidekick="true">Insert at Cursor</button>
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
    if (resultPanel) {
      resultPanel.classList.add('sidekick-show');
    }
  }, 10);
}

// Format result for display
function formatResult(result) {
  // Convert markdown-style formatting to HTML
  return result
    .replace(/\n/g, '<br>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
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
      if (actionPalette) {
        actionPalette.remove();
        actionPalette = null;
      }
    }, 300);
  }
  clickAnalysisMode = false;
  lastClickTarget = null;
}

// Hide result panel
function hideResultPanel() {
  if (resultPanel) {
    resultPanel.classList.remove('sidekick-show');
    setTimeout(() => {
      if (resultPanel) {
        resultPanel.remove();
        resultPanel = null;
      }
    }, 300);
  }
}

// Handle clicks outside palette
function handleClickOutside(event) {
  // Don't hide if we're loading actions
  if (isLoadingActions) {
    return;
  }
  
  // Don't hide if clicking on any sidekick element
  if (event.target.closest('[data-sidekick]')) {
    return;
  }
  
  // Don't hide if Alt key is pressed (starting new analysis)
  if (event.altKey) {
    return;
  }
  
  // Only hide if clicking outside both palette and result panel
  if (actionPalette && !actionPalette.contains(event.target)) {
    hideActionPalette();
  }
  
  if (resultPanel && !resultPanel.contains(event.target)) {
    hideResultPanel();
  }
}

// Cleanup function
function cleanup() {
  hideActionPalette();
  hideResultPanel();
} 