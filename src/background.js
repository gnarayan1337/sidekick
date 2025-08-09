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
});

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.sync.get(['apiKey', 'actionStats']);
  apiKey = result.apiKey || '';
  actionUsageStats = result.actionStats || {};
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_ACTIONS') {
    // Get contextual actions based on the selected text
    analyzeAndGenerateActions(request.selectedText, request.context)
      .then(actions => sendResponse({ actions }))
      .catch(error => {
        console.error('Error generating actions:', error);
        sendResponse({ actions: getFallbackActions() });
      });
    return true; // Will respond asynchronously
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

// Analyze text and generate contextual actions
async function analyzeAndGenerateActions(selectedText, context) {
  if (!apiKey) {
    return getFallbackActions();
  }

  try {
    // Use Claude to analyze the text and suggest relevant actions
    const response = await fetch(CLAUDE_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: `Analyze this text and suggest exactly 4 contextual actions that would be most useful. 
            
Context:
- Current URL: ${context.url}
- Page title: ${context.title}
- Selected text: "${selectedText.substring(0, 500)}${selectedText.length > 500 ? '...' : ''}"

Return a JSON array with exactly 4 actions. Each action should have:
- id: a unique identifier (snake_case)
- label: short action label (max 3-4 words)
- icon: a single emoji that represents the action
- description: what the action will do (one sentence)

Guidelines:
- If it's code: suggest code-related actions (explain, refactor, debug, convert)
- If it's an email/message: suggest communication actions (reply, summarize, tone change)
- If it's an article/paragraph: suggest content actions (summarize, key points, translate)
- If it's a data/numbers: suggest analysis actions (visualize, calculate, format)
- If it's a list: suggest organization actions (categorize, prioritize, expand)
- Be specific to the actual content, not generic
- Actions should be immediately useful for this specific text

Example response format:
[
  {"id": "explain_algorithm", "label": "Explain Algorithm", "icon": "🧮", "description": "Break down how this sorting algorithm works"},
  {"id": "add_comments", "label": "Add Comments", "icon": "💬", "description": "Add inline comments explaining each section"},
  {"id": "find_bugs", "label": "Find Bugs", "icon": "🐛", "description": "Identify potential issues or edge cases"},
  {"id": "optimize_performance", "label": "Optimize Code", "icon": "⚡", "description": "Suggest performance improvements"}
]

Respond with ONLY the JSON array, no other text.`
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content[0].text;
    
    try {
      const actions = JSON.parse(content);
      // Validate and ensure we have exactly 4 actions
      if (Array.isArray(actions) && actions.length === 4) {
        return actions;
      }
    } catch (parseError) {
      console.error('Failed to parse actions:', parseError);
    }
  } catch (error) {
    console.error('Error calling Claude API for actions:', error);
  }

  // If anything fails, return context-based fallback actions
  return getSmartFallbackActions(selectedText, context);
}

// Get smart fallback actions based on simple heuristics
function getSmartFallbackActions(selectedText, context) {
  const text = selectedText.toLowerCase();
  const url = context.url.toLowerCase();
  
  // Detect code patterns
  const codePatterns = /\b(function|class|const|let|var|if|for|while|import|export|return|def|public|private|void)\b|[{}\[\]();]|=>|==|&&|\|\|/;
  const isCode = codePatterns.test(selectedText);
  
  // Detect email patterns
  const emailPatterns = /\b(dear|hi|hello|regards|sincerely|best|thanks)\b|@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const isEmail = emailPatterns.test(text) || url.includes('mail') || url.includes('gmail');
  
  // Detect numeric/data patterns
  const hasNumbers = /\d+/.test(selectedText) && selectedText.split(/\s+/).filter(word => /^\d+$/.test(word)).length > 3;
  
  // Detect list patterns
  const isList = /^[\d\-\*•]\s|^\d+\.|^[a-z]\)|^[A-Z]\)/.test(selectedText.trim()) || selectedText.split('\n').length > 3;
  
  // Word count for long text detection
  const wordCount = selectedText.split(/\s+/).filter(word => word.length > 0).length;
  const isLongText = wordCount > 50;
  
  if (isCode) {
    return [
      { id: 'explain_code', label: 'Explain Code', icon: '📖', description: 'Explain what this code does in simple terms' },
      { id: 'find_issues', label: 'Find Issues', icon: '🔍', description: 'Identify bugs or potential problems' },
      { id: 'add_comments', label: 'Add Comments', icon: '💬', description: 'Add helpful inline comments' },
      { id: 'refactor', label: 'Refactor', icon: '♻️', description: 'Improve code structure and readability' }
    ];
  }
  
  if (isEmail) {
    return [
      { id: 'draft_reply', label: 'Draft Reply', icon: '📧', description: 'Generate a professional reply' },
      { id: 'summarize', label: 'Summarize', icon: '📝', description: 'Get the key points quickly' },
      { id: 'change_tone', label: 'Change Tone', icon: '🎭', description: 'Make more formal or casual' },
      { id: 'action_items', label: 'Action Items', icon: '✅', description: 'Extract tasks and next steps' }
    ];
  }
  
  if (hasNumbers) {
    return [
      { id: 'analyze_data', label: 'Analyze Data', icon: '📊', description: 'Find patterns and insights' },
      { id: 'create_table', label: 'Format Table', icon: '📋', description: 'Organize data into a clean table' },
      { id: 'calculate', label: 'Calculate', icon: '🧮', description: 'Perform calculations on the numbers' },
      { id: 'visualize', label: 'Visualize', icon: '📈', description: 'Suggest chart types for this data' }
    ];
  }
  
  if (isList) {
    return [
      { id: 'organize', label: 'Organize', icon: '📂', description: 'Group and categorize items' },
      { id: 'prioritize', label: 'Prioritize', icon: '🎯', description: 'Rank items by importance' },
      { id: 'expand', label: 'Expand Items', icon: '🔍', description: 'Add details to each item' },
      { id: 'convert_tasks', label: 'Make Tasks', icon: '☑️', description: 'Convert to actionable tasks' }
    ];
  }
  
  if (isLongText) {
    return [
      { id: 'summarize', label: 'Summarize', icon: '📄', description: 'Get the main points quickly' },
      { id: 'key_points', label: 'Key Points', icon: '🎯', description: 'Extract important information' },
      { id: 'simplify', label: 'Simplify', icon: '✂️', description: 'Make it easier to understand' },
      { id: 'questions', label: 'Questions', icon: '❓', description: 'Generate questions about this content' }
    ];
  }
  
  // Default actions for general text
  return [
    { id: 'summarize', label: 'Summarize', icon: '📝', description: 'Create a brief summary' },
    { id: 'improve', label: 'Improve', icon: '✨', description: 'Enhance clarity and impact' },
    { id: 'translate', label: 'Translate', icon: '🌐', description: 'Translate to another language' },
    { id: 'explain', label: 'Explain', icon: '💡', description: 'Explain in simple terms' }
  ];
}

// Get basic fallback actions
function getFallbackActions() {
  return [
    { id: 'summarize', label: 'Summarize', icon: '📝', description: 'Create a brief summary' },
    { id: 'explain', label: 'Explain', icon: '💡', description: 'Explain this content' },
    { id: 'improve', label: 'Improve', icon: '✨', description: 'Enhance this text' },
    { id: 'key_points', label: 'Key Points', icon: '🎯', description: 'Extract main points' }
  ];
}

// Execute the selected action
async function executeAction(action, text, context) {
  if (!apiKey) {
    throw new Error('API key not configured. Please set it in the extension options.');
  }
  
  // Update usage stats
  updateActionStats(action.id);
  
  // Generate prompt based on action
  const prompt = generateDynamicPrompt(action, text, context);
  
  try {
    const response = await fetch(CLAUDE_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
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

// Generate dynamic prompt based on the action
function generateDynamicPrompt(action, text, context) {
  const contextInfo = `Context: This text was selected from ${context.domain} (${context.title}).\n\n`;
  
  return `${action.description}. Be concise and practical.\n\n${contextInfo}Text:\n${text}`;
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