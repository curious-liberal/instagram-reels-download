// Whisper API Integration for Instagram Reels Transcription
(function() {
  'use strict';

  // FFmpeg instance (lazy loaded)
  let ffmpegInstance = null;
  let ffmpegLoaded = false;

  // Store video blob for transcription
  let currentVideoBlob = null;

  // Initialize Whisper module
  function initWhisper() {
    // Public API will be initialized at the end
  }

  // ==================== AUDIO EXTRACTION ====================

  // Extract audio from video using Web Audio API
  async function extractAudioFromVideo(videoBlob, progressCallback) {
    try {
      showProgress('Extracting audio from video...');

      // Create video element
      const video = document.createElement('video');
      const videoUrl = URL.createObjectURL(videoBlob);
      video.src = videoUrl;
      video.muted = true;

      // Wait for video to load
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error('Failed to load video'));
      });

      // Create audio context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaElementSource(video);
      const dest = audioContext.createMediaStreamDestination();
      source.connect(dest);
      // Don't connect to destination to keep extraction silent

      // Create MediaRecorder to capture audio
      const mediaRecorder = new MediaRecorder(dest.stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      // Start recording and play video
      mediaRecorder.start();
      try {
        await video.play();
      } catch (error) {
        throw new Error('Failed to play video for audio extraction. Please try again.');
      }

      // Wait for video to finish
      await new Promise((resolve) => {
        video.onended = resolve;
      });

      // Stop recording
      mediaRecorder.stop();

      // Wait for final data
      await new Promise((resolve) => {
        mediaRecorder.onstop = resolve;
      });

      // Create audio blob
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });

      // Clean up
      URL.revokeObjectURL(videoUrl);
      video.remove();

      // Check file size
      if (audioBlob.size > 25 * 1024 * 1024) {
        throw new Error('Audio file is too large (>25MB). Please use a shorter video.');
      }

      if (progressCallback) {
        progressCallback(100);
      }

      return audioBlob;
    } catch (error) {
      console.error('Error extracting audio:', error);
      throw new Error('Failed to extract audio: ' + error.message);
    }
  }

  // ==================== WHISPER API INTEGRATION ====================

  // Transcribe audio using OpenAI Whisper API
  async function transcribeAudio(audioBlob, apiKey) {
    try {
      showProgress('Transcribing audio...');

      // Validate API key
      if (!Settings || !Settings.validateApiKey(apiKey)) {
        throw new Error('Invalid API key');
      }

      // Create form data
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'verbose_json'); // Get timestamps

      // Call Whisper API
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        await handleApiError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw error;
    }
  }

  // Handle API errors
  async function handleApiError(response) {
    let errorMessage = 'Transcription failed';

    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || errorMessage;
    } catch (e) {
      // Couldn't parse error JSON
    }

    switch (response.status) {
      case 401:
        errorMessage = 'Invalid API key. Please check your settings.';
        // Clear the invalid API key
        if (Settings && Settings.clearApiKey) {
          localStorage.removeItem('openai_api_key');
        }
        break;
      case 413:
        errorMessage = 'Audio file is too large. Please use a shorter video.';
        break;
      case 429:
        errorMessage = 'Rate limit exceeded. Please try again in a moment.';
        break;
      case 500:
      case 503:
        errorMessage = 'OpenAI service error. Please try again later.';
        break;
    }

    throw new Error(errorMessage);
  }

  // ==================== SRT GENERATION ====================

  // Generate SRT format from Whisper segments
  function generateSRT(segments) {
    if (!segments || segments.length === 0) {
      return '';
    }

    let srt = '';
    segments.forEach((segment, index) => {
      const startTime = formatSRTTime(segment.start);
      const endTime = formatSRTTime(segment.end);
      const text = segment.text.trim();

      srt += `${index + 1}\n`;
      srt += `${startTime} --> ${endTime}\n`;
      srt += `${text}\n\n`;
    });

    return srt;
  }

  // Format time for SRT (HH:MM:SS,mmm)
  function formatSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(ms, 3)}`;
  }

  // Pad number with zeros
  function pad(num, length) {
    return String(num).padStart(length, '0');
  }

  // ==================== MAIN TRANSCRIPTION FLOW ====================

  // Main transcription function
  async function transcribeVideo(videoUrl, mode = 'transcribe') {
    try {
      // Check if API key is configured
      if (!Settings || !Settings.hasApiKey()) {
        showMessage('error', 'Please configure your OpenAI API key in Settings', mode);
        if (Settings && Settings.openSettings) {
          Settings.openSettings();
        }
        return;
      }

      const apiKey = Settings.getApiKey();

      // Show loading state
      showSpinner(mode);
      clearMessage(mode);

      // Step 1: Fetch video
      showProgress('Fetching video...', mode);
      const videoBlob = await fetchVideoAsBlob(videoUrl);
      currentVideoBlob = videoBlob;

      // Step 2: Extract audio from video
      showProgress('Extracting audio...', mode);
      const audioBlob = await extractAudioFromVideo(videoBlob, (progress) => {
        showProgress(`Extracting audio... ${progress}%`, mode);
      });

      // Step 3: Transcribe audio
      showProgress('Transcribing audio...', mode);
      const result = await transcribeAudio(audioBlob, apiKey);

      // Step 4: Display results
      displayTranscriptionResults(result, videoBlob, mode);

      hideSpinner(mode);
      showMessage('success', 'Transcription complete!', mode);

    } catch (error) {
      console.error('Transcription error:', error);
      hideSpinner(mode);
      showMessage('error', error.message || 'Transcription failed', mode);
    }
  }

  // Fetch video as blob
  async function fetchVideoAsBlob(url) {
    try {
      // This assumes the video URL is from the api.instasave.website response
      const response = await fetch(url, {
        mode: 'cors',
        credentials: 'omit'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch video');
      }
      return await response.blob();
    } catch (error) {
      // CORS error - need alternative method
      if (error.message.includes('CORS') || error.message.includes('cors') ||
          error.message.includes('Cross-Origin') || error.name === 'TypeError') {
        throw new Error('CORS_ERROR');
      }
      throw new Error('Failed to download video: ' + error.message);
    }
  }

  // ==================== UI HELPERS ====================

  // Show progress message
  function showProgress(message, mode = 'transcribe') {
    const responseId = mode === 'download' ? 'response' : 'transcribeResponse';
    const responseDiv = document.getElementById(responseId);
    if (responseDiv) {
      responseDiv.innerHTML = `<div class="info-message"><i class="fas fa-spinner fa-spin"></i> ${message}</div>`;
    }
  }

  // Show message
  function showMessage(type, message, mode = 'transcribe') {
    const responseId = mode === 'download' ? 'response' : 'transcribeResponse';
    const responseDiv = document.getElementById(responseId);
    if (responseDiv) {
      const className = type === 'error' ? 'error-message' :
                       type === 'success' ? 'success-message' : 'info-message';
      responseDiv.innerHTML = `<div class="${className}">${message}</div>`;
    }
  }

  // Clear message
  function clearMessage(mode = 'transcribe') {
    const responseId = mode === 'download' ? 'response' : 'transcribeResponse';
    const responseDiv = document.getElementById(responseId);
    if (responseDiv) {
      responseDiv.innerHTML = '';
    }
  }

  // Show spinner
  function showSpinner(mode = 'transcribe') {
    const spinnerId = mode === 'download' ? 'spinner' : 'transcribeSpinner';
    const spinner = document.getElementById(spinnerId);
    if (spinner) {
      spinner.style.display = 'block';
    }
  }

  // Hide spinner
  function hideSpinner(mode = 'transcribe') {
    const spinnerId = mode === 'download' ? 'spinner' : 'transcribeSpinner';
    const spinner = document.getElementById(spinnerId);
    if (spinner) {
      spinner.style.display = 'none';
    }
  }

  // Display transcription results
  function displayTranscriptionResults(result, videoBlob, mode = 'transcribe') {
    const sectionId = mode === 'download' ? 'downloadTranscriptionResults' : 'transcriptionResultSection';
    const section = document.getElementById(sectionId);
    if (!section) return;

    // Calculate metadata
    const wordCount = result.text.trim().split(/\s+/).length;
    const duration = result.segments && result.segments.length > 0 ?
                    result.segments[result.segments.length - 1].end : 0;
    const language = result.language || 'auto-detected';

    // Generate SRT
    const srtContent = generateSRT(result.segments || []);

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
        ${mode === 'transcribe' && videoBlob ?
          '<button class="download-btn" onclick="WhisperAPI.downloadVideo()"><i class="fas fa-download"></i> Download Video</button>' :
          ''}
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

  // Format duration (seconds to MM:SS)
  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${pad(secs, 2)}`;
  }

  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
  }

  // Download transcript
  function downloadTranscript(format) {
    const result = window._transcriptionResult;
    if (!result) return;

    let content, filename, mimeType;

    if (format === 'txt') {
      content = result.text;
      filename = `transcript_${Date.now()}.txt`;
      mimeType = 'text/plain';
    } else if (format === 'srt') {
      content = result.srt;
      filename = `transcript_${Date.now()}.srt`;
      mimeType = 'text/srt';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Download video
  function downloadVideo() {
    const result = window._transcriptionResult;
    if (!result || !result.videoBlob) return;

    const url = URL.createObjectURL(result.videoBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `instagram_video_${Date.now()}.mp4`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ==================== FILE UPLOAD HANDLING ====================

  // Show file upload option when CORS blocks direct fetch
  function showFileUploadOption(downloadUrl) {
    const fileUploadSection = document.getElementById('fileUploadSection');
    if (!fileUploadSection) return;

    // Add download link
    const responseDiv = document.getElementById('transcribeResponse');
    if (responseDiv && downloadUrl) {
      responseDiv.innerHTML += `
        <div class="info-message" style="margin-top: 1rem;">
          <a href="${downloadUrl}" download class="download-btn" style="display: inline-block; text-decoration: none;">
            <i class="fas fa-download"></i> Download Video First
          </a>
        </div>
      `;
    }

    // Show file upload section
    fileUploadSection.style.display = 'block';
  }

  // Handle file upload transcription
  function setupFileUpload() {
    const fileInput = document.getElementById('videoFileInput');
    const transcribeFileBtn = document.getElementById('transcribeFileButton');

    if (fileInput && transcribeFileBtn) {
      transcribeFileBtn.addEventListener('click', async function() {
        const file = fileInput.files[0];
        if (!file) {
          showMessage('error', 'Please select a video file', 'transcribe');
          return;
        }

        // Check if API key is configured
        if (!Settings || !Settings.hasApiKey()) {
          showMessage('error', 'Please configure your OpenAI API key in Settings', 'transcribe');
          if (Settings && Settings.openSettings) {
            Settings.openSettings();
          }
          return;
        }

        try {
          const apiKey = Settings.getApiKey();

          // Hide file upload section
          const fileUploadSection = document.getElementById('fileUploadSection');
          if (fileUploadSection) {
            fileUploadSection.style.display = 'none';
          }

          // Show loading state
          showSpinner('transcribe');
          clearMessage('transcribe');

          // Extract audio from uploaded file
          showProgress('Extracting audio...', 'transcribe');
          const audioBlob = await extractAudioFromVideo(file, (progress) => {
            showProgress(`Extracting audio... ${progress}%`, 'transcribe');
          });

          // Transcribe audio
          showProgress('Transcribing audio...', 'transcribe');
          const result = await transcribeAudio(audioBlob, apiKey);

          // Display results
          displayTranscriptionResults(result, file, 'transcribe');

          hideSpinner('transcribe');
          showMessage('success', 'Transcription complete!', 'transcribe');

        } catch (error) {
          console.error('Transcription error:', error);
          hideSpinner('transcribe');
          showMessage('error', error.message || 'Transcription failed', 'transcribe');

          // Show file upload section again
          const fileUploadSection = document.getElementById('fileUploadSection');
          if (fileUploadSection) {
            fileUploadSection.style.display = 'block';
          }
        }
      });
    }
  }

  // ==================== PUBLIC API ====================

  window.WhisperAPI = {
    transcribeVideo: transcribeVideo,
    downloadTranscript: downloadTranscript,
    downloadVideo: downloadVideo,
    extractAudioFromVideo: extractAudioFromVideo,
    transcribeAudio: transcribeAudio,
    generateSRT: generateSRT
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhisper);
  } else {
    initWhisper();
  }

  // Wire up transcribe button
  function setupTranscribeButton() {
    const transcribeButton = document.getElementById('transcribeButton');
    const transcribeInput = document.getElementById('transcribeReelUrl');

    if (transcribeButton && transcribeInput) {
      transcribeButton.addEventListener('click', async function() {
        const url = transcribeInput.value.trim();
        if (!url) {
          showMessage('error', 'Please paste an Instagram video URL', 'transcribe');
          return;
        }

        // Validate Instagram URL format
        if (!url.includes('instagram.com')) {
          showMessage('error', 'Please enter a valid Instagram URL', 'transcribe');
          return;
        }

        // First fetch the video metadata from api.instasave.website
        try {
          showSpinner('transcribe');
          showProgress('Fetching video metadata...', 'transcribe');

          const formData = new FormData();
          formData.append('url', url);

          const response = await fetch('https://api.instasave.website/media', {
            method: 'POST',
            body: formData
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('API error response:', errorText);
            throw new Error('Failed to fetch video information. The Instagram URL may be invalid or the video may be private.');
          }

          const data = await response.json();
          const videoUrl = data.download_url;

          if (!videoUrl) {
            console.error('API response:', data);
            throw new Error('Could not get video download URL from API response');
          }

          // Now transcribe using the video URL
          await transcribeVideo(videoUrl, 'transcribe');

        } catch (error) {
          console.error('Error fetching video:', error);
          hideSpinner('transcribe');

          // If CORS error, show file upload option with download link
          if (error.message === 'Failed to download video: CORS_ERROR') {
            showMessage('error', 'Cannot fetch video due to CORS restrictions.', 'transcribe');
            showFileUploadOption(videoUrl);
          } else {
            showMessage('error', error.message || 'Failed to fetch video', 'transcribe');
          }
        }
      });
    }
  }

  // Setup button after DOM loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setupTranscribeButton();
      setupFileUpload();
    });
  } else {
    setupTranscribeButton();
    setupFileUpload();
  }
})();
