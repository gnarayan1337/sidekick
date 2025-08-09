# Testing Steps for Sidekick AI

1. **Reload the Extension**
   - Go to chrome://extensions/
   - Find Sidekick AI and click the refresh button
   - Check the console for any errors by clicking "Inspect views: service worker"

2. **Check API Key**
   - Click the extension icon
   - Go to Settings
   - Make sure your API key is saved
   - Click "Test Connection" to verify it works

3. **Test Selection**
   - Open any webpage
   - Open Developer Console (F12) and go to Console tab
   - Select some text
   - Watch for console messages

4. **Common Issues to Check**
   - Is the API key properly saved?
   - Are there any errors in the service worker console?
   - Are there any errors in the page console?

5. **Debug Mode**
   - The extension now logs errors to console
   - Check both the page console and service worker console for errors
