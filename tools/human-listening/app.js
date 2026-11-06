import { validRange, emptyHumanReview, parseHumanReview, changeRange, frameRange, cutWav, clipCredit, portableReview } from './core.js';

const dataset = JSON.parse(document.getElementById('human-data').textContent);
const $ = (id) => document.getElementById(id);
const storageKey = `human-speech-review:${dataset.id}`;
let review = emptyHumanReview(dataset);
let wordIndex = 0;
let position = 1;
let context;
let sourceNode;
let referenceAudio;
let playbackToken = 0;
let viewToken = 0;
let animation;
let playhead = null;
const buffers = new Map();
const currentWord = () => dataset.words[wordIndex];
const currentSegment = () => review.words[currentWord().id].segments[position];
const message = (text) => { $('status').textContent = text; };

try {
  const saved = localStorage.getItem(storageKey);
  if (saved) review = parseHumanReview(JSON.parse(saved), dataset);
} catch { message('Browser storage is unavailable or the saved review could not be read. Export to keep this session.'); }

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(review)); }
  catch { message('Could not save in this browser. Use Export review to keep your edits.'); }
  renderProgress();
}

function getContext() {
  if (!context) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('This browser does not support the audio editor. Open this file in Safari or Chrome.');
    context = new AudioContext({ sampleRate: 44100 });
  }
  return context;
}

async function decoded(word) {
  if (!buffers.has(word.id)) {
    const bytes = Uint8Array.from(atob(word.clip.dataURL.split(',')[1]), (char) => char.charCodeAt(0));
    const promise = getContext().decodeAudioData(bytes.buffer);
    buffers.set(word.id, promise);
    promise.catch(() => buffers.delete(word.id));
  }
  return buffers.get(word.id);
}

function stop() {
  playbackToken++;
  if (sourceNode) { sourceNode.onended = null; try { sourceNode.stop(); } catch { /* Already ended. */ } sourceNode.disconnect(); sourceNode = null; }
  if (referenceAudio) { referenceAudio.pause(); referenceAudio.removeAttribute('src'); referenceAudio.load(); referenceAudio = null; }
  cancelAnimationFrame(animation);
  playhead = null;
  drawWave();
}

async function playHuman(range, label) {
  stop();
  const token = playbackToken;
  const word = currentWord();
  try {
    const audioContext = getContext();
    await audioContext.resume();
    const buffer = await decoded(word);
    if (token !== playbackToken) return;
    const [start, end] = frameRange(range, buffer.sampleRate, buffer.length);
    const node = audioContext.createBufferSource();
    node.buffer = buffer;
    node.connect(audioContext.destination);
    sourceNode = node;
    const began = audioContext.currentTime;
    node.onended = () => {
      node.disconnect();
      if (token !== playbackToken) return;
      sourceNode = null; playhead = null; cancelAnimationFrame(animation); drawWave(); message(`Played ${label}.`);
    };
    node.start(0, start / buffer.sampleRate, (end - start) / buffer.sampleRate);
    message(`Playing ${label} · original speed.`);
    const tick = () => {
      if (token !== playbackToken || !sourceNode) return;
      playhead = start / buffer.sampleRate + audioContext.currentTime - began;
      drawWave(); animation = requestAnimationFrame(tick);
    };
    tick();
  } catch (error) {
    if (token === playbackToken) { stop(); message(`Playback failed: ${error.message} Try playing again.`); }
  }
}

async function playPiper(segmentIndex) {
  stop();
  const token = playbackToken;
  const word = currentWord();
  const audio = new Audio(word.baseline[segmentIndex].dataURL);
  referenceAudio = audio;
  audio.onended = () => { if (token === playbackToken) { referenceAudio = null; message('Played the published Piper reference.'); } };
  audio.onerror = () => { if (token === playbackToken) { stop(); message('Piper reference failed to play. Try again.'); } };
  try { await audio.play(); if (token === playbackToken) message('Playing the published Piper reference.'); }
  catch (error) { if (token === playbackToken) { stop(); message(`Reference playback failed: ${error.message}`); } }
}

