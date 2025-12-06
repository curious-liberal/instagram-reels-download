  // Clean Instagram URL by removing tracking parameters
  function cleanInstagramUrl(url) {
    if (!url) return url;
    // Remove everything after ? (tracking parameters)
    return url.split('?')[0];
  }

  // Download mode input handlers
  const input = document.getElementById('instagramReelUrl');
  const pasteBtn = document.getElementById('pasteButton');
  const clearBtn = document.getElementById('clearButton');

  if (input && pasteBtn && clearBtn) {
    input.addEventListener('input', () => {
      // Clean URL on input
      const cleaned = cleanInstagramUrl(input.value);
      if (cleaned !== input.value) {
        input.value = cleaned;
      }
      clearBtn.classList.toggle('hidden', input.value.trim() === '');
    });

    pasteBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        input.value = cleanInstagramUrl(text);
        input.dispatchEvent(new Event('input'));
      } catch (err) {
        alert('Clipboard access not allowed. Please paste manually.');
      }
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      input.dispatchEvent(new Event('input'));
      input.focus();
    });
  }

  // Transcribe mode input handlers
  const transcribeInput = document.getElementById('transcribeReelUrl');
  const pasteTranscribeBtn = document.getElementById('pasteTranscribeButton');
  const clearTranscribeBtn = document.getElementById('clearTranscribeButton');

  if (transcribeInput && pasteTranscribeBtn && clearTranscribeBtn) {
    transcribeInput.addEventListener('input', () => {
      // Clean URL on input
      const cleaned = cleanInstagramUrl(transcribeInput.value);
      if (cleaned !== transcribeInput.value) {
        transcribeInput.value = cleaned;
      }
      clearTranscribeBtn.classList.toggle('hidden', transcribeInput.value.trim() === '');
    });

    pasteTranscribeBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        transcribeInput.value = cleanInstagramUrl(text);
        transcribeInput.dispatchEvent(new Event('input'));
      } catch (err) {
        alert('Clipboard access not allowed. Please paste manually.');
      }
    });

    clearTranscribeBtn.addEventListener('click', () => {
      transcribeInput.value = '';
      transcribeInput.dispatchEvent(new Event('input'));
      transcribeInput.focus();
    });
  }

// Footer date removed per user request