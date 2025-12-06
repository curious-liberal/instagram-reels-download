# InstaScribe

Download and transcribe Instagram Reels directly in your browser. No backend, no account required.

## What it can do
- Download Instagram Reels in high quality (single URLs)
- Transcribe Reels with OpenAI Whisper (shows language, duration, word count)
- Copy transcripts or download as TXT/SRT
- Bulk mode: paste many URLs, see progress, and download transcripts as a ZIP
- URL cleaning removes tracking params automatically

## Getting an OpenAI API key
You need your own OpenAI API key for transcription.
1) Visit https://platform.openai.com/api-keys and create a secret key.
2) Copy the key (it starts with `sk-...`).
3) In the app, click the gear icon → paste your key → Save.

## Privacy
- Your API key is stored only in your browser (localStorage).
- Media files and transcripts are processed client-side; nothing is sent to any server except:
  - Instagram media request (to fetch the video)
  - OpenAI Whisper API (for transcription) with your key

## Usage
1) Open the site.
2) Click the gear icon, add your OpenAI API key, and save.
3) Paste an Instagram Reel URL.
4) Choose Download or Transcribe.
5) For bulk, paste multiple URLs (one per line) and start the queue; download transcripts as a ZIP when done.

## Links
- Live site: https://instascribe.siteview.uk/
- Source code: https://github.com/curious-liberal/instagram-reels-download

## Screenshot
![Image](https://raw.githubusercontent.com/MrTusarRX/instagram-reels-download/refs/heads/main/Proof.png)
