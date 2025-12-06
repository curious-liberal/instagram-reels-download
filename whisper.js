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

  // Load FFmpeg.wasm library
  async function loadFFmpeg() {
    if (ffmpegLoaded && ffmpegInstance) {
      return ffmpegInstance;
    }

    showProgress('Loading audio extraction library...');

    try {
      // Check if FFmpeg libraries are loaded
      if (typeof FFmpegWASM === 'undefined') {
        throw new Error('FFmpeg library not loaded from CDN. Please refresh the page.');
      }

      if (typeof FFmpegUtil === 'undefined') {
        throw new Error('FFmpeg util library not loaded from CDN. Please refresh the page.');
      }

      const { FFmpeg } = FFmpegWASM;
      const { fetchFile, toBlobURL } = FFmpegUtil;

      ffmpegInstance = new FFmpeg();

      // Load FFmpeg core
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpegInstance.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
      });

      ffmpegLoaded = true;
      return ffmpegInstance;
    } catch (error) {
      console.error('Error loading FFmpeg:', error);
      throw new Error('Failed to load audio extraction library: ' + error.message);
    }
  }

  // Extract audio from video blob
  async function extractAudioFromVideo(videoBlob, progressCallback) {
    try {
      const ffmpeg = await loadFFmpeg();

      // Write video file to FFmpeg virtual filesystem
      const videoData = new Uint8Array(await videoBlob.arrayBuffer());
      await ffmpeg.writeFile('input.mp4', videoData);

      // Set up progress callback if provided
      if (progressCallback) {
        ffmpeg.on('progress', ({ progress }) => {
          const percent = Math.round(progress * 100);
          progressCallback(percent);
        });
      }

      // Extract audio to MP3 with compression
      // Start with 64k bitrate, mono, 16kHz (optimized for speech)
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-vn', // No video
        '-acodec', 'libmp3lame',
        '-b:a', '64k', // Bitrate
        '-ac', '1', // Mono
        '-ar', '16000', // Sample rate 16kHz
        'output.mp3'
      ]);

      // Read the output file
      const audioData = await ffmpeg.readFile('output.mp3');
      const audioBlob = new Blob([audioData.buffer], { type: 'audio/mp3' });

      // Clean up
      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp3');

      // Check file size (Whisper API limit is 25MB)
      if (audioBlob.size > 25 * 1024 * 1024) {
        // Try with lower bitrate
        return await extractAudioWithLowerBitrate(videoBlob, progressCallback);
      }

      return audioBlob;
    } catch (error) {
      console.error('Error extracting audio:', error);
      throw new Error('Failed to extract audio: ' + error.message);
    }
  }

  // Extract audio with lower bitrate if file is too large
  async function extractAudioWithLowerBitrate(videoBlob, progressCallback) {
    try {
      const ffmpeg = ffmpegInstance;

      const videoData = new Uint8Array(await videoBlob.arrayBuffer());
      await ffmpeg.writeFile('input.mp4', videoData);

      // Try 32k bitrate
      showProgress('File too large, compressing further...');
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-vn',
        '-acodec', 'libmp3lame',
        '-b:a', '32k',
        '-ac', '1',
        '-ar', '16000',
        'output.mp3'
      ]);

      const audioData = await ffmpeg.readFile('output.mp3');
      const audioBlob = new Blob([audioData.buffer], { type: 'audio/mp3' });

      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp3');

      if (audioBlob.size > 25 * 1024 * 1024) {
        throw new Error('Audio file is too large even after compression. Please use a shorter video.');
      }

      return audioBlob;
    } catch (error) {
      console.error('Error extracting audio with lower bitrate:', error);
      throw error;
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
      formData.append('file', audioBlob, 'audio.mp3');
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

      // Step 2: Extract audio
      showProgress('Extracting audio... 0%', mode);
      const audioBlob = await extractAudioFromVideo(videoBlob, (progress) => {
        showProgress(`Extracting audio... ${progress}%`, mode);
      });

      // Step 3: Transcribe
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
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch video');
      }
      return await response.blob();
    } catch (error) {
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
          showMessage('error', error.message || 'Failed to fetch video', 'transcribe');
        }
      });
    }
  }

  // Setup button after DOM loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTranscribeButton);
  } else {
    setupTranscribeButton();
  }
})();