let waveSamples;
let waveWord;
function drawWave() {
  const canvas = $('waveform');
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const width = rect.width;
  const height = rect.height;
  const word = currentWord();
  const duration = word.clip.duration;
  const [start, end] = currentSegment().range;
  const x = (seconds) => seconds / duration * width;
  ctx.fillStyle = '#dee8aa'; ctx.fillRect(x(start), 0, x(end - start), height);
  ctx.strokeStyle = '#d0d8ca'; ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
  if (waveSamples && waveWord === word.id) {
    const columns = Math.max(1, Math.floor(width / 2));
    const stride = Math.ceil(waveSamples.length / columns);
    let maximum = 0.01;
    const peaks = [];
    for (let index = 0; index < columns; index++) {
      let peak = 0;
      for (let frame = index * stride; frame < Math.min((index + 1) * stride, waveSamples.length); frame++) peak = Math.max(peak, Math.abs(waveSamples[frame]));
      peaks.push(peak); maximum = Math.max(maximum, peak);
    }
    ctx.fillStyle = '#387763';
    peaks.forEach((peak, index) => {
      const amplitude = Math.max(0.5, peak / maximum * height * 0.42);
      ctx.fillRect(index * width / columns, height / 2 - amplitude, 1, amplitude * 2);
    });
  }
  for (const time of [start, end]) { ctx.fillStyle = '#66812f'; ctx.fillRect(Math.min(width - 2, x(time)), 0, 2, height); }
  if (playhead !== null) { ctx.fillStyle = '#c26829'; ctx.fillRect(x(playhead), 0, 2, height); }
  canvas.setAttribute('aria-label', `${word.word} recording waveform. Selected ${start.toFixed(3)} to ${end.toFixed(3)} seconds of ${duration.toFixed(3)} seconds.`);
}

function renderProgress() {
  let judged = 0;
  let total = 0;
  for (const word of dataset.words) {
    const segments = review.words[word.id].segments.slice(1);
    const count = segments.filter((segment) => segment.verdict !== 'unreviewed').length;
    judged += count; total += segments.length;
    const counter = document.querySelector(`[data-count="${word.id}"]`);
    if (counter) counter.textContent = `${count}/${segments.length}`;
  }
  $('progress').textContent = `${judged} / ${total} syllables judged`;
}

function renderBounds() {
  const word = currentWord();
  const segment = currentSegment();
  $('selection-title').textContent = position === 0 ? 'Whole word' : `“${word.syllables[position - 1]}” · syllable ${position}`;
  $('duration').textContent = `${Math.round((segment.range[1] - segment.range[0]) * 1000)} ms selected`;
  $('source-duration').textContent = `${word.clip.duration.toFixed(3)} s`;
  ['start', 'end'].forEach((name, index) => {
    for (const id of [name, `${name}-range`]) {
      $(id).max = String(Math.floor(word.clip.duration * 1000) / 1000);
      $(id).value = segment.range[index].toFixed(3);
    }
  });
  $('cut-verdict').value = segment.verdict;
  $('play-cut').textContent = position === 0 ? '▶ Listen to word cut' : `▶ Listen to “${word.syllables[position - 1]}”`;
  for (const button of $('segments').children) button.setAttribute('aria-pressed', String(Number(button.dataset.position) === position));
  drawWave();
}

function renderSegments() {
  const word = currentWord();
  $('segments').replaceChildren();
  ['Whole word', ...word.syllables].forEach((label, index) => {
    const button = document.createElement('button');
    button.dataset.position = index;
    button.setAttribute('aria-label', index === 0 ? 'Edit whole word boundaries' : `Edit syllable ${index}: ${label}`);
    const text = document.createElement('span'); text.textContent = label; text.lang = index ? 'pl' : 'en'; button.append(text);
    const verdict = review.words[word.id].segments[index].verdict;
    const small = document.createElement('small'); small.textContent = verdict === 'usable' ? 'complete' : verdict === 'needs-work' ? 'needs work' : 'unreviewed'; button.append(small);
    button.onclick = () => { stop(); position = index; renderBounds(); };
    $('segments').append(button);
  });
  renderBounds();
}

function renderCredits(word) {
  const container = $('credits'); container.replaceChildren();
  const paragraph = (text) => { const p = document.createElement('p'); p.textContent = text; container.append(p); };
  paragraph(`${word.source.title} · ${word.source.speaker}`);
  const links = document.createElement('p');
  for (const [label, href] of [['Source on Wikimedia Commons', word.source.page], [word.source.license, word.source.licenseURL]]) {
    const link = document.createElement('a'); link.href = href; link.textContent = label; link.target = '_blank'; link.rel = 'noopener noreferrer';
    if (links.childNodes.length) links.append(' · '); links.append(link);
  }
  container.append(links);
  paragraph(`Source speech: “${word.source.recordingText}”. Download SHA-256: ${word.source.sha256}`);
  paragraph(`${dataset.provenance.processing} Cuts are excerpts; overlapping boundaries are allowed. Waveform amplitude is scaled separately for each recording.`);
  paragraph(`Prepared with ${dataset.provenance.decoder}; Git ${dataset.provenance.gitSHA.slice(0, 12)}. Piper references are the exact published Gosia MP3s (CC0; model attribution in audio/NOTICE.md).`);
}

