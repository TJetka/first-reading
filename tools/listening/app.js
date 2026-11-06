import { ISSUES, trialOrder, reviewKey, emptyReview, parseReview, reviewCSV } from './core.js';

const dataset = JSON.parse(document.querySelector('#lab-data').textContent);
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (text) => String(text).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const storageKey = `syllable-lab:${dataset.id}`;
let review = emptyReview(dataset.id);
let currentId = dataset.cases[0].id;
let player = null;
let playbackToken = 0;
let context;
const imported = new Map();
const heard = new Set();
const waveCache = new Map();

function status(message, error = false) { $('#status').textContent = message; $('#status').classList.toggle('error', error); }
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) review = parseReview(JSON.parse(saved), dataset);
} catch { status('Browser storage is unavailable or the saved review is invalid. Export your review before closing.', true); }

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(review)); }
  catch { status('Could not save in this browser. Export your review to preserve these ratings.', true); }
}
function current() { return dataset.cases.find((item) => item.id === currentId); }
function filtered() {
  const query = $('#search').value.trim().toLocaleLowerCase('pl');
  return dataset.cases.filter((item) => `${item.text} ${item.word}`.toLocaleLowerCase('pl').includes(query)
    && (!$('#pending').checked || !review.winners[item.id]));
}
function candidates(item) {
  const variants = trialOrder(item.id, dataset.variants);
  const result = variants.map((variant, index) => ({ ...variant, ...item.clips[variant.id], letter: String.fromCharCode(65 + index) }));
  if (imported.has(item.id)) result.push({ id: 'external', label: imported.get(item.id).label,
    description: 'Your imported comparison clip.', ...imported.get(item.id), letter: 'E' });
  return result;
}
function stop() {
  playbackToken += 1;
  if (player) { player.pause(); player.removeAttribute('src'); player.load(); player = null; }
  document.querySelectorAll('[data-action="play"], [data-action="word"]').forEach((button) => button.setAttribute('aria-pressed', 'false'));
}
function play(clip, button, label) {
  stop();
  const token = playbackToken;
  player = new Audio(clip.dataURL);
  button?.setAttribute('aria-pressed', 'true');
  const finish = (failed) => {
    if (token !== playbackToken) return;
    button?.setAttribute('aria-pressed', 'false');
    if (failed) status(`Could not play ${label}. Try again or import another file.`, true);
    else status(`Finished ${label}. Rate the sound, then choose a preference.`);
  };
  player.onended = () => finish(false);
  player.onerror = () => finish(true);
  try {
    const promise = player.play();
    promise?.then(() => { if (token === playbackToken) { heard.add(clip.sha256); status(`Playing ${label}…`); } }).catch(() => finish(true));
  } catch { finish(true); }
}

