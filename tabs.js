// Tab navigation for Download, Transcribe, and Bulk modes
(function() {
  'use strict';

  const MODES = {
    DOWNLOAD: 'download',
    TRANSCRIBE: 'transcribe',
    BULK: 'bulk'
  };

  let currentMode = MODES.DOWNLOAD;

  // DOM elements (initialized after DOM loads)
  let downloadTab;
  let transcribeTab;
  let bulkTab;
  let downloadSection;
  let transcribeSection;
  let bulkSection;

  // Initialize tabs when DOM is ready
  function initTabs() {
    // Get tab buttons
    downloadTab = document.getElementById('downloadTab');
    transcribeTab = document.getElementById('transcribeTab');
    bulkTab = document.getElementById('bulkTab');

    // Get sections
    downloadSection = document.getElementById('downloadSection');
    transcribeSection = document.getElementById('transcribeSection');
    bulkSection = document.getElementById('bulkSection');

    // Event listeners
    if (downloadTab) {
      downloadTab.addEventListener('click', function() {
        switchToMode(MODES.DOWNLOAD);
      });
    }

    if (transcribeTab) {
      transcribeTab.addEventListener('click', function() {
        switchToMode(MODES.TRANSCRIBE);
      });
    }

    if (bulkTab) {
      bulkTab.addEventListener('click', function() {
        switchToMode(MODES.BULK);
      });
    }

    // Check URL hash for initial mode
    checkUrlHash();

    // Listen for hash changes
    window.addEventListener('hashchange', checkUrlHash);

    // Initialize with default mode
    switchToMode(currentMode);
  }

  // Switch to a specific mode
  function switchToMode(mode) {
    currentMode = mode;

    // Update active tab
    if (downloadTab) downloadTab.classList.remove('active');
    if (transcribeTab) transcribeTab.classList.remove('active');
    if (bulkTab) bulkTab.classList.remove('active');

    // Show/hide sections
    if (downloadSection) downloadSection.style.display = 'none';
    if (transcribeSection) transcribeSection.style.display = 'none';
    if (bulkSection) bulkSection.style.display = 'none';

    switch (mode) {
      case MODES.DOWNLOAD:
        if (downloadTab) downloadTab.classList.add('active');
        if (downloadSection) downloadSection.style.display = 'block';
        window.location.hash = 'download';
        break;

      case MODES.TRANSCRIBE:
        if (transcribeTab) transcribeTab.classList.add('active');
        if (transcribeSection) transcribeSection.style.display = 'block';
        window.location.hash = 'transcribe';
        break;

      case MODES.BULK:
        if (bulkTab) bulkTab.classList.add('active');
        if (bulkSection) bulkSection.style.display = 'block';
        window.location.hash = 'bulk';
        break;
    }
  }

  // Check URL hash and switch mode accordingly
  function checkUrlHash() {
    const hash = window.location.hash.replace('#', '');

    switch (hash) {
      case 'transcribe':
        currentMode = MODES.TRANSCRIBE;
        break;
      case 'bulk':
        currentMode = MODES.BULK;
        break;
      case 'download':
      default:
        currentMode = MODES.DOWNLOAD;
        break;
    }

    switchToMode(currentMode);
  }

  // Get current mode
  function getCurrentMode() {
    return currentMode;
  }

  // Public API
  window.TabManager = {
    init: initTabs,
    switchTo: switchToMode,
    getCurrentMode: getCurrentMode,
    MODES: MODES
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTabs);
  } else {
    initTabs();
  }
})();