async function selectWord(index) {
  stop(); wordIndex = index; position = 1;
  const token = ++viewToken;
  const word = currentWord();
  waveSamples = null; waveWord = null;
  $('word').textContent = word.word;
  $('word-counter').textContent = `WORD ${String(index + 1).padStart(2, '0')} / ${String(dataset.words.length).padStart(2, '0')}`;
  $('speaker').textContent = `${word.source.speaker} · ${word.source.license}`;
  $('phrase-note').textContent = word.word === word.source.recordingText
    ? 'Listen to the full source recording to check the proposed word boundaries.'
    : `Excerpt from “${word.source.recordingText}”. Check the original, then adjust “Whole word” to exclude the next word.`;
  $('source-verdict').value = review.words[word.id].sourceVerdict;
  $('note').value = review.words[word.id].note;
  for (const button of $('words').children) button.setAttribute('aria-current', String(Number(button.dataset.index) === index));
  renderSegments(); renderCredits(word); renderProgress();
  try {
    const buffer = await decoded(word);
    if (token !== viewToken) return;
    waveSamples = buffer.getChannelData(0); waveWord = word.id; drawWave();
  } catch (error) { if (token === viewToken) message(`Could not decode ${word.word}: ${error.message}`); }
}

function editBoundary(name, value) {
  stop();
  const range = [...currentSegment().range];
  range[name === 'start' ? 0 : 1] = value;
  try {
    review = changeRange(review, currentWord(), position, range);
    save(); renderSegments(); message('Boundary saved. Listen again before judging this cut.');
  } catch { renderBounds(); message('Keep start before end, at least 20 ms apart, within the recording.'); }
}

function download(filename, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

dataset.words.forEach((word, index) => {
  const button = document.createElement('button'); button.dataset.index = index;
  const label = document.createElement('span'); label.textContent = word.word; label.lang = 'pl'; button.append(label);
  const counter = document.createElement('small'); counter.dataset.count = word.id; button.append(counter);
  button.onclick = () => selectWord(index); $('words').append(button);
});
$('play-word').onclick = () => playHuman([...review.words[currentWord().id].segments[0].range], `human word “${currentWord().word}”`);
$('play-source').onclick = () => playHuman([0, currentWord().clip.duration], 'the complete source recording');
$('play-cut').onclick = () => playHuman([...currentSegment().range], position === 0 ? `word “${currentWord().word}”` : `syllable “${currentWord().syllables[position - 1]}”`);
$('play-piper-word').onclick = () => playPiper(0);
$('play-piper-cut').onclick = () => playPiper(position);
$('stop').onclick = () => { stop(); message('Playback stopped.'); };
for (const name of ['start', 'end']) {
  $(name).onchange = (event) => editBoundary(name, event.target.value === '' ? NaN : Number(event.target.value));
  $(`${name}-range`).oninput = (event) => editBoundary(name, Number(event.target.value));
}
for (const button of document.querySelectorAll('[data-nudge]')) button.onclick = () => {
  const [name, delta] = button.dataset.nudge.split(':');
  editBoundary(name, Number((currentSegment().range[name === 'start' ? 0 : 1] + Number(delta)).toFixed(3)));
};
$('source-verdict').onchange = (event) => { review.words[currentWord().id].sourceVerdict = event.target.value; save(); };
$('cut-verdict').onchange = (event) => { currentSegment().verdict = event.target.value; save(); renderSegments(); };
$('note').oninput = (event) => { review.words[currentWord().id].note = event.target.value; save(); };
$('export-review').onclick = () => download('human-speech-review.json', JSON.stringify(portableReview(review, dataset), null, 2), 'application/json');
$('import-review').onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('Review file is too large');
    const imported = parseHumanReview(JSON.parse(await file.text()), dataset);
    stop(); review = imported; save(); await selectWord(wordIndex); message('Review imported for these exact recordings.');
  } catch (error) { message(`Import rejected: ${error.message}. Current edits were kept.`); }
  event.target.value = '';
};
$('download-cut').onclick = async () => {
  const word = currentWord();
  const index = position;
  const segment = structuredClone(currentSegment());
  try {
    const buffer = await decoded(word);
    const frames = frameRange(segment.range, buffer.sampleRate, buffer.length);
    const credits = clipCredit(word, segment, buffer.sampleRate, frames);
    const wav = cutWav(buffer.getChannelData(0), buffer.sampleRate, segment.range, credits);
    download(`${word.word}-${index === 0 ? 'word' : `${index}-${word.syllables[index - 1]}`}.wav`, wav, 'audio/wav');
    message('WAV exported with source and license credits in its metadata. Export review for a readable copy.');
  } catch (error) { message(`Export failed: ${error.message}`); }
};
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { stop(); message('Playback stopped.'); } });
window.addEventListener('resize', drawWave);
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
window.addEventListener('pagehide', stop);
selectWord(0);