function renderQueue() {
  const items = filtered();
  $('#queue').innerHTML = items.map((item) => `<button class="queue-item" data-case="${item.id}" aria-current="${item.id === currentId}"><span><strong lang="pl">${escapeHTML(item.text)}</strong><small lang="pl">${escapeHTML(item.word)}</small></span><span class="done" aria-label="${review.winners[item.id] ? 'Reviewed' : 'Unreviewed'}">${review.winners[item.id] ? '✓' : '·'}</span></button>`).join('') || '<p class="empty">No matching trials.</p>';
  const count = Object.keys(review.winners).length;
  $('#progress').textContent = `${count} / ${dataset.cases.length}`;
  $('#progress-bar').max = dataset.cases.length;
  $('#progress-bar').value = count;
}
function render() {
  renderQueue();
  const item = current();
  const blind = $('#blind').checked;
  const clips = candidates(item);
  const position = dataset.cases.indexOf(item);
  $('#trial').innerHTML = `<section aria-label="Current trial"><div class="trial-header"><div><div class="trial-label">TRIAL ${String(position + 1).padStart(2, '0')} / ${dataset.cases.length} · ${item.id}</div><h2 class="word-line" lang="pl">${item.syllables.map((text, index) => index === item.position ? `<mark>${escapeHTML(text)}</mark>` : escapeHTML(text)).join(' · ')}</h2></div><button data-action="word" aria-pressed="false">▶ Hear whole word</button></div>
    <div class="samples">${clips.map((clip, index) => {
      const key = reviewKey(item.id, clip.id, clip.sha256);
      const rating = review.ratings[key];
      return `<article class="sample ${review.winners[item.id] === key ? 'preferred' : ''}"><div class="sample-top"><span class="sample-id">SAMPLE ${clip.letter}</span><span class="duration">${blind ? 'Method hidden' : `${Math.round(clip.durationSeconds * 1000)} ms of source audio`}</span></div><p class="method">${blind ? `Listen to sample ${clip.letter}` : escapeHTML(clip.label)}</p><p class="method-detail">${blind ? 'Listen first. Compare the sound in the highlighted word.' : escapeHTML(clip.description)}</p><button class="play" data-action="play" data-index="${index}" aria-label="Play sample ${clip.letter}" aria-pressed="false"><span class="sound-text" lang="pl">${escapeHTML(item.text)}</span><span>▶ Play <small>${index + 1}</small></span></button><canvas data-wave="${index}" aria-hidden="true"></canvas><p class="rating-label">Clarity · 1 poor → 5 clear and complete</p><div class="ratings" role="group" aria-label="Clarity for sample ${clip.letter}">${[1, 2, 3, 4, 5].map((score) => `<button class="score" data-action="rate" data-index="${index}" data-value="${score}" aria-label="Sample ${clip.letter}: ${score} of 5" aria-pressed="${rating?.score === score}">${score}</button>`).join('')}</div><div class="issues" role="group" aria-label="Issues for sample ${clip.letter}">${ISSUES.map((issue) => `<button class="issue" data-action="issue" data-index="${index}" data-value="${issue}" aria-pressed="${rating?.issues.includes(issue) ?? false}">${issue}</button>`).join('')}</div><button class="prefer" data-action="prefer" data-index="${index}" aria-pressed="${review.winners[item.id] === key}">${review.winners[item.id] === key ? '✓ Preferred sample' : 'Choose this sample'}</button></article>`;
    }).join('')}</div>
    ${review.imports[item.id] ? '<button class="quiet" data-action="remove-import">Remove imported clip</button>' : ''}
    ${review.imports[item.id] && !imported.has(item.id) ? '<p class="missing">This trial has an imported clip in its review. Reimport the same file to listen again; its previous ratings are preserved.</p>' : ''}
    <div class="notes"><label for="notes">What did you hear?</label><textarea id="notes" maxlength="2000" placeholder="For example: clear vowel, but the initial consonant is clipped…">${escapeHTML(review.notes[item.id] ?? '')}</textarea></div><div class="trial-bottom"><button class="quiet none" data-action="none" aria-pressed="${review.winners[item.id] === 'none'}">None are good enough</button><label class="file-button quiet">Add a clip for this syllable<input id="single-clip" aria-label="Add clip for current syllable" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"></label><div class="pager"><button data-action="previous" ${position === 0 ? 'disabled' : ''}>← Previous</button><button data-action="next" ${position === dataset.cases.length - 1 ? 'disabled' : ''}>Next →</button></div></div></section>`;
  $('#notes').addEventListener('input', (event) => { review.notes[item.id] = event.target.value; save(); });
  $('#single-clip').addEventListener('change', (event) => importFiles(event.target.files, item.id));
  drawWaves(clips);
}
function navigate(id) { stop(); currentId = id; render(); }
function move(offset) {
  const list = $('#pending').checked ? filtered() : dataset.cases;
  const index = list.findIndex((item) => item.id === currentId);
  const next = list[index < 0 ? 0 : index + offset];
  if (next) navigate(next.id);
}

$('#queue').addEventListener('click', (event) => { const button = event.target.closest('[data-case]'); if (button) navigate(button.dataset.case); });
$('#trial').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const item = current();
  const action = button.dataset.action;
  const clip = candidates(item)[Number(button.dataset.index)];
  if (action === 'play') { play(clip, button, `sample ${clip.letter}`); return; }
  if (action === 'word') { play(item.wordClip, button, item.word); return; }
  if (action === 'previous' || action === 'next') { move(action === 'next' ? 1 : -1); return; }
  stop();
  if (action === 'remove-import') {
    imported.delete(item.id);
    delete review.imports[item.id];
    if (review.winners[item.id]?.includes(':external:')) delete review.winners[item.id];
  } else if (action === 'none') {
    if (review.winners[item.id] === 'none') delete review.winners[item.id];
    else review.winners[item.id] = 'none';
  } else {
    const key = reviewKey(item.id, clip.id, clip.sha256);
    const rating = review.ratings[key] ?? { score: null, issues: [] };
    if (action === 'rate') rating.score = rating.score === Number(button.dataset.value) ? null : Number(button.dataset.value);
    if (action === 'issue') {
      const issue = button.dataset.value;
      rating.issues = rating.issues.includes(issue) ? rating.issues.filter((value) => value !== issue) : [...rating.issues, issue];
    }
    if (action === 'prefer') {
      if (review.winners[item.id] === key) delete review.winners[item.id];
      else review.winners[item.id] = key;
    }
    review.ratings[key] = rating;
  }
  save(); render();
  const selector = `[data-action="${action}"]${button.dataset.index ? `[data-index="${button.dataset.index}"]` : ''}${button.dataset.value ? `[data-value="${button.dataset.value}"]` : ''}`;
  $('#trial').querySelector(selector)?.focus({ preventScroll: true });
});
$('#blind').addEventListener('change', () => { stop(); render(); });
for (const selector of ['#pending', '#search']) $(selector).addEventListener('input', renderQueue);

