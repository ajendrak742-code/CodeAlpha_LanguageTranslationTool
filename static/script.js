// Language Translation Tool - front-end logic
// Talks to the Flask back end: /api/languages, /api/translate, /api/speak

const sourceLang = document.getElementById("source-lang");
const targetLang = document.getElementById("target-lang");
const sourceText = document.getElementById("source-text");
const outputText = document.getElementById("output-text");
const charCount = document.getElementById("char-count");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const translateBtn = document.getElementById("translate-btn");
const swapBtn = document.getElementById("swap-btn");
const clearBtn = document.getElementById("clear-btn");
const copyBtn = document.getElementById("copy-btn");
const speakSourceBtn = document.getElementById("speak-source");
const speakOutputBtn = document.getElementById("speak-output");

const MAX_CHARS = Number(sourceText.maxLength);
const PLACEHOLDER = '<span class="placeholder">Translation will appear here</span>';

let speechCodes = new Set();  // languages the server can read aloud
let translation = "";         // the text currently shown in the output panel
let translationLang = "";     // language of that text
let requestId = 0;            // lets us ignore replies to outdated requests
let audio = null;             // the Audio object that is currently playing
let audioBtn = null;          // the button that started it

// ---------- Setup ----------

async function loadLanguages() {
  try {
    const response = await fetch("/api/languages");
    const languages = await response.json();

    sourceLang.add(new Option("Detect language", "auto"));
    for (const lang of languages) {
      sourceLang.add(new Option(lang.name, lang.code));
      targetLang.add(new Option(lang.name, lang.code));
      if (lang.speech) speechCodes.add(lang.code);
    }

    // Restore the languages used last time (defaults: auto-detect -> Hindi)
    setIfValid(sourceLang, readSetting("source"), "auto");
    setIfValid(targetLang, readSetting("target"), "hi");
  } catch {
    showError("Could not load the language list. Is the server running?");
  }
  refreshButtons();
}

function setIfValid(select, value, fallback) {
  select.value = value || fallback;
  if (select.selectedIndex === -1) select.value = fallback;
}

function readSetting(key) {
  try { return localStorage.getItem("translator." + key); } catch { return null; }
}

function saveSetting(key, value) {
  try { localStorage.setItem("translator." + key, value); } catch { /* storage unavailable */ }
}

// ---------- Translate ----------

async function translate() {
  const text = sourceText.value.trim();
  hideError();

  if (!text) {
    showError("Please enter some text to translate.");
    sourceText.focus();
    return;
  }

  const id = ++requestId;
  const target = targetLang.value;
  setLoading(true);

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source: sourceLang.value, target }),
    });
    const data = await response.json();
    if (id !== requestId) return;  // a newer request has replaced this one

    if (!response.ok) throw new Error(data.error || "Translation failed.");

    showTranslation(data, target);
  } catch (err) {
    if (id !== requestId) return;
    const offline = err instanceof TypeError;  // fetch itself failed
    showError(offline ? "Could not reach the server. Is it still running?" : err.message);
  } finally {
    if (id === requestId) setLoading(false);
  }
}

function setLoading(isLoading) {
  translateBtn.disabled = isLoading;
  translateBtn.textContent = isLoading ? "Translating…" : "Translate";
  outputText.classList.toggle("loading", isLoading);
}

function showTranslation(data, lang) {
  stopAudio();
  translation = data.translation;
  translationLang = lang;
  outputText.textContent = data.translation;

  // Small note under the result: detected language and which service answered
  const notes = [];
  const detected = [...targetLang.options].find((o) => o.value === data.detected);
  if (detected) notes.push(`Detected ${detected.text}`);
  if (data.provider) notes.push(`via ${data.provider}`);
  statusEl.textContent = notes.join(" · ");

  refreshButtons();
}

function clearTranslation() {
  stopAudio();
  translation = "";
  translationLang = "";
  outputText.innerHTML = PLACEHOLDER;
  statusEl.textContent = "";
  refreshButtons();
}

// ---------- Copy ----------

