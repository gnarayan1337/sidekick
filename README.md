# Sidekick AI - Your Contextual Browser Assistant

✨ **Sidekick AI** is a Chrome extension that transforms your browser into an active partner by providing contextual, AI-powered actions right when you need them.

## 🎯 Vision

Sidekick AI anticipates user intent and provides actionable shortcuts with a single click, reducing friction and automating repetitive web tasks. It's designed for power users who want to maintain their flow state while browsing.

## 🚀 Features

### Dynamic Context-Aware Actions
- **AI-Powered Analysis**: Uses Claude to analyze selected text and generate the most relevant actions
- **Context-Specific**: Automatically detects code, emails, lists, data, questions, and more
- **No Hardcoded Options**: Every selection gets custom actions tailored to the content
- **Smart Fallbacks**: Falls back to intelligent defaults if AI analysis fails

### Intelligent Action Generation

The extension dynamically generates actions based on what you select:

**For Code:**
- 💡 Explain Code - Understand what the code does
- 🐛 Find Bugs - Identify issues and suggest fixes
- 💬 Add Comments - Generate helpful inline documentation
- ✨ Improve Code - Optimize for performance and readability

**For Emails:**
- 👔 Professional Tone - Make it business-appropriate
- 😊 Friendly Tone - Add warmth and personality
- ↩️ Draft Reply - Generate thoughtful responses
- 📋 Add Structure - Organize with clear sections

**For Lists & Data:**
- 📊 Organize List - Group items logically
- 📈 Create Charts - Generate visualization code
- 🧮 Calculate - Perform computations
- 🎯 Prioritize - Rank by importance

**For Questions:**
- 💭 Answer - Provide comprehensive responses
- 🔍 Research - Expand with context
- ⚖️ Pros & Cons - Balanced analysis
- 👶 ELI5 - Explain simply

**And many more context-specific actions!**

### Smart Personalization
- Learns from your usage patterns
- Prioritizes frequently used actions
- Adapts to your workflow over time

## 📦 Installation

### From Source (Development)

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/sidekick-ai.git
   cd sidekick-ai
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right

4. Click "Load unpacked" and select the `sidekick` directory

5. The extension icon (✨) will appear in your toolbar

### Setup

1. Click the extension icon and go to Settings
2. Add your Claude API key (get one from [Anthropic Console](https://console.anthropic.com/api-keys))
3. Test the connection to ensure everything works
4. Start selecting text on any webpage!

## 🎮 How to Use

1. **Select Text**: Highlight any text on a webpage
2. **Wait for Analysis**: A loading indicator shows while AI analyzes the context
3. **Choose Action**: Click one of the suggested actions (hover for descriptions)
4. **Get Results**: View the AI-generated response in a beautiful panel
5. **Take Action**: Copy to clipboard or insert directly into text fields

## 🔧 Technical Details

- **Platform**: Chrome Extension (Manifest V3)
- **AI Model**: Claude 3 Haiku (fast model for quick responses)
- **Architecture**: 
  - Background service worker for API calls and action generation
  - Content script for UI interaction
  - Secure API key storage using Chrome Storage API
  - Dynamic action generation using AI analysis

## 🛡️ Privacy & Security

- Your API key is stored locally and securely
- No data is sent to any servers except Anthropic's API
- All processing happens in real-time, nothing is logged
- Open source for full transparency

### ⚠️ Important Security Note

This extension makes direct API calls from the browser to Claude's API using the `anthropic-dangerous-direct-browser-access` header. While this works for personal use, for production applications you should:

1. **Use a backend proxy server** to keep your API key secure
2. **Implement rate limiting** to prevent abuse
3. **Add user authentication** if distributing publicly

The current implementation is suitable for personal use but exposes your API key in browser network requests. Never share your extension with your API key hardcoded.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 Future Enhancements (V2.0)

- [ ] Backend proxy server for secure API calls
- [ ] Local LLM support for offline functionality
- [ ] Custom action creation and templates
- [ ] Keyboard shortcuts
- [ ] Integration with more services (Notion, Slack, etc.)
- [ ] Advanced context detection (page structure, user history)
- [ ] Batch processing for multiple selections
- [ ] Action result caching for common operations

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

Built with ❤️ using:
- Claude API by Anthropic
- Chrome Extension APIs
- Modern web technologies

---

**Note**: Remember to add your actual icon files (16x16, 48x48, and 128x128 PNG images) to the `icons` directory before publishing.