function bytesFromURL(url) { return Uint8Array.from(atob(url.split(',')[1]), (character) => character.charCodeAt(0)); }
async function decode(data) { context ??= new AudioContext(); return context.decodeAudioData(data.slice(0)); }
async function drawWaves(clips) {
  const id = currentId;
  await Promise.all(clips.map(async (clip, index) => {
    try {
      if (!waveCache.has(clip.sha256)) {
        const buffer = await decode(bytesFromURL(clip.dataURL).buffer);
        const data = buffer.getChannelData(0);
        const peaks = Array.from({ length: 90 }, (_, n) => {
          let peak = 0;
          const end = Math.floor((n + 1) * data.length / 90);
          for (let at = Math.floor(n * data.length / 90); at < end; at += 1) peak = Math.max(peak, Math.abs(data[at]));
          return peak;
        });
        waveCache.set(clip.sha256, peaks);
      }
      if (currentId !== id) return;
      const canvas = document.querySelector(`[data-wave="${index}"]`);
      if (!canvas) return;
      canvas.width = 540; canvas.height = 76;
      const paint = canvas.getContext('2d');
      paint.fillStyle = '#8aa896';
      waveCache.get(clip.sha256).forEach((peak, n) => paint.fillRect(n * 6, 38 - Math.max(1, peak * 33), 3, Math.max(2, peak * 66)));
    } catch { /* Playback has its own visible error state. */ }
  }));
}

function download(name, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#export-json').addEventListener('click', () => {
  download('syllable-review.json', JSON.stringify({ ...review, exportedAt: new Date().toISOString(),
    heardAudioHashes: [...heard] }, null, 2), 'application/json');
  status('Review exported. It contains ratings, notes and audio hashes; no audio files.');
});
$('#export-csv').addEventListener('click', () => download('syllable-review.csv', '\ufeff' + reviewCSV(dataset, review), 'text/csv;charset=utf-8'));
$('#download-list').addEventListener('click', () => download('comparison-samples.json', JSON.stringify(dataset.cases.map((item) => ({
  id: item.id, filename: `${item.id}.mp3`, word: item.word, syllable: item.text, syllablePosition: item.position + 1,
})), null, 2), 'application/json'));
$('#import-review').addEventListener('change', async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 1_000_000) throw new Error('Review file exceeds 1 MB.');
    const incoming = parseReview(JSON.parse(await file.text()), dataset);
    // Merge explicit imported fields; do not discard unrelated in-browser work.
    for (const field of ['ratings', 'winners', 'notes', 'imports']) Object.assign(review[field], incoming[field]);
    save(); stop(); render(); status('Review imported. Existing unrelated ratings were kept.');
  } catch (error) { status(error.message, true); }
  event.target.value = '';
});
async function importFiles(files, singleId = null) {
  let count = 0;
  const errors = [];
  const label = $('#voice-label').value.trim() || 'External voice';
  for (const file of files) {
    try {
      const id = singleId ?? file.name.replace(/\.(mp3|wav)$/i, '');
      if (!dataset.cases.some((item) => item.id === id)) throw new Error(`${file.name}: no matching trial ID`);
      if (!/\.(mp3|wav)$/i.test(file.name) || file.size > 2_000_000) throw new Error(`${file.name}: use MP3/WAV under 2 MB`);
      const bytes = await file.arrayBuffer();
      const decoded = await decode(bytes);
      if (!Number.isFinite(decoded.duration) || decoded.duration < 0.03 || decoded.duration > 15) throw new Error(`${file.name}: expected a clip shorter than 15 seconds`);
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const dataURL = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Cannot read clip')); reader.readAsDataURL(file); });
      const existing = review.imports[id];
      if (existing && existing.sha256 !== sha256 && review.winners[id]?.includes(':external:')) delete review.winners[id];
      review.imports[id] = { label, filename: file.name, sha256 };
      imported.set(id, { ...review.imports[id], dataURL, durationSeconds: decoded.duration });
      count += 1;
    } catch (error) { errors.push(error.message); }
  }
  save(); stop(); render();
  status(`Imported ${count} clip${count === 1 ? '' : 's'}. ${errors.join('; ') || 'Audio stays in this tab; export preserves the review, not the audio.'}`, errors.length > 0);
}
$('#import-clips').addEventListener('change', (event) => importFiles(event.target.files));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { stop(); return; }
  if (event.target.closest('input, textarea, button, summary') || event.ctrlKey || event.metaKey || event.altKey) return;
  if (/^[1-5]$/.test(event.key)) { const button = document.querySelector(`[data-action="play"][data-index="${Number(event.key) - 1}"]`); button?.click(); event.preventDefault(); }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { move(event.key === 'ArrowLeft' ? -1 : 1); event.preventDefault(); }
});
window.addEventListener('pagehide', stop);
render();