async function copyTranslation() {
  if (!translation) return;
  try {
    await navigator.clipboard.writeText(translation);
  } catch {
    // Fallback for browsers that block the Clipboard API
    const helper = document.createElement("textarea");
    helper.value = translation;
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
  const label = copyBtn.querySelector("span");
  label.textContent = "Copied!";
  copyBtn.classList.add("done");
  setTimeout(() => {
    label.textContent = "Copy";
    copyBtn.classList.remove("done");
  }, 1500);
}

// ---------- Text-to-speech ----------

async function speak(button, text, lang) {
  const wasPlayingHere = audioBtn === button;
  stopAudio();
  if (wasPlayingHere || !text) return;  // second click on the same button = stop

  hideError();
  button.classList.add("active");
  audioBtn = button;

  try {
    const response = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Could not generate speech.");
    }
    const blob = await response.blob();
    if (audioBtn !== button) return;  // stopped while the audio was loading

    audio = new Audio(URL.createObjectURL(blob));
    audio.onended = stopAudio;
    await audio.play();
  } catch (err) {
    if (audioBtn === button) {
      stopAudio();
      showError(err instanceof TypeError ? "Could not reach the server." : err.message);
    }
  }
}

function stopAudio() {
  if (audio) {
    audio.pause();
    URL.revokeObjectURL(audio.src);
    audio = null;
  }
  if (audioBtn) {
    audioBtn.classList.remove("active");
    audioBtn = null;
  }
}

// ---------- UI helpers ----------

function swapLanguages() {
  const oldSource = sourceLang.value;
  const oldTarget = targetLang.value;

  sourceLang.value = oldTarget;
  // "Detect language" cannot be a target, so fall back to English (or Hindi)
  targetLang.value = oldSource !== "auto" ? oldSource : (oldTarget === "en" ? "hi" : "en");
  saveSetting("source", sourceLang.value);
  saveSetting("target", targetLang.value);

  // Move the translation into the input box so it can be translated back
  if (translation) {
    sourceText.value = translation.slice(0, MAX_CHARS);
    clearTranslation();
    updateCount();
    translate();
  }
  refreshButtons();
}

function updateCount() {
  charCount.textContent = `${sourceText.value.length} / ${MAX_CHARS}`;
}

function refreshButtons() {
  const hasInput = sourceText.value.trim().length > 0;
  const hasOutput = translation.length > 0;

  clearBtn.disabled = !hasInput && !hasOutput;
  copyBtn.disabled = !hasOutput;

  speakSourceBtn.disabled = !hasInput || !speechCodes.has(sourceLang.value);
  speakSourceBtn.title = sourceLang.value === "auto"
    ? "Choose a source language to listen"
    : speechCodes.has(sourceLang.value) ? "Listen" : "Speech is not available for this language";

  speakOutputBtn.disabled = !hasOutput || !speechCodes.has(translationLang);
  speakOutputBtn.title = !hasOutput || speechCodes.has(translationLang)
    ? "Listen"
    : "Speech is not available for this language";
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function hideError() {
  errorEl.hidden = true;
}

// ---------- Events ----------

translateBtn.addEventListener("click", translate);
swapBtn.addEventListener("click", swapLanguages);
copyBtn.addEventListener("click", copyTranslation);
speakSourceBtn.addEventListener("click", () => speak(speakSourceBtn, sourceText.value.trim(), sourceLang.value));
speakOutputBtn.addEventListener("click", () => speak(speakOutputBtn, translation, translationLang));

clearBtn.addEventListener("click", () => {
  requestId++;  // ignore any translation still in flight
  setLoading(false);
  sourceText.value = "";
  hideError();
  clearTranslation();
  updateCount();
  sourceText.focus();
});

sourceText.addEventListener("input", () => {
  updateCount();
  refreshButtons();
});

sourceText.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    translate();
  }
});

sourceLang.addEventListener("change", () => {
  saveSetting("source", sourceLang.value);
  refreshButtons();
});

targetLang.addEventListener("change", () => {
  saveSetting("target", targetLang.value);
  if (sourceText.value.trim()) translate();  // re-translate into the new language
});

updateCount();
loadLanguages();
