// Settings modal management for OpenAI API key
(function() {
  'use strict';

  const STORAGE_KEY = 'openai_api_key';

  // DOM elements (will be initialized after DOM loads)
  let settingsBtn;
  let settingsModal;
  let closeSettingsBtn;
  let apiKeyInput;
  let saveApiKeyBtn;
  let clearApiKeyBtn;
  let apiKeyStatus;

  // Initialize settings modal when DOM is ready
  function initSettings() {
    // Get DOM elements
    settingsBtn = document.getElementById('settingsButton');
    settingsModal = document.getElementById('settingsModal');
    closeSettingsBtn = document.getElementById('closeSettings');
    apiKeyInput = document.getElementById('apiKeyInput');
    saveApiKeyBtn = document.getElementById('saveApiKey');
    clearApiKeyBtn = document.getElementById('clearApiKey');
    apiKeyStatus = document.getElementById('apiKeyStatus');

    // Load existing API key if present
    loadApiKey();

    // Event listeners
    if (settingsBtn) {
      settingsBtn.addEventListener('click', openSettingsModal);
    }

    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', closeSettingsModal);
    }

    if (settingsModal) {
      settingsModal.addEventListener('click', function(e) {
        if (e.target === settingsModal) {
          closeSettingsModal();
        }
      });
    }

    if (saveApiKeyBtn) {
      saveApiKeyBtn.addEventListener('click', saveApiKey);
    }

    if (clearApiKeyBtn) {
      clearApiKeyBtn.addEventListener('click', clearApiKey);
    }

    // Allow Enter key to save
    if (apiKeyInput) {
      apiKeyInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          saveApiKey();
        }
      });
    }

    // Update status indicator
    updateApiKeyStatus();
  }

  // Open settings modal
  function openSettingsModal() {
    if (settingsModal) {
      settingsModal.style.display = 'flex';
      if (apiKeyInput) {
        apiKeyInput.focus();
      }
    }
  }

  // Close settings modal
  function closeSettingsModal() {
    if (settingsModal) {
      settingsModal.style.display = 'none';
    }
  }

  // Load API key from localStorage
  function loadApiKey() {
    try {
      const apiKey = localStorage.getItem(STORAGE_KEY);
      if (apiKey && apiKeyInput) {
        apiKeyInput.value = apiKey;
      }
    } catch (error) {
      console.error('Error loading API key:', error);
    }
  }

  // Save API key to localStorage
  function saveApiKey() {
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

    if (!apiKey) {
      showMessage('error', 'Please enter an API key');
      return;
    }

    if (!validateApiKey(apiKey)) {
      showMessage('error', 'Invalid API key format. OpenAI API keys start with "sk-"');
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, apiKey);
      showMessage('success', 'API key saved successfully');
      updateApiKeyStatus();
      closeSettingsModal();
    } catch (error) {
      console.error('Error saving API key:', error);
      showMessage('error', 'Failed to save API key');
    }
  }

  // Clear API key from localStorage
  function clearApiKey() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      if (apiKeyInput) {
        apiKeyInput.value = '';
      }
      showMessage('success', 'API key cleared');
      updateApiKeyStatus();
    } catch (error) {
      console.error('Error clearing API key:', error);
      showMessage('error', 'Failed to clear API key');
    }
  }

  // Validate API key format
  function validateApiKey(key) {
    // OpenAI API keys start with "sk-" and are at least 20 characters
    if (!key.startsWith('sk-')) {
      return false;
    }
    if (key.length < 20 || key.length > 100) {
      return false;
    }
    // Should only contain alphanumeric characters and hyphens
    if (!/^sk-[a-zA-Z0-9\-_]+$/.test(key)) {
      return false;
    }
    return true;
  }

  // Update API key status indicator
  function updateApiKeyStatus() {
    const apiKey = getApiKey();
    if (apiKeyStatus) {
      if (apiKey) {
        apiKeyStatus.innerHTML = '<i class="fas fa-check-circle"></i> API Key Configured';
        apiKeyStatus.className = 'api-key-status configured';
      } else {
        apiKeyStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> No API Key';
        apiKeyStatus.className = 'api-key-status not-configured';
      }
    }
  }

  // Show message (uses existing message system if available)
  function showMessage(type, message) {
    const responseDiv = document.getElementById('response');
    if (responseDiv) {
      responseDiv.innerHTML = '<div class="' + type + '-message">' + message + '</div>';
      // Auto-clear after 3 seconds
      setTimeout(function() {
        responseDiv.innerHTML = '';
      }, 3000);
    }
  }

  // Public API
  window.Settings = {
    init: initSettings,
    getApiKey: getApiKey,
    hasApiKey: hasApiKey,
    openSettings: openSettingsModal,
    validateApiKey: validateApiKey
  };

  // Get API key from localStorage
  function getApiKey() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch (error) {
      console.error('Error getting API key:', error);
      return '';
    }
  }

  // Check if API key is configured
  function hasApiKey() {
    const apiKey = getApiKey();
    return apiKey && validateApiKey(apiKey);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettings);
  } else {
    initSettings();
  }
})();
