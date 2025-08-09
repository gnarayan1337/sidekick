// Background service worker for Sidekick AI Chrome Extension

// Constants
const CLAUDE_API_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-3-haiku-20240307'; // Using a fast model for quick responses

// Store for user preferences and action usage
let actionUsageStats = {};
let apiKey = '';

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Sidekick AI Extension installed');
  loadSettings();
  initializeActionStats();
});

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.sync.get(['apiKey', 'actionStats']);
  apiKey = result.apiKey || '';
  actionUsageStats = result.actionStats || {};
}

// Initialize action statistics
function initializeActionStats() {
  const defaultActions = [
    'explain_code',
    'refactor_code',
    'add_docstrings',
    'make_concise',
    'professional_tone',
    'key_points',
    'quick_summary',
    'save_to_notion'
  ];
  
  defaultActions.forEach(action => {
    if (!actionUsageStats[action]) {
      actionUsageStats[action] = { clicks: 0, lastUsed: null };
    }
  });
  
  chrome.storage.sync.set({ actionStats: actionUsageStats });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_ACTIONS') {
    // Get prioritized actions based on context and usage
    const actions = getPrioritizedActions(request.context, request.selectedText);
    sendResponse({ actions });
  } else if (request.type === 'EXECUTE_ACTION') {
    // Execute the selected action
    executeAction(request.action, request.text, request.context)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
  } else if (request.type === 'UPDATE_STATS') {
    // Update action usage statistics
    updateActionStats(request.action);
    sendResponse({ success: true });
  }
});

// Get prioritized actions based on context and usage stats
function getPrioritizedActions(context, selectedText) {
  const actions = [];
  
  // Determine context type (developer, writer, universal)
  const isDeveloperContext = context.url.includes('github.com') || 
                           context.url.includes('stackoverflow.com') ||
                           context.url.includes('developer.mozilla.org') ||
                           /\b(function|class|const|let|var|if|for|while)\b/.test(selectedText);
  
  const isWriterContext = context.url.includes('gmail.com') ||
                         context.url.includes('docs.google.com') ||
                         context.url.includes('notion.so') ||
                         selectedText.split(' ').length > 20;
  
  // Developer actions
  if (isDeveloperContext) {
    actions.push(
      { id: 'explain_code', label: '📜 Explain this Code', icon: '📜' },
      { id: 'refactor_code', label: '♻️ Refactor for Readability', icon: '♻️' },
      { id: 'add_docstrings', label: '💬 Add Docstrings', icon: '💬' }
    );
  }
  
  // Writer actions
  if (isWriterContext) {
    actions.push(
      { id: 'make_concise', label: '✂️ Make Concise', icon: '✂️' },
      { id: 'professional_tone', label: '👔 Professional Tone', icon: '👔' },
      { id: 'key_points', label: '📝 Key Points', icon: '📝' }
    );
  }
  
  // Universal actions
  actions.push(
    { id: 'quick_summary', label: '🔍 Quick Summary', icon: '🔍' },
    { id: 'save_to_notion', label: '💾 Save to Notion', icon: '💾' }
  );
  
  // Sort by usage frequency
  actions.sort((a, b) => {
    const aStats = actionUsageStats[a.id] || { clicks: 0 };
    const bStats = actionUsageStats[b.id] || { clicks: 0 };
    return bStats.clicks - aStats.clicks;
  });
  
  // Return top 4 actions
  return actions.slice(0, 4);
}

// Execute the selected action
async function executeAction(actionId, text, context) {
  if (!apiKey) {
    throw new Error('API key not configured. Please set it in the extension options.');
  }
  
  // Update usage stats
  updateActionStats(actionId);
  
  // Generate prompt based on action
  const prompt = generatePrompt(actionId, text, context);
  
  try {
    const response = await fetch(CLAUDE_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'  // Required for browser-based requests
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Error calling Claude API:', error);
    throw error;
  }
}

// Generate appropriate prompt for each action
function generatePrompt(actionId, text, context) {
  const prompts = {
    explain_code: `Explain the following code in simple terms, focusing on what it does and how it works:\n\n${text}`,
    refactor_code: `Refactor the following code for better readability and maintainability. Keep the same functionality:\n\n${text}`,
    add_docstrings: `Add comprehensive docstrings/comments to the following code:\n\n${text}`,
    make_concise: `Rewrite the following text to be more concise while preserving the key message:\n\n${text}`,
    professional_tone: `Rewrite the following text in a professional, business-appropriate tone:\n\n${text}`,
    key_points: `Extract and list the key points from the following text as bullet points:\n\n${text}`,
    quick_summary: `Provide a brief summary of the following text in 2-3 sentences:\n\n${text}`,
    save_to_notion: `Format the following text for saving to Notion with appropriate headings and structure:\n\n${text}`
  };
  
  return prompts[actionId] || `Process the following text:\n\n${text}`;
}

// Update action usage statistics
function updateActionStats(actionId) {
  if (!actionUsageStats[actionId]) {
    actionUsageStats[actionId] = { clicks: 0, lastUsed: null };
  }
  
  actionUsageStats[actionId].clicks++;
  actionUsageStats[actionId].lastUsed = new Date().toISOString();
  
  // Save to storage
  chrome.storage.sync.set({ actionStats: actionUsageStats });
}

// Listen for storage changes (e.g., API key updates)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.apiKey) {
    apiKey = changes.apiKey.newValue;
  }
}); 