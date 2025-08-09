// Content script for Sidekick AI Chrome Extension

// State management
let selectedText = '';
let actionPalette = null;
let resultPanel = null;
let selectionRect = null;
let currentActions = [];
let isLoadingActions = false;
let clickedElement = null;
let contextMode = 'text'; // 'text' or 'element'

// Initialize content script
(function() {
  console.log('Sidekick AI Content Script loaded');
  
  // Listen for text selection
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('selectionchange', handleSelectionChange);
  
  // Listen for context clicks (Alt+Click or Cmd+Click)
  document.addEventListener('click', handleContextClick);
  
  // Listen for clicks outside palette to close it
  document.addEventListener('click', handleClickOutside);
  
  // Clean up on page unload
  window.addEventListener('beforeunload', cleanup);
})();

// Handle context click for element analysis
function handleContextClick(event) {
  // Check if Alt key (Windows/Linux) or Cmd key (Mac) is pressed
  if (event.altKey || event.metaKey) {
    event.preventDefault();
    event.stopPropagation();
    
    // Ignore if clicking on our own elements
    if (event.target.closest('[data-sidekick]')) {
      return;
    }
    
    // Clear any text selection
    window.getSelection().removeAllRanges();
    selectedText = '';
    
    // Store clicked element
    clickedElement = event.target;
    contextMode = 'element';
    
    // Get element bounds for positioning
    const rect = clickedElement.getBoundingClientRect();
    selectionRect = rect;
    
    // Show context-specific palette
    showElementPalette(clickedElement);
  }
}

