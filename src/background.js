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
    // Get contextual actions based on the selected text or element
    if (request.isElementAnalysis) {
      analyzeAndGenerateElementActions(request.selectedText, request.context)
        .then(actions => sendResponse({ actions }))
        .catch(error => {
          console.error('Error generating element actions:', error);
          sendResponse({ actions: getElementFallbackActions(request.context.elementContext) });
        });
    } else {
      analyzeAndGenerateActions(request.selectedText, request.context)
        .then(actions => sendResponse({ actions }))
        .catch(error => {
          console.error('Error generating actions:', error);
          sendResponse({ actions: getFallbackActions() });
        });
    }
    return true; // Will respond asynchronously
  } else if (request.type === 'EXECUTE_ACTION') {
    // Execute the selected action
    executeAction(request.action, request.text, request.context, request.isElementAnalysis)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
  } else if (request.type === 'UPDATE_STATS') {
    // Update action usage statistics
    updateActionStats(request.action);
    sendResponse({ success: true });
  }
});

// Analyze element and generate contextual actions
async function analyzeAndGenerateElementActions(elementDescription, context) {
  if (!apiKey) {
    return getElementFallbackActions(context.elementContext);
  }

  try {
    // Use Claude to analyze the element and suggest relevant actions
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
            content: `Analyze this clicked element and suggest exactly 4 contextual actions that would be most useful. 
            
Context:
- Current URL: ${context.url}
- Page title: ${context.title}
- Element type: ${context.elementContext.type}
- Element tag: ${context.elementContext.tagName}
- Element text/content: "${elementDescription}"
- Element attributes: ${JSON.stringify(context.elementContext.attributes)}

Return a JSON array with exactly 4 actions. Each action should have:
- id: a unique identifier (snake_case)
- label: short action label (max 3-4 words)
- icon: a single emoji that represents the action
- description: what the action will do (one sentence)

Guidelines:
- If it's an image: suggest analysis, extraction, editing, or search actions
- If it's a chart/graph: suggest data extraction, explanation, trend analysis
- If it's a table: suggest sorting, filtering, exporting, analysis
- If it's a button/link: suggest explanation, automation, or alternative actions
- If it's numeric data: suggest calculations, comparisons, visualizations
- If it's a form element: suggest validation, auto-fill, or extraction
- Be specific to the actual element and its context on this page

Example response format:
[
  {"id": "analyze_chart", "label": "Analyze Trends", "icon": "📈", "description": "Extract and explain the data trends in this chart"},
  {"id": "export_data", "label": "Export Data", "icon": "📊", "description": "Extract the underlying data into a table format"},
  {"id": "compare_periods", "label": "Compare Periods", "icon": "🔄", "description": "Compare different time periods in this visualization"},
  {"id": "explain_metrics", "label": "Explain Metrics", "icon": "💡", "description": "Explain what these metrics mean and their significance"}
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
      console.error('Failed to parse element actions:', parseError);
    }
  } catch (error) {
    console.error('Error calling Claude API for element actions:', error);
  }

  // If anything fails, return context-based fallback actions
  return getElementFallbackActions(context.elementContext);
}

// Get fallback actions for element analysis
function getElementFallbackActions(elementContext) {
  const elementType = elementContext?.type || 'unknown';
  
  switch (elementType) {
    case 'image':
      return [
        { id: 'describe_image', label: 'Describe Image', icon: '🖼️', description: 'Get a detailed description of this image' },
        { id: 'extract_text', label: 'Extract Text', icon: '📝', description: 'Extract any text from this image' },
        { id: 'find_similar', label: 'Find Similar', icon: '🔍', description: 'Search for similar images' },
        { id: 'analyze_content', label: 'Analyze Content', icon: '🔬', description: 'Analyze the image content and context' }
      ];
      
    case 'chart':
    case 'canvas':
      return [
        { id: 'explain_chart', label: 'Explain Chart', icon: '📊', description: 'Explain what this chart shows' },
        { id: 'extract_data', label: 'Extract Data', icon: '📋', description: 'Extract data points from this visualization' },
        { id: 'analyze_trends', label: 'Analyze Trends', icon: '📈', description: 'Identify trends and patterns' },
        { id: 'summarize_insights', label: 'Key Insights', icon: '💡', description: 'Get key insights from this data' }
      ];
      
    case 'table':
      return [
        { id: 'summarize_table', label: 'Summarize Data', icon: '📊', description: 'Get a summary of this table data' },
        { id: 'extract_csv', label: 'Export CSV', icon: '📄', description: 'Convert to CSV format' },
        { id: 'analyze_columns', label: 'Analyze Columns', icon: '🔍', description: 'Analyze relationships between columns' },
        { id: 'find_patterns', label: 'Find Patterns', icon: '🎯', description: 'Identify patterns in the data' }
      ];
      
    case 'numeric':
      return [
        { id: 'calculate', label: 'Calculate', icon: '🧮', description: 'Perform calculations with these numbers' },
        { id: 'convert_units', label: 'Convert Units', icon: '🔄', description: 'Convert to different units or formats' },
        { id: 'analyze_values', label: 'Analyze Values', icon: '📊', description: 'Statistical analysis of the numbers' },
        { id: 'compare', label: 'Compare', icon: '⚖️', description: 'Compare with benchmarks or averages' }
      ];
      
    case 'interactive':
      return [
        { id: 'explain_action', label: 'Explain Action', icon: '❓', description: 'What does this button/link do?' },
        { id: 'find_alternatives', label: 'Alternatives', icon: '🔄', description: 'Find alternative ways to do this' },
        { id: 'automate', label: 'Automate', icon: '🤖', description: 'Create automation for this action' },
        { id: 'analyze_behavior', label: 'Analyze', icon: '🔍', description: 'Analyze the element behavior' }
      ];
      
    case 'form':
      return [
        { id: 'explain_form', label: 'Explain Form', icon: '📝', description: 'Explain what this form does' },
        { id: 'validate_fields', label: 'Validate', icon: '✅', description: 'Check form field requirements' },
        { id: 'suggest_values', label: 'Suggest Values', icon: '💡', description: 'Suggest appropriate values' },
        { id: 'extract_structure', label: 'Extract Structure', icon: '🏗️', description: 'Extract form structure and fields' }
      ];
      
    default:
      return [
        { id: 'explain_element', label: 'Explain Element', icon: '💡', description: 'Explain what this element does' },
        { id: 'extract_info', label: 'Extract Info', icon: '📋', description: 'Extract information from this element' },
        { id: 'analyze_context', label: 'Analyze Context', icon: '🔍', description: 'Analyze element in page context' },
        { id: 'suggest_actions', label: 'Suggest Actions', icon: '🎯', description: 'Suggest what to do with this' }
      ];
  }
}

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
- If it's data/numbers: suggest analysis actions (visualize, calculate, format)
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
async function executeAction(action, text, context, isElementAnalysis = false) {
  if (!apiKey) {
    throw new Error('API key not configured. Please set it in the extension options.');
  }
  
  // Update usage stats
  updateActionStats(action.id);
  
  // Generate prompt based on action
  const prompt = isElementAnalysis 
    ? generateElementPrompt(action, text, context)
    : generateDynamicPrompt(action, text, context);
  
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

// Generate prompt for element analysis
function generateElementPrompt(action, elementDescription, context) {
  const elementInfo = context.elementContext ? `
Element Information:
- Type: ${context.elementContext.type}
- Tag: ${context.elementContext.tagName}
- Attributes: ${JSON.stringify(context.elementContext.attributes)}
- Parent context: ${context.elementContext.parentContext}
- Content: ${elementDescription}
` : '';

  const contextInfo = `Context: This element was clicked on ${context.domain} (${context.title}).${elementInfo}\n\n`;
  
  return `${action.description}. Be concise and practical. Focus on the specific element that was clicked.\n\n${contextInfo}`;
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