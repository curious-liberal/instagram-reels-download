// Enhancement for Download Mode - adds transcribe button
(function() {
  'use strict';

  let videoDownloadUrl = null;
  let videoThumbnailElement = null;

  // Monitor for download results
  function monitorDownloadResults() {
    // Watch for changes in the download options container
    const downloadOptions = document.getElementById('downloadOptions');
    if (!downloadOptions) {
      setTimeout(monitorDownloadResults, 500);
      return;
    }

    // Use MutationObserver to detect when download button is added
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.addedNodes.length > 0) {
          // Check if a download link was added
          const downloadLink = downloadOptions.querySelector('a[download]');
          if (downloadLink && !downloadOptions.querySelector('.transcribe-video-btn')) {
            videoDownloadUrl = downloadLink.href;
            addTranscribeButton();
          }
        }
      });
    });

    observer.observe(downloadOptions, {
      childList: true,
      subtree: true
    });
  }

  // Add transcribe button to download mode
  function addTranscribeButton() {
    const downloadOptions = document.getElementById('downloadOptions');
    if (!downloadOptions) return;

    // Create transcribe button
    const transcribeBtn = document.createElement('button');
    transcribeBtn.className = 'download-btn transcribe-video-btn';
    transcribeBtn.innerHTML = '<i class="fas fa-closed-captioning"></i> Transcribe This Video';
    transcribeBtn.onclick = handleTranscribeClick;

    // Add the button
    downloadOptions.appendChild(transcribeBtn);

    // Create a container for transcription results in download mode
    const resultSection = document.getElementById('resultSection');
    if (resultSection && !document.getElementById('downloadTranscriptionResults')) {
      const transcriptionResults = document.createElement('div');
      transcriptionResults.id = 'downloadTranscriptionResults';
      transcriptionResults.className = 'transcription-result-section';
      transcriptionResults.style.display = 'none';
      resultSection.appendChild(transcriptionResults);
    }
  }

  // Handle transcribe button click in download mode
  async function handleTranscribeClick() {
    if (!videoDownloadUrl) {
      alert('Video URL not available');
      return;
    }

    // Check if API key is configured
    if (!Settings || !Settings.hasApiKey()) {
      alert('Please configure your OpenAI API key in Settings first');
      if (Settings && Settings.openSettings) {
        Settings.openSettings();
      }
      return;
    }

    try {
      // Use WhisperAPI to transcribe
      const responseDiv = document.getElementById('response');
      if (responseDiv) {
        responseDiv.innerHTML = '<div class="info-message"><i class="fas fa-spinner fa-spin"></i> Starting transcription...</div>';
      }

      // Call the transcription function
      await WhisperAPI.transcribeVideoFromUrl(videoDownloadUrl, 'download');

    } catch (error) {
      console.error('Transcription error:', error);
      const responseDiv = document.getElementById('response');
      if (responseDiv) {
        responseDiv.innerHTML = '<div class="error-message">Transcription failed: ' + error.message + '</div>';
      }
    }
  }

  // Add helper method to WhisperAPI for download mode
  function enhanceWhisperAPI() {
    if (window.WhisperAPI) {
      window.WhisperAPI.transcribeVideoFromUrl = async function(videoUrl, mode = 'download') {
        const apiKey = Settings.getApiKey();

        try {
          // Show loading state
          showDownloadModeProgress('Fetching video...', mode);

          const videoBlob = await fetchVideoAsBlob(videoUrl);

          // Transcribe video directly (Whisper supports video files)
          showDownloadModeProgress('Transcribing video...', mode);
          const result = await WhisperAPI.transcribeAudio(videoBlob, apiKey);

          // Display results
          displayDownloadModeResults(result, videoBlob);

          const responseDiv = document.getElementById('response');
          if (responseDiv) {
            responseDiv.innerHTML = '<div class="success-message">Transcription complete!</div>';
          }

        } catch (error) {
          console.error('Transcription error:', error);
          const responseDiv = document.getElementById('response');
          if (responseDiv) {
            responseDiv.innerHTML = '<div class="error-message">' + error.message + '</div>';
          }
        }
      };
    }
  }

  function showDownloadModeProgress(message) {
    const responseDiv = document.getElementById('response');
    if (responseDiv) {
      responseDiv.innerHTML = '<div class="info-message"><i class="fas fa-spinner fa-spin"></i> ' + message + '</div>';
    }
  }

  async function fetchVideoAsBlob(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch video');
    }
    return await response.blob();
  }

  function displayDownloadModeResults(result, videoBlob) {
    const section = document.getElementById('downloadTranscriptionResults');
    if (!section) return;

    // Calculate metadata
    const wordCount = result.text.trim().split(/\s+/).length;
    const duration = result.segments && result.segments.length > 0 ?
                    result.segments[result.segments.length - 1].end : 0;
    const language = result.language || 'auto-detected';

    // Generate SRT
    const srtContent = WhisperAPI.generateSRT(result.segments || []);

    // Format duration
    function formatDuration(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    // Escape HTML
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML.replace(/\n/g, '<br>');
    }

    // Create results HTML
    const html = `
      <div class="transcript-metadata">
        <span class="meta-item"><i class="fas fa-language"></i> Language: <strong>${language}</strong></span>
        <span class="meta-item"><i class="fas fa-file-word"></i> Words: <strong>${wordCount}</strong></span>
        <span class="meta-item"><i class="fas fa-clock"></i> Duration: <strong>${formatDuration(duration)}</strong></span>
      </div>

      <div class="transcript-text">
        <h3><i class="fas fa-align-left"></i> Transcript</h3>
        <div class="transcript-content">${escapeHtml(result.text)}</div>
      </div>

      <div class="transcript-actions">
        <button class="download-btn" onclick="WhisperAPI.downloadTranscript('txt')">
          <i class="fas fa-file-alt"></i> Download TXT
        </button>
        <button class="download-btn" onclick="WhisperAPI.downloadTranscript('srt')">
          <i class="fas fa-closed-captioning"></i> Download SRT
        </button>
      </div>
    `;

    section.innerHTML = html;
    section.style.display = 'block';

    // Store result for download
    window._transcriptionResult = {
      text: result.text,
      srt: srtContent,
      videoBlob: videoBlob
    };
  }

  // Initialize
  function init() {
    monitorDownloadResults();
    enhanceWhisperAPI();
  }

  // Start monitoring after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
