// Bulk Transcription Module
(function() {
  'use strict';

  // Queue state
  let processingQueue = [];
  let currentIndex = 0;
  let isProcessing = false;
  let completedTranscripts = [];

  // DOM elements
  let bulkUrlsInput;
  let processBulkButton;
  let clearBulkButton;
  let bulkQueueSection;
  let bulkQueue;
  let bulkDownloadSection;
  let bulkResponse;

  // Initialize bulk module
  function init() {
    bulkUrlsInput = document.getElementById('bulkUrlsInput');
    processBulkButton = document.getElementById('processBulkButton');
    clearBulkButton = document.getElementById('clearBulkButton');
    bulkQueueSection = document.getElementById('bulkQueueSection');
    bulkQueue = document.getElementById('bulkQueue');
    bulkDownloadSection = document.getElementById('bulkDownloadSection');
    bulkResponse = document.getElementById('bulkResponse');

    // Event listeners
    if (processBulkButton) {
      processBulkButton.addEventListener('click', handleProcessBulk);
    }

    if (clearBulkButton) {
      clearBulkButton.addEventListener('click', handleClear);
    }

    // URL cleaning on input
    if (bulkUrlsInput) {
      bulkUrlsInput.addEventListener('input', () => {
        const lines = bulkUrlsInput.value.split('\n');
        const cleaned = lines.map(line => {
          const trimmed = line.trim();
          return trimmed ? trimmed.split('?')[0] : trimmed;
        }).join('\n');

        if (cleaned !== bulkUrlsInput.value) {
          bulkUrlsInput.value = cleaned;
        }
      });
    }
  }

  // Handle process bulk button click
  async function handleProcessBulk() {
    if (!bulkUrlsInput) return;

    const urls = bulkUrlsInput.value
      .split('\n')
      .map(url => url.trim())
      .filter(url => url && url.includes('instagram.com'));

    if (urls.length === 0) {
      showMessage('error', 'Please enter at least one valid Instagram URL');
      return;
    }

    // Check API key
    if (!Settings || !Settings.hasApiKey()) {
      showMessage('error', 'Please configure your OpenAI API key in Settings first');
      if (Settings && Settings.openSettings) {
        Settings.openSettings();
      }
      return;
    }

    // Initialize queue
    processingQueue = urls.map((url, index) => ({
      id: index,
      url: url,
      status: 'pending', // pending, processing, completed, failed
      result: null,
      error: null
    }));

    currentIndex = 0;
    completedTranscripts = [];

    // Show queue
    renderQueue();
    bulkQueueSection.style.display = 'block';
    bulkDownloadSection.style.display = 'none';

    // Start processing
    isProcessing = true;
    processBulkButton.disabled = true;
    processNextInQueue();
  }

  // Process next item in queue
  async function processNextInQueue() {
    if (currentIndex >= processingQueue.length) {
      // All done
      isProcessing = false;
      processBulkButton.disabled = false;
      showMessage('success', `Completed ${completedTranscripts.length} of ${processingQueue.length} transcriptions`);

      if (completedTranscripts.length > 0) {
        bulkDownloadSection.style.display = 'block';
      }
      return;
    }

    const item = processingQueue[currentIndex];
    item.status = 'processing';
    renderQueue();

    try {
      // Fetch video metadata
      const response = await fetch('https://api.instasave.website/media', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({'url': item.url})
      });

      if (!response.ok) {
        throw new Error('Failed to fetch video information');
      }

      const responseText = await response.text();
      let videoUrl;

      // Parse response (JSON or HTML)
      try {
        const data = JSON.parse(responseText);
        videoUrl = data.download_url;
      } catch (e) {
        // Parse HTML response
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
        throw new Error('Could not get video download URL');
      }

      // Fetch video
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
        throw new Error('Failed to fetch video');
      }
      const videoBlob = await videoResponse.blob();

      // Transcribe
      const apiKey = Settings.getApiKey();
      const result = await WhisperAPI.transcribeAudio(videoBlob, apiKey);

      // Generate SRT
      const srtContent = WhisperAPI.generateSRT(result.segments || []);

      // Store result
      item.status = 'completed';
      item.result = {
        text: result.text,
        srt: srtContent,
        url: item.url,
        filename: `transcript_${currentIndex + 1}`
      };

      completedTranscripts.push(item.result);

    } catch (error) {
      console.error('Transcription error:', error);
      item.status = 'failed';
      item.error = error.message;
    }

    renderQueue();
    currentIndex++;

    // Small delay between requests to avoid rate limiting
    setTimeout(() => {
      processNextInQueue();
    }, 1000);
  }

  // Render queue display
  function renderQueue() {
    if (!bulkQueue) return;

    const html = processingQueue.map((item, index) => {
      let statusIcon, statusClass, statusText, actions = '';

      switch (item.status) {
        case 'pending':
          statusIcon = 'fa-clock';
          statusClass = 'status-pending';
          statusText = 'Pending';
          break;
        case 'processing':
          statusIcon = 'fa-spinner fa-spin';
          statusClass = 'status-processing';
          statusText = 'Processing...';
          break;
        case 'completed':
          statusIcon = 'fa-check-circle';
          statusClass = 'status-completed';
          statusText = 'Completed';
          actions = `
            <div class="queue-item-actions">
              <button class="queue-action-btn" onclick="BulkTranscribe.copyItem(${index})" title="Copy transcript">
                <i class="fas fa-copy"></i>
              </button>
              <button class="queue-action-btn" onclick="BulkTranscribe.downloadTxt(${index})" title="Download TXT">
                <i class="fas fa-file-alt"></i>
              </button>
              <button class="queue-action-btn" onclick="BulkTranscribe.downloadSrt(${index})" title="Download SRT">
                <i class="fas fa-closed-captioning"></i>
              </button>
              <button class="queue-action-btn" onclick="BulkTranscribe.downloadReel(${index})" title="Download video">
                <i class="fas fa-download"></i>
              </button>
            </div>
          `;
          break;
        case 'failed':
          statusIcon = 'fa-times-circle';
          statusClass = 'status-failed';
          statusText = `Failed: ${item.error}`;
          break;
      }

      return `
        <div class="queue-item ${statusClass}">
          <div class="queue-item-number">${index + 1}</div>
          <div class="queue-item-url">${item.url}</div>
          <div class="queue-item-status">
            <i class="fas ${statusIcon}"></i> ${statusText}
          </div>
          ${actions}
        </div>
      `;
    }).join('');

    bulkQueue.innerHTML = html;
  }

  // Copy individual item
  function copyItem(index) {
    const item = processingQueue[index];
    if (!item || !item.result) return;

    const formattedText = `=== Instagram Reel Transcript #${index + 1} ===\nURL: ${item.url}\n\n${item.result.text}`;

    navigator.clipboard.writeText(formattedText).then(() => {
      showMessage('success', 'Transcript copied to clipboard!');
    }).catch(err => {
      console.error('Copy failed:', err);
      showMessage('error', 'Failed to copy to clipboard');
    });
  }

  // Download TXT for individual item
  function downloadTxt(index) {
    const item = processingQueue[index];
    if (!item || !item.result) return;

    const blob = new Blob([item.result.text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.result.filename}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Download SRT for individual item
  function downloadSrt(index) {
    const item = processingQueue[index];
    if (!item || !item.result || !item.result.srt) return;

    const blob = new Blob([item.result.srt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.result.filename}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Download video for individual item
  async function downloadReel(index) {
    const item = processingQueue[index];
    if (!item || !item.url) return;

    try {
      showMessage('info', 'Fetching video...');

      // Re-fetch the video URL if needed
      const response = await fetch('https://api.instasave.website/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({'url': item.url})
      });

      const responseText = await response.text();
      let videoUrl;

      try {
        videoUrl = JSON.parse(responseText).download_url;
      } catch (e) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(responseText, 'text/html');
        videoUrl = doc.querySelector('a.abutton.is-success')?.getAttribute('href');
      }

      if (!videoUrl) throw new Error('Could not get video URL');

      // Create download link
      const a = document.createElement('a');
      a.href = videoUrl;
      a.download = `instagram_video_${index + 1}.mp4`;
      a.click();

      showMessage('success', 'Video download started!');
    } catch (error) {
      console.error('Download error:', error);
      showMessage('error', 'Failed to download video');
    }
  }

  // Copy all transcripts in structured format
  function copyAllTranscripts() {
    if (completedTranscripts.length === 0) return;

    const formatted = completedTranscripts.map((t, i) => {
      return `${'='.repeat(60)}\nTRANSCRIPT #${i + 1}\nURL: ${t.url}\n${'='.repeat(60)}\n\n${t.text}\n\n`;
    }).join('\n');

    navigator.clipboard.writeText(formatted).then(() => {
      showMessage('success', `Copied ${completedTranscripts.length} transcripts to clipboard!`);
    }).catch(err => {
      console.error('Copy failed:', err);
      showMessage('error', 'Failed to copy to clipboard');
    });
  }

  // Download all transcripts as individual files
  async function downloadAllIndividual() {
    if (completedTranscripts.length === 0) return;

    showMessage('info', 'Downloading individual TXT + SRT files...');

    // Download each transcript with a small delay
    for (let i = 0; i < completedTranscripts.length; i++) {
      const t = completedTranscripts[i];

      // Download TXT
      const blob = new Blob([t.text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${t.filename}.txt`;
      a.click();
      URL.revokeObjectURL(url);

      // Download SRT
      if (t.srt) {
        const srtBlob = new Blob([t.srt], { type: 'text/plain' });
        const srtUrl = URL.createObjectURL(srtBlob);
        const srtLink = document.createElement('a');
        srtLink.href = srtUrl;
        srtLink.download = `${t.filename}.srt`;
        srtLink.click();
        URL.revokeObjectURL(srtUrl);
      }

      // Small delay to prevent browser blocking multiple downloads
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    showMessage('success', `Downloaded ${completedTranscripts.length} transcript sets!`);
  }

  // Download all as ZIP
  async function downloadAllZip() {
    if (completedTranscripts.length === 0) return;

    try {
      const zip = new JSZip();

      // Add all transcripts to ZIP
      completedTranscripts.forEach((transcript, index) => {
        zip.file(`${transcript.filename}.txt`, transcript.text);
        zip.file(`${transcript.filename}.srt`, transcript.srt);
      });

      // Create summary file
      const summary = completedTranscripts.map((t, i) =>
        `${i + 1}. ${t.url}\n   Filename: ${t.filename}`
      ).join('\n\n');
      zip.file('_summary.txt', summary);

      // Generate ZIP
      showMessage('info', 'Generating ZIP file...');
      const blob = await zip.generateAsync({ type: 'blob' });

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `instagram_transcripts_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      showMessage('success', 'ZIP file downloaded successfully!');

    } catch (error) {
      console.error('ZIP generation error:', error);
      showMessage('error', 'Failed to generate ZIP file');
    }
  }

  // Handle clear button
  function handleClear() {
    if (bulkUrlsInput) {
      bulkUrlsInput.value = '';
    }

    processingQueue = [];
    currentIndex = 0;
    completedTranscripts = [];
    isProcessing = false;

    if (bulkQueueSection) {
      bulkQueueSection.style.display = 'none';
    }

    if (bulkDownloadSection) {
      bulkDownloadSection.style.display = 'none';
    }

    if (bulkResponse) {
      bulkResponse.innerHTML = '';
    }

    processBulkButton.disabled = false;
  }

  // Show message
  function showMessage(type, message) {
    if (!bulkResponse) return;

    const className = type === 'error' ? 'error-message' :
                     type === 'success' ? 'success-message' : 'info-message';
    bulkResponse.innerHTML = `<div class="${className}">${message}</div>`;
  }

  // Public API
  window.BulkTranscribe = {
    copyItem: copyItem,
    downloadTxt: downloadTxt,
    downloadSrt: downloadSrt,
    downloadReel: downloadReel,
    copyAll: copyAllTranscripts,
    downloadAll: downloadAllIndividual,
    downloadZip: downloadAllZip
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