// Handle text selection
function handleTextSelection(event) {
  // Ignore if clicking on our own elements
  if (event.target.closest('[data-sidekick]')) {
    return;
  }
  
  // Ignore if Alt/Cmd is pressed (context click mode)
  if (event.altKey || event.metaKey) {
    return;
  }
  
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  if (text.length > 0 && text !== selectedText) {
    selectedText = text;
    contextMode = 'text';
    clickedElement = null;
    
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
  
  if (text.length === 0 && !isLoadingActions && contextMode === 'text') {
    selectedText = '';
    hideActionPalette();
  }
}

// Show element-specific palette
async function showElementPalette(element) {
  // Set loading flag
  isLoadingActions = true;
  
  // Show loading state while fetching actions
  showLoadingPalette();
  
  // Gather element context
  const elementContext = gatherElementContext(element);
  
  // Set a timeout to prevent infinite loading
  const timeoutId = setTimeout(() => {
    isLoadingActions = false;
    hideActionPalette();
    showNotification('Analysis timed out. Please try again.');
  }, 10000); // 10 second timeout
  
  // Request contextual actions from background script
  chrome.runtime.sendMessage({
    type: 'GET_ELEMENT_ACTIONS',
    context: elementContext,
    element: {
      tagName: element.tagName,
      className: element.className,
      id: element.id,
      innerText: element.innerText?.substring(0, 200),
      innerHTML: element.innerHTML?.substring(0, 200),
      attributes: Array.from(element.attributes).map(attr => ({
        name: attr.name,
        value: attr.value.substring(0, 100) // Limit attribute values
      }))
    }
  }, (response) => {
    clearTimeout(timeoutId);
    isLoadingActions = false;
    
    // Check for Chrome runtime errors
    if (chrome.runtime.lastError) {
      console.error('Chrome runtime error:', chrome.runtime.lastError);
      hideActionPalette();
      showNotification('Extension error. Please reload the page.');
      return;
    }
    
    if (response && response.actions) {
      currentActions = response.actions;
      createActionPalette(response.actions);
      positionPalette();
    } else {
      // If no response or error, hide the palette
      hideActionPalette();
      showNotification('Unable to analyze element. Please try selecting text instead.');
    }
  });
}

// Gather context about the clicked element
function gatherElementContext(element) {
  const context = {
    url: window.location.href,
    title: document.title,
    domain: window.location.hostname,
    elementType: element.tagName.toLowerCase(),
    elementClasses: element.className,
    elementId: element.id,
    parentContext: getParentContext(element),
    dataAttributes: getDataAttributes(element),
    nearbyText: getNearbyText(element),
    elementRole: element.getAttribute('role') || element.getAttribute('aria-label'),
    isInteractive: isInteractiveElement(element),
    hasChart: hasChartIndicators(element),
    hasTable: element.closest('table') !== null,
    hasNumbers: /\d+/.test(element.innerText || ''),
    elementPath: getElementPath(element)
  };
  
  // Special context for specific domains
  if (context.domain.includes('tradingview') || context.domain.includes('binance') || 
      context.domain.includes('coinbase') || context.domain.includes('robinhood')) {
    context.isTradingPlatform = true;
    context.tradingContext = analyzeTradingContext(element);
  }
  
  return context;
}

// Get parent context
function getParentContext(element) {
  const parents = [];
  let current = element.parentElement;
  let depth = 0;
  
  while (current && depth < 3) {
    parents.push({
      tag: current.tagName.toLowerCase(),
      className: current.className,
      id: current.id
    });
    current = current.parentElement;
    depth++;
  }
  
  return parents;
}

// Get data attributes
function getDataAttributes(element) {
  const dataAttrs = {};
  Array.from(element.attributes).forEach(attr => {
    if (attr.name.startsWith('data-')) {
      dataAttrs[attr.name] = attr.value;
    }
  });
  return dataAttrs;
}

// Get nearby text for context
function getNearbyText(element) {
  const texts = [];
  
  // Get previous sibling text
  if (element.previousElementSibling) {
    texts.push(element.previousElementSibling.innerText?.substring(0, 50));
  }
  
  // Get next sibling text
  if (element.nextElementSibling) {
    texts.push(element.nextElementSibling.innerText?.substring(0, 50));
  }
  
  // Get parent's text (excluding this element)
  if (element.parentElement) {
    try {
      const parentClone = element.parentElement.cloneNode(true);
      
      // Try to find and remove the cloned element
      let elementClone = null;
      
      // First try by ID if it exists and is valid
      if (element.id && /^[a-zA-Z][\w-]*$/.test(element.id)) {
        try {
          elementClone = parentClone.querySelector(`#${CSS.escape(element.id)}`);
        } catch (e) {
          // ID selector failed, continue
        }
      }
      
      // If not found by ID, try by class
      if (!elementClone && element.className) {
        const classes = element.className.split(' ').filter(cls => cls.trim());
        if (classes.length > 0) {
          try {
            const selector = '.' + classes.map(cls => CSS.escape(cls)).join('.');
            elementClone = parentClone.querySelector(selector);
          } catch (e) {
            // Class selector failed, continue
          }
        }
      }
      
      // If found, remove it
      if (elementClone) {
        elementClone.remove();
      }
      
      texts.push(parentClone.innerText?.substring(0, 100));
    } catch (e) {
      // If anything fails, just skip parent text
      console.warn('Failed to get parent text:', e);
    }
  }
  
  return texts.filter(Boolean).join(' | ');
}

// Check if element is interactive
function isInteractiveElement(element) {
  const interactiveTags = ['button', 'a', 'input', 'select', 'textarea'];
  return interactiveTags.includes(element.tagName.toLowerCase()) ||
         element.onclick !== null ||
         element.getAttribute('role') === 'button' ||
         element.style.cursor === 'pointer';
}

// Check for chart indicators
function hasChartIndicators(element) {
  const chartClasses = ['chart', 'graph', 'plot', 'canvas', 'svg', 'highcharts', 'tradingview'];
  const hasChartClass = chartClasses.some(cls => 
    element.className.toLowerCase().includes(cls) ||
    element.id.toLowerCase().includes(cls)
  );
  
  const hasCanvas = element.tagName === 'CANVAS' || element.querySelector('canvas');
  const hasSvg = element.tagName === 'SVG' || element.querySelector('svg');
  
  return hasChartClass || hasCanvas || hasSvg;
}

// Analyze trading platform context
function analyzeTradingContext(element) {
  const context = {
    isOrderBook: element.innerText?.includes('Bid') && element.innerText?.includes('Ask'),
    isChart: hasChartIndicators(element),
    isPriceElement: /\$?\d+\.\d+/.test(element.innerText || ''),
    isVolumeElement: element.innerText?.toLowerCase().includes('volume'),
    isCandlestick: element.className.includes('candle') || element.getAttribute('data-candle'),
    isIndicator: element.className.includes('indicator') || element.innerText?.includes('RSI') || 
                 element.innerText?.includes('MACD') || element.innerText?.includes('MA')
  };
  
  return context;
}

// Get element path for better context
function getElementPath(element) {
  const path = [];
  let current = element;
  let depth = 0;
  
  while (current && current.tagName && depth < 5) {
    let selector = current.tagName.toLowerCase();
    
    // Add ID if it exists and is simple
    if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
      selector += `#${current.id}`;
    } else if (current.className && typeof current.className === 'string') {
      // Add first valid class
      const classes = current.className.split(' ').filter(cls => cls.trim() && /^[a-zA-Z][\w-]*$/.test(cls));
      if (classes.length > 0) {
        selector += `.${classes[0]}`;
      }
    }
    
    path.unshift(selector);
    current = current.parentElement;
    depth++;
  }
  
  return path.join(' > ');
}

