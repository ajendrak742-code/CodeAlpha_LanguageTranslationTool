"""
Translation back ends.

translate() first tries the Google Translate API (through the deep-translator
library). Google sometimes rejects requests from busy or shared networks with
"429 Too Many Requests", so when that call fails the text is sent to the
MyMemory translation API instead. Either way the caller gets a translation.
"""

import os
import time

import requests
from deep_translator import GoogleTranslator

MAX_CHARS = 5000  # longest text Google Translate accepts in one request

# {"english": "en", "hindi": "hi", ...} - every language Google Translate supports
LANGUAGES = GoogleTranslator().get_supported_languages(as_dict=True)
LANGUAGE_CODES = set(LANGUAGES.values())

MYMEMORY_URL = "https://api.mymemory.translated.net/get"
MYMEMORY_MAX_CHARS = 500  # MyMemory rejects longer queries, so long text is sent in pieces
# The few language codes that MyMemory spells differently from Google
MYMEMORY_CODES = {"iw": "he", "jw": "jv"}
GOOGLE_CODES = {v: k for k, v in MYMEMORY_CODES.items()}
# Optional: MyMemory raises its free daily quota for requests that carry an email address
MYMEMORY_EMAIL = os.environ.get("MYMEMORY_EMAIL", "")

GOOGLE_RETRY_AFTER = 600  # seconds to skip Google after it refuses a request
_google_paused_until = 0.0


class TranslationError(Exception):
    """Raised with a user-friendly message when no service could translate the text."""


def translate(text, source, target):
    """Translate text. Returns {"translation", "provider", "detected"}.

    source may be "auto" to let the service detect the language; "detected"
    then holds the detected language code when the service reports it.
    """
    global _google_paused_until

    if source == target:
        return {"translation": text, "provider": None, "detected": None}

    if time.time() >= _google_paused_until:
        try:
            translated = GoogleTranslator(source=source, target=target).translate(text)
            # Google returns None when there is nothing to translate (e.g. only digits)
            return {"translation": translated or text, "provider": "Google Translate", "detected": None}
        except Exception:
            # Blocked or unreachable: use the fallback for the next few minutes
            _google_paused_until = time.time() + GOOGLE_RETRY_AFTER

    translated, detected = _translate_mymemory(text, source, target)
    return {"translation": translated, "provider": "MyMemory", "detected": detected}


# ---------- MyMemory ----------

def _translate_mymemory(text, source, target):
    """Translate with MyMemory, piece by piece. Returns (translation, detected language)."""
    source = "autodetect" if source == "auto" else MYMEMORY_CODES.get(source, source)
    target = MYMEMORY_CODES.get(target, target)
    detected = None
    parts = []

    for chunk in split_text(text, MYMEMORY_MAX_CHARS):
        core = chunk.strip()
        if not core:
            parts.append(chunk)
            continue

        translated, found = _mymemory_request(core, source, target)
        if found and source == "autodetect":
            # Keep using the detected language so every piece is treated the same way
            detected = GOOGLE_CODES.get(found, found)
            source = found
            if source == target:
                return text, detected

        # Put back the whitespace that surrounded this piece
        lead = chunk[: len(chunk) - len(chunk.lstrip())]
        trail = chunk[len(chunk.rstrip()):]
        parts.append(lead + translated + trail)

    return "".join(parts), detected


def _mymemory_request(text, source, target):
    params = {"q": text, "langpair": f"{source}|{target}"}
    if MYMEMORY_EMAIL:
        params["de"] = MYMEMORY_EMAIL

    try:
        response = requests.get(MYMEMORY_URL, params=params, timeout=15)
        data = response.json()
    except (requests.RequestException, ValueError):
        raise TranslationError("Could not reach the translation service. Check your internet connection.")

    status = str(data.get("responseStatus"))
    result = data.get("responseData") or {}
    if status == "429":
        raise TranslationError("The free daily translation limit has been reached. Please try again later.")
    if status != "200" or not result.get("translatedText"):
        raise TranslationError("The translation service could not translate this text.")

    return result["translatedText"].strip(), result.get("detectedLanguage")


def split_text(text, max_chars):
    """Cut text into pieces of at most max_chars, keeping every character.

    Prefers to cut at the end of a line or sentence, then at a space, and only
    cuts inside a word when there is no other choice.
    """
    chunks = []
    while len(text) > max_chars:
        window = text[:max_chars]
        cut = max(window.rfind(mark) for mark in ("\n", ". ", "? ", "! ", "। "))
        if cut <= 0:
            cut = window.rfind(" ")
        cut = cut + 1 if cut > 0 else max_chars
        chunks.append(text[:cut])
        text = text[cut:]
    chunks.append(text)
    return chunks
