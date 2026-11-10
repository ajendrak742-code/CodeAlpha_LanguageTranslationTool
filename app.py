"""
Language Translation Tool
CodeAlpha Artificial Intelligence Internship - Task 1

A small Flask web app. The browser sends text plus a source and target
language to this server, the server forwards it to a translation API
(see translator.py) and sends the translated text back to the page.

Run:  python app.py   then open http://127.0.0.1:5000
"""

import io

from flask import Flask, jsonify, render_template, request, send_file
from gtts import gTTS
from gtts.lang import tts_langs

from translator import LANGUAGE_CODES, LANGUAGES, MAX_CHARS, TranslationError, translate

app = Flask(__name__)

# Languages the text-to-speech engine can pronounce (a subset of the translation languages)
TTS_CODES = set(tts_langs())


def tts_code(code):
    """Map a translation language code to one gTTS understands, or None."""
    if code in TTS_CODES:
        return code
    base = code.split("-")[0]  # e.g. "zh-CN" -> "zh"
    return base if base in TTS_CODES else None


@app.route("/")
def index():
    return render_template("index.html", max_chars=MAX_CHARS)


@app.route("/api/languages")
def languages():
    """List of languages for the two dropdowns."""
    items = [
        {"code": code, "name": name.title(), "speech": tts_code(code) is not None}
        for name, code in sorted(LANGUAGES.items())
    ]
    return jsonify(items)


@app.route("/api/translate", methods=["POST"])
def translate_text():
    data = request.get_json(silent=True) or {}
    text = str(data.get("text") or "").strip()
    source = data.get("source") or "auto"
    target = data.get("target") or ""

    # Validate the request before calling the API
    if not text:
        return jsonify(error="Please enter some text to translate."), 400
    if len(text) > MAX_CHARS:
        return jsonify(error=f"Text is too long (limit is {MAX_CHARS} characters)."), 400
    if source != "auto" and source not in LANGUAGE_CODES:
        return jsonify(error="Unknown source language."), 400
    if target not in LANGUAGE_CODES:
        return jsonify(error="Please choose a target language."), 400

    try:
        result = translate(text, source, target)
    except TranslationError as exc:
        return jsonify(error=str(exc)), 502

    return jsonify(result)


@app.route("/api/speak", methods=["POST"])
def speak():
    """Text-to-speech: returns an MP3 of the given text spoken in the given language."""
    data = request.get_json(silent=True) or {}
    text = str(data.get("text") or "").strip()
    lang = tts_code(str(data.get("lang") or ""))

    if not text:
        return jsonify(error="Nothing to read aloud."), 400
    if lang is None:
        return jsonify(error="Speech is not available for this language."), 400

    try:
        audio = io.BytesIO()
        gTTS(text=text[:MAX_CHARS], lang=lang).write_to_fp(audio)
        audio.seek(0)
    except Exception:
        return jsonify(error="Could not generate speech. Check your internet connection."), 502

    return send_file(audio, mimetype="audio/mpeg")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