// Show the action palette
async function showActionPalette() {
  // Set loading flag
  isLoadingActions = true;
  
  // Show loading state while fetching actions
  showLoadingPalette();
  
  // Get context information
  const context = {
    url: window.location.href,
    title: document.title,
    domain: window.location.hostname
  };
  
  // Set a timeout to prevent infinite loading
  const timeoutId = setTimeout(() => {
    isLoadingActions = false;
    hideActionPalette();
    showNotification('Analysis timed out. Please try again.');
  }, 10000); // 10 second timeout
  
  // Request contextual actions from background script
  chrome.runtime.sendMessage({
    type: 'GET_ACTIONS',
    context: context,
    selectedText: selectedText
  }, (response) => {
    clearTimeout(timeoutId);
    isLoadingActions = false;
    
    // Check for Chrome runtime errors
    if (chrome.runtime.lastError) {
      console.error('Chrome runtime error:', chrome.runtime.lastError);
      hideActionPalette();
      showNotification('Extension error. Please reload the page.');
      return;
    }
    
    if (response && response.actions) {
      currentActions = response.actions;
      createActionPalette(response.actions);
      positionPalette();
    } else {
      // If no response or error, hide the palette
      hideActionPalette();
      showNotification('Unable to analyze text. Please check your API key in settings.');
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
  
  // Add context indicator for element mode
  if (contextMode === 'element') {
    const indicator = document.createElement('div');
    indicator.className = 'sidekick-context-indicator';
    indicator.innerHTML = '🎯 Element Actions';
    actionPalette.appendChild(indicator);
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

// Position the palette near the selected text or element
function positionPalette() {
  if (!actionPalette || !selectionRect) return;
  
  const paletteHeight = 60; // Approximate height (increased for element mode)
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
  if (!selectedText && contextMode === 'text') return;
  if (!clickedElement && contextMode === 'element') return;
  
  // Show loading state
  showLoadingState();
  
  // Get context based on mode
  const context = contextMode === 'element' ? 
    gatherElementContext(clickedElement) : 
    {
      url: window.location.href,
      title: document.title,
      domain: window.location.hostname
    };
  
  // Prepare content to analyze
  const content = contextMode === 'element' ? 
    {
      type: 'element',
      html: clickedElement.outerHTML.substring(0, 2000),
      text: clickedElement.innerText || '',
      context: context
    } : 
    selectedText;
  
  // Send request to background script
  chrome.runtime.sendMessage({
    type: 'EXECUTE_ACTION',
    action: action,
    text: contextMode === 'element' ? JSON.stringify(content) : selectedText,
    context: context,
    mode: contextMode
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
  
  // Reset context
  clickedElement = null;
  contextMode = 'text';
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
  
  // Don't hide if Alt/Cmd is pressed (might be starting a new context click)
  if (event.altKey || event.metaKey) {
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