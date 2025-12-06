  // Download mode input handlers
  const input = document.getElementById('instagramReelUrl');
  const pasteBtn = document.getElementById('pasteButton');
  const clearBtn = document.getElementById('clearButton');

  if (input && pasteBtn && clearBtn) {
    input.addEventListener('input', () => {
      clearBtn.classList.toggle('hidden', input.value.trim() === '');
    });

    pasteBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        input.value = text;
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
      clearTranscribeBtn.classList.toggle('hidden', transcribeInput.value.trim() === '');
    });

    pasteTranscribeBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        transcribeInput.value = text;
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

const footerDate = document.getElementById('footerDate');

  function updateFooterDate() {
    const now = new Date();
    
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    };
    
    footerDate.textContent = now.toLocaleString('en-US', options);
  }

  updateFooterDate();  
  setInterval(updateFooterDate, 1000);