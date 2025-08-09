// Options page JavaScript for Sidekick AI

// Action metadata
const actionMetadata = {
  explain_code: { icon: '📜', label: 'Explain Code' },
  refactor_code: { icon: '♻️', label: 'Refactor Code' },
  add_docstrings: { icon: '💬', label: 'Add Docstrings' },
  make_concise: { icon: '✂️', label: 'Make Concise' },
  professional_tone: { icon: '👔', label: 'Professional Tone' },
  key_points: { icon: '📝', label: 'Key Points' },
  quick_summary: { icon: '🔍', label: 'Quick Summary' },
  save_to_notion: { icon: '💾', label: 'Save to Notion' }
};

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
    .sort((a, b) => (b[1].clicks || 0) - (a[1].clicks || 0));
  
  sortedActions.forEach(([actionId, stats]) => {
    const metadata = actionMetadata[actionId];
    if (!metadata) return;
    
    const statItem = document.createElement('div');
    statItem.className = 'stat-item';
    statItem.innerHTML = `
      <div class="icon">${metadata.icon}</div>
      <div class="label">${metadata.label}</div>
      <div class="value">${stats.clicks || 0}</div>
    `;
    
    statsGrid.appendChild(statItem);
  });
  
  // Add total usage stat
  const totalClicks = sortedActions.reduce((sum, [, stats]) => sum + (stats.clicks || 0), 0);
  const totalItem = document.createElement('div');
  totalItem.className = 'stat-item';
  totalItem.innerHTML = `
    <div class="icon">📊</div>
    <div class="label">Total Uses</div>
    <div class="value">${totalClicks}</div>
  `;
  statsGrid.appendChild(totalItem);
}

// Reset statistics
resetStatsButton.addEventListener('click', async () => {
  if (confirm('Are you sure you want to reset all usage statistics?')) {
    const freshStats = {};
    Object.keys(actionMetadata).forEach(action => {
      freshStats[action] = { clicks: 0, lastUsed: null };
    });
    
    await chrome.storage.sync.set({ actionStats: freshStats });
    displayStats(freshStats);
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