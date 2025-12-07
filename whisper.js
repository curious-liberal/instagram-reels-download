// Whisper API Integration for Instagram Reels Transcription
(function() {
  'use strict';

  // FFmpeg instance (lazy loaded)
  let ffmpegInstance = null;
  let ffmpegLoaded = false;

  // Store video blob for transcription
  let currentVideoBlob = null;

  // Video cache to avoid re-fetching
  const videoCache = new Map(); // URL -> {blob, timestamp}

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
      video.volume = 0; // Silent playback instead of muted
      video.playbackRate = 1.0; // Ensure normal speed

      // Wait for video to load
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          console.log('Video loaded:', {
            duration: video.duration,
            hasAudio: video.mozHasAudio || video.webkitAudioDecodedByteCount > 0,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight
          });
          resolve();
        };
        video.onerror = () => reject(new Error('Failed to load video'));
      });

      // Create audio context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Resume AudioContext (required in some browsers)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const source = audioContext.createMediaElementSource(video);
      const dest = audioContext.createMediaStreamDestination();
      source.connect(dest);

      console.log('AudioContext state:', audioContext.state);
      console.log('MediaStream tracks:', dest.stream.getAudioTracks().length);

      // Create MediaRecorder to capture audio with timeslice for continuous chunks
      const mediaRecorder = new MediaRecorder(dest.stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      });

      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          console.log('Received chunk:', e.data.size, 'bytes');
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

      // Update progress as video plays
      const progressInterval = setInterval(() => {
        if (video.duration > 0) {
          const progress = Math.floor((video.currentTime / video.duration) * 100);
          if (progressCallback) {
            progressCallback(progress);
          }
        }
      }, 500);

      // Wait for video to finish (with 5 minute timeout)
      await new Promise((resolve, reject) => {
        video.onended = resolve;
        video.onerror = () => reject(new Error('Video playback error during extraction'));

        // Timeout after 5 minutes
        setTimeout(() => {
          reject(new Error('Audio extraction timed out. Video may be too long.'));
        }, 5 * 60 * 1000);
      });

      clearInterval(progressInterval);

      // Stop recording
      mediaRecorder.stop();

      // Wait for final data
      await new Promise((resolve) => {
        mediaRecorder.onstop = resolve;
      });

      // Create audio blob
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });

      console.log('Audio extraction complete:', {
        audioBlobSize: audioBlob.size,
        audioBlobType: audioBlob.type,
        chunksCount: chunks.length,
        videoDuration: video.duration
      });

      // Clean up
      URL.revokeObjectURL(videoUrl);
      video.remove();

      // Check if audio was actually captured
      if (audioBlob.size === 0 || audioBlob.size < 1000) {
        throw new Error('No audio was captured from the video. The video may not contain audio.');
      }

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

  // Transcribe audio/video using OpenAI Whisper API
  async function transcribeAudio(mediaBlob, apiKey) {
    try {
      showProgress('Transcribing...');

      // Validate API key
      if (!Settings || !Settings.validateApiKey(apiKey)) {
        throw new Error('Invalid API key');
      }

      // Detect file extension from blob type
      let extension = 'mp4';
      if (mediaBlob.type.includes('webm')) {
        extension = 'webm';
      } else if (mediaBlob.type.includes('mp4')) {
        extension = 'mp4';
      } else if (mediaBlob.type.includes('mpeg')) {
        extension = 'mpeg';
      }

      // Create form data
      const formData = new FormData();
      formData.append('file', mediaBlob, `video.${extension}`);
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

      // Step 2: Transcribe video directly (Whisper supports video files)
      showProgress('Transcribing video...', mode);
      const result = await transcribeAudio(videoBlob, apiKey);

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

  // Fetch video as blob with caching
  async function fetchVideoAsBlob(url) {
    try {
      // Check cache first (cache for 5 minutes)
      const cached = videoCache.get(url);
      if (cached && (Date.now() - cached.timestamp < 5 * 60 * 1000)) {
        console.log('Using cached video for:', url);
        return cached.blob;
      }

      // Fetch video
      const response = await fetch(url, {
        mode: 'cors',
        credentials: 'omit'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch video');
      }
      const blob = await response.blob();

      // Cache the blob
      videoCache.set(url, {
        blob: blob,
        timestamp: Date.now()
      });

      return blob;
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
        <div class="transcript-content-wrapper">
          <div class="transcript-content">${escapeHtml(result.text)}</div>
          <button class="copy-transcript-btn" onclick="WhisperAPI.copyTranscript()" title="Copy to clipboard">
            <i class="fas fa-copy"></i>
          </button>
        </div>
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

  // Copy transcript to clipboard
  function copyTranscript() {
    const result = window._transcriptionResult;
    if (!result) return;

    navigator.clipboard.writeText(result.text).then(() => {
      // Show brief success message on all copy buttons
      const copyBtns = document.querySelectorAll('.copy-transcript-btn');
      copyBtns.forEach(btn => {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = originalHTML;
          btn.classList.remove('copied');
        }, 2000);
      });
    }).catch(err => {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    });
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
    const uploadDropzone = document.getElementById('uploadDropzone');
    const uploadSelectedText = document.getElementById('uploadSelectedText');

    if (fileInput && transcribeFileBtn) {
      // Click on dropzone triggers file input
      if (uploadDropzone) {
        uploadDropzone.addEventListener('click', () => fileInput.click());

        uploadDropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          uploadDropzone.classList.add('dragover');
        });
        uploadDropzone.addEventListener('dragleave', () => {
          uploadDropzone.classList.remove('dragover');
        });
        uploadDropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          uploadDropzone.classList.remove('dragover');
          const file = e.dataTransfer.files[0];
          if (file) {
            handleFileSelected(file);
          }
        });
      }

      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (file) {
          handleFileSelected(file);
        }
      });

      transcribeFileBtn.addEventListener('click', async function() {
        const file = fileInput.files[0];
        if (!file) {
          showMessage('error', 'Please select a media file', 'transcribe');
          return;
        }
        await transcribeSelectedFile(file, transcribeFileBtn);
      });
    }

    function handleFileSelected(file) {
      if (!file) return;
      const maxSize = 25 * 1024 * 1024;
      if (file.size > maxSize) {
        showMessage('error', 'File is larger than 25MB limit', 'transcribe');
        return;
      }
      fileInput.files = createFileList(file);
      if (uploadSelectedText) {
        uploadSelectedText.style.display = 'block';
        uploadSelectedText.innerHTML = `<strong>Selected:</strong> ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
      }
    }

    // helper to set FileList programmatically
    function createFileList(file) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      return dataTransfer.files;
    }

    async function transcribeSelectedFile(file, buttonEl) {
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

        if (buttonEl) buttonEl.disabled = true;

        // Show loading state
        showSpinner('transcribe');
        clearMessage('transcribe');

        // Transcribe video file directly
        showProgress('Transcribing media...', 'transcribe');
        const result = await transcribeAudio(file, apiKey);

        // Display results
        displayTranscriptionResults(result, file, 'transcribe');

        hideSpinner('transcribe');
        showMessage('success', 'Transcription complete!', 'transcribe');

      } catch (error) {
        console.error('Transcription error:', error);
        hideSpinner('transcribe');
        showMessage('error', error.message || 'Transcription failed', 'transcribe');
      } finally {
        if (buttonEl) buttonEl.disabled = false;
      }
    }
  }

  // ==================== TRANSCRIBE FROM VIDEO URL (FOR TAB SWITCHING) ====================

  // Transcribe from a video URL (called when switching from download tab)
  async function transcribeFromVideoUrl(videoUrl) {
    try {
      // Check if API key is configured
      if (!Settings || !Settings.hasApiKey()) {
        showMessage('error', 'Please configure your OpenAI API key in Settings', 'transcribe');
        if (Settings && Settings.openSettings) {
          Settings.openSettings();
        }
        return;
      }

      const apiKey = Settings.getApiKey();

      // Show loading state
      showSpinner('transcribe');
      clearMessage('transcribe');

      // Fetch video (will use cache if available)
      showProgress('Fetching video...', 'transcribe');
      const videoBlob = await fetchVideoAsBlob(videoUrl);
      currentVideoBlob = videoBlob;

      // Transcribe video directly
      showProgress('Transcribing video...', 'transcribe');
      const result = await transcribeAudio(videoBlob, apiKey);

      // Display results
      displayTranscriptionResults(result, videoBlob, 'transcribe');

      hideSpinner('transcribe');
      showMessage('success', 'Transcription complete!', 'transcribe');

    } catch (error) {
      console.error('Transcription error:', error);
      hideSpinner('transcribe');

      // If CORS error, show file upload option with download link
      if (error.message === 'Failed to download video: CORS_ERROR') {
        showMessage('error', 'Cannot fetch video due to CORS restrictions.', 'transcribe');
        showFileUploadOption(videoUrl);
      } else {
        showMessage('error', error.message || 'Transcription failed', 'transcribe');
      }
    }
  }

  // ==================== PUBLIC API ====================

  window.WhisperAPI = {
    transcribeVideo: transcribeVideo,
    transcribeFromVideoUrl: transcribeFromVideoUrl,
    copyTranscript: copyTranscript,
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

          const response = await fetch('https://api.instasave.website/media', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({'url': url})
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('API error response:', errorText);
            throw new Error('Failed to fetch video information. The Instagram URL may be invalid or the video may be private.');
          }

          const responseText = await response.text();
          let data;
          let videoUrl;

          // Try parsing as JSON first
          try {
            data = JSON.parse(responseText);
            videoUrl = data.download_url;
          } catch (e) {
            // Response is HTML, parse it
            const cleanedHtml = responseText
              .replace(/loader\.style\.display="none";/, '')
              .replace(/document\.getElementById\("div_download"\)\.innerHTML ="/, '')
              .replace(/";document\.getElementById\("downloader"\)\.remove\(\);showAd\(\);/, '')
              .replace(/\\/g, '');

            const parser = new DOMParser();
            const doc = parser.parseFromString(cleanedHtml, 'text/html');
            const downloadLink = doc.querySelector('a.abutton.is-success');
            videoUrl = downloadLink?.getAttribute('href');
          }

          if (!videoUrl) {
            console.error('API response:', responseText);
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
