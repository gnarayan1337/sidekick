// Options page JavaScript for Sidekick AI

// DOM elements
const apiKeyInput = document.getElementById('apiKey');
const saveButton = document.getElementById('saveButton');
const testButton = document.getElementById('testButton');
const statusDiv = document.getElementById('status');
const statsGrid = document.getElementById('statsGrid');
const resetStatsButton = document.getElementById('resetStatsButton');

// Load saved settings
async function loadSettings() {
  const result = await chrome.storage.sync.get(['apiKey', 'actionStats']);
  
  // Show masked API key if exists
  if (result.apiKey) {
    apiKeyInput.value = maskApiKey(result.apiKey);
    apiKeyInput.dataset.hasKey = 'true';
  }
  
  // Display usage statistics
  if (result.actionStats) {
    displayStats(result.actionStats);
  } else {
    displayEmptyStats();
  }
}

// Mask API key for display
function maskApiKey(key) {
  if (!key) return '';
  const start = key.substring(0, 15);
  const end = key.substring(key.length - 4);
  return `${start}...${end}`;
}

// Save settings
saveButton.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  
  // Don't save if it's the masked version
  if (apiKeyInput.dataset.hasKey === 'true' && apiKey.includes('...')) {
    showStatus('No changes to save', 'success');
    return;
  }
  
  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }
  
  // Validate API key format
  if (!apiKey.startsWith('sk-ant-api')) {
    showStatus('Invalid API key format. Keys should start with "sk-ant-api"', 'error');
    return;
  }
  
  try {
    await chrome.storage.sync.set({ apiKey });
    apiKeyInput.value = maskApiKey(apiKey);
    apiKeyInput.dataset.hasKey = 'true';
    showStatus('Settings saved successfully!', 'success');
  } catch (error) {
    showStatus('Failed to save settings: ' + error.message, 'error');
  }
});

// Test API connection
testButton.addEventListener('click', async () => {
  const result = await chrome.storage.sync.get(['apiKey']);
  const apiKey = result.apiKey;
  
  if (!apiKey) {
    showStatus('Please save an API key first', 'error');
    return;
  }
  
  testButton.disabled = true;
  testButton.textContent = 'Testing...';
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'  // Required for browser-based requests
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: 'Hi'
          }
        ]
      })
    });
    
    if (response.ok) {
      showStatus('API connection successful!', 'success');
    } else {
      const error = await response.text();
      showStatus(`API test failed: ${response.status} - ${error}`, 'error');
    }
  } catch (error) {
    showStatus('Connection test failed: ' + error.message, 'error');
  } finally {
    testButton.disabled = false;
    testButton.textContent = 'Test Connection';
  }
});

// Handle input focus to clear masked value
apiKeyInput.addEventListener('focus', () => {
  if (apiKeyInput.dataset.hasKey === 'true' && apiKeyInput.value.includes('...')) {
    apiKeyInput.value = '';
    apiKeyInput.dataset.hasKey = 'false';
  }
});

// Display usage statistics
function displayStats(actionStats) {
  statsGrid.innerHTML = '';
  
  // Sort actions by usage
  const sortedActions = Object.entries(actionStats)
    .filter(([, stats]) => stats.clicks > 0)
    .sort((a, b) => (b[1].clicks || 0) - (a[1].clicks || 0))
    .slice(0, 8); // Show top 8 actions
  
  if (sortedActions.length === 0) {
    displayEmptyStats();
    return;
  }
  
  sortedActions.forEach(([actionId, stats]) => {
    const statItem = document.createElement('div');
    statItem.className = 'stat-item';
    
    // Try to extract icon from action ID or use a default
    const icon = guessIconFromActionId(actionId);
    const label = formatActionLabel(actionId);
    
    statItem.innerHTML = `
      <div class="icon">${icon}</div>
      <div class="label">${label}</div>
      <div class="value">${stats.clicks || 0}</div>
    `;
    
    statsGrid.appendChild(statItem);
  });
  
  // Add total usage stat
  const totalClicks = Object.values(actionStats).reduce((sum, stats) => sum + (stats.clicks || 0), 0);
  const totalItem = document.createElement('div');
  totalItem.className = 'stat-item';
  totalItem.innerHTML = `
    <div class="icon">📊</div>
    <div class="label">Total Uses</div>
    <div class="value">${totalClicks}</div>
  `;
  statsGrid.appendChild(totalItem);
}

// Display empty stats message
function displayEmptyStats() {
  statsGrid.innerHTML = `
    <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #666;">
      <p style="margin: 0;">No usage data yet. Start using Sidekick AI to see your statistics!</p>
    </div>
  `;
}

// Guess icon from action ID
function guessIconFromActionId(actionId) {
  const iconMap = {
    explain: '💡',
    summarize: '📄',
    improve: '✨',
    translate: '🌐',
    code: '💻',
    bug: '🐛',
    comment: '💬',
    professional: '👔',
    friendly: '😊',
    reply: '↩️',
    list: '📋',
    table: '📊',
    chart: '📈',
    data: '📊',
    calculate: '🧮',
    answer: '💭',
    research: '🔍',
    question: '❓',
    outline: '📑',
    key: '🎯'
  };
  
  // Check if any key is contained in the action ID
  for (const [key, icon] of Object.entries(iconMap)) {
    if (actionId.toLowerCase().includes(key)) {
      return icon;
    }
  }
  
  return '🔮'; // Default icon
}

// Format action label from ID
function formatActionLabel(actionId) {
  return actionId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Reset statistics
resetStatsButton.addEventListener('click', async () => {
  if (confirm('Are you sure you want to reset all usage statistics?')) {
    await chrome.storage.sync.set({ actionStats: {} });
    displayEmptyStats();
    showStatus('Statistics reset successfully', 'success');
  }
});

// Show status message
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  
  // Auto-hide success messages
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 3000);
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', loadSettings); 