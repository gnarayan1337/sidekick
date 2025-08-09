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
  console.log('Settings loaded:', { hasApiKey: !!apiKey, statsCount: Object.keys(actionUsageStats).length });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.type);
  
  if (request.type === 'GET_ACTIONS') {
    // Analyze context and generate dynamic actions
    console.log('Getting actions for text:', request.selectedText.substring(0, 100));
    
    analyzeAndGenerateActions(request.context, request.selectedText)
      .then(actions => {
        console.log('Generated actions:', actions);
        sendResponse({ actions });
      })
      .catch(error => {
        console.error('Error generating actions:', error);
        const fallbackActions = getDefaultActions();
        console.log('Using fallback actions:', fallbackActions);
        sendResponse({ actions: fallbackActions });
      });
    return true; // Will respond asynchronously
  } else if (request.type === 'EXECUTE_ACTION') {
    // Execute the selected action
    console.log('Executing action:', request.action);
    
    executeAction(request.action, request.text, request.context)
      .then(result => {
        console.log('Action executed successfully');
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('Error executing action:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Will respond asynchronously
  } else if (request.type === 'UPDATE_STATS') {
    // Update action usage statistics
    updateActionStats(request.action);
    sendResponse({ success: true });
  }
});

// Analyze context and generate appropriate actions
async function analyzeAndGenerateActions(context, selectedText) {
  console.log('analyzeAndGenerateActions called, API key present:', !!apiKey);
  
  if (!apiKey) {
    console.log('No API key, returning default actions');
    return getSmartDefaultActions(selectedText, context);
  }

  try {
    // Use Claude to analyze the text and suggest appropriate actions
    const analysisPrompt = `Analyze this text and context to suggest 4 specific, actionable AI operations.

Selected text: "${selectedText.substring(0, 500)}${selectedText.length > 500 ? '...' : ''}"
Page URL: ${context.url}
Page title: ${context.title}

Based on the content, suggest exactly 4 actions that would be most useful. Each action should:
1. Be specific to the content type (code, email, article, data, etc.)
2. Provide clear value to the user
3. Be something AI can do well

Return ONLY a JSON array with exactly 4 objects, each with:
- id: unique identifier (snake_case)
- label: short action name (2-4 words)
- icon: single emoji that represents the action
- description: what the action will do (one sentence)

Examples of good actions:
- For code: "explain_algorithm", "add_error_handling", "convert_to_typescript"
- For emails: "make_friendly", "add_action_items", "create_reply"
- For articles: "extract_quotes", "create_outline", "generate_questions"
- For data: "create_chart_code", "find_patterns", "clean_format"

Respond with ONLY the JSON array, no other text.`;

    console.log('Sending request to Claude API...');
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
            content: analysisPrompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API request failed:', response.status, errorText);
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('Claude API response received');
    const responseText = data.content[0].text;
    
    // Parse the JSON response
    try {
      const actions = JSON.parse(responseText);
      console.log('Parsed actions from Claude:', actions);
      
      // Validate and ensure we have exactly 4 actions
      if (Array.isArray(actions) && actions.length === 4) {
        // Sort by previous usage if available
        return sortActionsByUsage(actions);
      } else {
        console.error('Invalid actions array:', actions);
        throw new Error('Invalid actions format');
      }
    } catch (parseError) {
      console.error('Failed to parse actions JSON:', parseError, 'Response text:', responseText);
      throw parseError;
    }
  } catch (error) {
    console.error('Error in analyzeAndGenerateActions:', error);
    // Fallback to intelligent defaults based on simple analysis
    return getSmartDefaultActions(selectedText, context);
  }
}

// Get smart default actions based on simple text analysis
function getSmartDefaultActions(text, context) {
  console.log('Getting smart default actions for text type');
  const actions = [];
  
  // Detect content type
  const isCode = /\b(function|class|const|let|var|if|for|while|import|export|return)\b/.test(text) ||
                 /[{}\[\];()=>]/.test(text) ||
                 context.url.includes('github.com') ||
                 context.url.includes('stackoverflow.com');
  
  const isEmail = context.url.includes('mail.google.com') ||
                  context.url.includes('outlook.com') ||
                  /^(dear|hi|hello|regards|sincerely)/i.test(text);
  
  const isList = /^[\d\-\*]\s|^\s*[\-\*]\s/m.test(text) ||
                 /\n\s*[\d\-\*]\s/m.test(text);
  
  const isLongText = text.split(/\s+/).length > 50;
  const hasNumbers = /\d+\.?\d*/.test(text);
  const isQuestion = /\?/.test(text);
  
  console.log('Content detection:', { isCode, isEmail, isList, isLongText, hasNumbers, isQuestion });
  
  // Generate contextual actions
  if (isCode) {
    actions.push(
      { id: 'explain_code', label: 'Explain Code', icon: '💡', description: 'Explain what this code does in simple terms' },
      { id: 'find_bugs', label: 'Find Bugs', icon: '🐛', description: 'Identify potential issues and suggest fixes' },
      { id: 'add_comments', label: 'Add Comments', icon: '💬', description: 'Add helpful inline comments' },
      { id: 'improve_code', label: 'Improve Code', icon: '✨', description: 'Suggest optimizations and best practices' }
    );
  } else if (isEmail) {
    actions.push(
      { id: 'make_professional', label: 'Professional Tone', icon: '👔', description: 'Rewrite in a professional business tone' },
      { id: 'make_friendly', label: 'Friendly Tone', icon: '😊', description: 'Make the tone warmer and more personal' },
      { id: 'create_reply', label: 'Draft Reply', icon: '↩️', description: 'Generate a thoughtful response' },
      { id: 'add_structure', label: 'Add Structure', icon: '📋', description: 'Organize with clear sections and action items' }
    );
  } else if (isList) {
    actions.push(
      { id: 'organize_list', label: 'Organize List', icon: '📊', description: 'Group and categorize items logically' },
      { id: 'expand_items', label: 'Expand Items', icon: '📝', description: 'Add details to each list item' },
      { id: 'create_table', label: 'Make Table', icon: '📈', description: 'Convert to a structured table format' },
      { id: 'prioritize', label: 'Prioritize', icon: '🎯', description: 'Rank items by importance or urgency' }
    );
  } else if (hasNumbers && !isLongText) {
    actions.push(
      { id: 'analyze_data', label: 'Analyze Data', icon: '📊', description: 'Find patterns and insights in the numbers' },
      { id: 'create_chart', label: 'Chart Code', icon: '📈', description: 'Generate code to visualize this data' },
      { id: 'calculate', label: 'Calculate', icon: '🧮', description: 'Perform calculations and show results' },
      { id: 'format_table', label: 'Format Table', icon: '📋', description: 'Organize data in a clean table' }
    );
  } else if (isQuestion) {
    actions.push(
      { id: 'answer_question', label: 'Answer', icon: '💭', description: 'Provide a comprehensive answer' },
      { id: 'research_topic', label: 'Research', icon: '🔍', description: 'Expand with relevant information' },
      { id: 'pros_cons', label: 'Pros & Cons', icon: '⚖️', description: 'List advantages and disadvantages' },
      { id: 'explain_simply', label: 'ELI5', icon: '👶', description: 'Explain like I\'m five' }
    );
  } else if (isLongText) {
    actions.push(
      { id: 'summarize', label: 'Summarize', icon: '📄', description: 'Create a concise summary' },
      { id: 'key_points', label: 'Key Points', icon: '🎯', description: 'Extract main ideas as bullets' },
      { id: 'create_outline', label: 'Make Outline', icon: '📑', description: 'Create a structured outline' },
      { id: 'simplify', label: 'Simplify', icon: '✂️', description: 'Rewrite in simpler language' }
    );
  } else {
    // Generic actions for any text
    actions.push(
      { id: 'improve_writing', label: 'Improve', icon: '✨', description: 'Enhance clarity and impact' },
      { id: 'translate', label: 'Translate', icon: '🌐', description: 'Translate to another language' },
      { id: 'expand', label: 'Expand', icon: '📝', description: 'Add more detail and context' },
      { id: 'summarize', label: 'Summarize', icon: '📄', description: 'Create a brief summary' }
    );
  }
  
  console.log('Generated default actions:', actions);
  return sortActionsByUsage(actions);
}

// Sort actions by previous usage
function sortActionsByUsage(actions) {
  return actions.sort((a, b) => {
    const aStats = actionUsageStats[a.id] || { clicks: 0 };
    const bStats = actionUsageStats[b.id] || { clicks: 0 };
    return bStats.clicks - aStats.clicks;
  });
}

// Get fallback default actions
function getDefaultActions() {
  console.log('Using absolute fallback actions');
  return [
    { id: 'summarize', label: 'Summarize', icon: '📄', description: 'Create a brief summary' },
    { id: 'explain', label: 'Explain', icon: '💡', description: 'Explain in simple terms' },
    { id: 'improve', label: 'Improve', icon: '✨', description: 'Enhance the content' },
    { id: 'key_points', label: 'Key Points', icon: '🎯', description: 'Extract main ideas' }
  ];
}

// Execute the selected action
async function executeAction(actionId, text, context) {
  if (!apiKey) {
    throw new Error('API key not configured. Please set it in the extension options.');
  }
  
  // Update usage stats
  updateActionStats(actionId);
  
  // Generate dynamic prompt based on action
  const prompt = generateDynamicPrompt(actionId, text, context);
  
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

// Generate dynamic prompts based on action ID
function generateDynamicPrompt(actionId, text, context) {
  // Map of action IDs to prompt templates
  const promptTemplates = {
    // Code-related actions
    explain_code: `Explain the following code in simple terms, focusing on what it does and how it works:\n\n${text}`,
    find_bugs: `Analyze this code for bugs, potential issues, and edge cases. Provide specific fixes:\n\n${text}`,
    add_comments: `Add helpful inline comments to explain what each section does:\n\n${text}`,
    improve_code: `Suggest improvements for better performance, readability, and best practices:\n\n${text}`,
    
    // Email/communication actions
    make_professional: `Rewrite this in a professional, business-appropriate tone:\n\n${text}`,
    make_friendly: `Rewrite this in a warm, friendly, and personable tone:\n\n${text}`,
    create_reply: `Create a thoughtful reply to this message:\n\n${text}`,
    add_structure: `Organize this with clear sections, headings, and action items:\n\n${text}`,
    
    // List/data actions
    organize_list: `Organize these items into logical groups or categories:\n\n${text}`,
    expand_items: `Add helpful details and context to each item in this list:\n\n${text}`,
    create_table: `Convert this into a well-formatted table:\n\n${text}`,
    prioritize: `Prioritize these items by importance and urgency, explaining why:\n\n${text}`,
    
    // Analysis actions
    analyze_data: `Analyze this data for patterns, trends, and insights:\n\n${text}`,
    create_chart: `Generate JavaScript code to create a chart visualizing this data:\n\n${text}`,
    calculate: `Perform any calculations needed and show the results clearly:\n\n${text}`,
    format_table: `Format this data as a clean, readable table:\n\n${text}`,
    
    // Question/research actions
    answer_question: `Provide a comprehensive answer to this question:\n\n${text}`,
    research_topic: `Expand on this topic with relevant information and context:\n\n${text}`,
    pros_cons: `List the pros and cons in a balanced way:\n\n${text}`,
    explain_simply: `Explain this in very simple terms that anyone can understand:\n\n${text}`,
    
    // Text improvement actions
    summarize: `Summarize the key points in 2-3 sentences:\n\n${text}`,
    key_points: `Extract and list the main points as bullet points:\n\n${text}`,
    create_outline: `Create a structured outline of the main topics and subtopics:\n\n${text}`,
    simplify: `Rewrite this in simpler, clearer language:\n\n${text}`,
    improve_writing: `Improve the clarity, flow, and impact of this text:\n\n${text}`,
    translate: `Translate this text to Spanish (or ask which language if unclear):\n\n${text}`,
    expand: `Expand this with more detail, examples, and context:\n\n${text}`,
    
    // Default fallback
    default: `Process the following text as requested:\n\n${text}`
  };
  
  return promptTemplates[actionId] || promptTemplates.default;
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
    console.log('API key updated:', !!apiKey);
  }
}); 