# Language Translation Tool

A web app that translates text between 130+ languages, with language auto-detection, one-click copy and text-to-speech.

Built for **Task 1** of the CodeAlpha Artificial Intelligence internship.

## Features

- Translate between 133 languages, or let the app detect the source language
- Swap source and target with one click (the translation moves into the input box)
- Copy the translation to the clipboard
- Listen to the original text or the translation (text-to-speech in 65 languages)
- Character counter with the 5,000 character limit, and `Ctrl + Enter` to translate
- Automatic fallback to a second translation service if the first one is unavailable
- Responsive layout with light and dark themes

## How it works

```
Browser (HTML, CSS, JavaScript)
   │  POST /api/translate  {text, source, target}
   ▼
Flask server (app.py)  ── validates the request
   ▼
translator.py
   ├─ 1. Google Translate API (through the deep-translator library)
   └─ 2. MyMemory translation API (used if Google refuses the request)
   ▼
JSON response  {translation, provider, detected}  → shown on the page
```

1. The page sends the text and the two language codes to the Flask server as JSON.
2. The server checks the input (not empty, within the length limit, known languages).
3. `translator.py` sends the text to Google Translate. Google's free endpoint sometimes answers
   "429 Too Many Requests" on busy or shared networks; in that case the text goes to the MyMemory API
   instead. MyMemory accepts 500 characters per request, so longer text is split at sentence
   boundaries and joined again afterwards.
4. The translated text is returned and displayed. The small note under the result shows which
   service answered and, with auto-detect, which language was detected.

Text-to-speech uses gTTS: the server turns the text into an MP3 and the browser plays it.

## Run it

Requires Python 3.10 or newer and an internet connection.

```bash
git clone https://github.com/ajendrak742-code/CodeAlpha_LanguageTranslationTool.git
cd CodeAlpha_LanguageTranslationTool

python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

pip install -r requirements.txt
python app.py
```

Then open <http://127.0.0.1:5000> in a browser.

## Project structure

```
app.py               Flask routes: the page, /api/languages, /api/translate, /api/speak
translator.py        Calls the translation APIs (Google Translate, then MyMemory)
templates/index.html Page markup
static/style.css     Styling
static/script.js     Front-end logic: translate, swap, copy, speech
requirements.txt     Python dependencies
```

## Notes

- No API key is needed. Both services are used through their free endpoints, which have usage limits.
- MyMemory allows more free translations per day when requests include an email address. To use
  that, set the environment variable `MYMEMORY_EMAIL` before starting the app.
- The text you translate is sent to the translation service, so avoid entering confidential text.

## Tech stack

Python · Flask · deep-translator · MyMemory API · gTTS · HTML · CSS · JavaScript
