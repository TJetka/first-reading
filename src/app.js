import { validateCatalogue } from './catalogue.js';
import { AudioController } from './audio.js';
import { currentWord, drawRound, initialState, transition } from './round.js';

const app = document.querySelector('#app');
const homeButton = document.querySelector('#home-button');
const dialog = document.querySelector('#exit-dialog');
const announcement = document.querySelector('#announcement');
let state = initialState();
let catalogue;
let buildInfo;
let loadError = false;
let homeError = false;
let playingToken = null;
let announcedCard = '';

const paths = {
  play: '<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4Z"/><path d="M17 8q5 4 0 8m3-11q7 7 0 14"/>',
  repeat: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  next: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  hand: '<path d="M8 13V5a2 2 0 0 1 4 0v6l2-1 5 2v5l-4 5h-5l-6-7q-1-3 2-2l2 2"/>',
  home: '<path d="m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9"/>',
};
function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`; }
function button(action, label, name, variant = 'primary', extra = '') {
  return `<button type="button" class="button ${variant}" data-action="${action}" ${extra}>${icon(name)}<span>${label}</span></button>`;
}
function mascot() {
  return `<div class="mascot" aria-hidden="true"><svg viewBox="0 0 150 120">
    <path d="m15 48-7-4m125-9 8-6M33 12l-3-7m90 86 9 4" stroke="#cc7655" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="76" cy="111" rx="47" ry="5" fill="#e4e6d8"/>
    <path d="M31 31Q51 21 75 33q24-12 44-2v65q-24-8-44 3-21-11-44-3Z" fill="#e9c963" stroke="#243b33" stroke-width="3"/>
    <path d="M27 23q26-10 48 7 22-17 48-7v64q-24-6-48 10-24-16-48-10Z" fill="#fff7dc" stroke="#243b33" stroke-width="3" stroke-linejoin="round"/>
    <path d="M75 31v63M46 98l-4 11m63-11 4 11" stroke="#243b33" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="55" cy="57" rx="3" ry="4" fill="#243b33"/><ellipse cx="95" cy="57" rx="3" ry="4" fill="#243b33"/>
    <path d="M65 68q10 13 20 0" fill="none" stroke="#243b33" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="45" cy="68" rx="7" ry="4" fill="#edb59b"/><ellipse cx="105" cy="68" rx="7" ry="4" fill="#edb59b"/>
  </svg></div>`;
}

const audio = new AudioController({
  onEnd: (token) => dispatch({ type: 'audioEnd', token }),
  onError: (token) => dispatch({ type: 'audioError', token }),
  onPlaying: (token) => { playingToken = token; updateHighlight(); },
});

function homeView() {
  return `<section class="home" aria-labelledby="home-title">
    ${mascot()}<p class="eyebrow">Małe kroki, wielkie słowa</p>
    <h1 id="home-title">Czytam<br><em>po kawałku.</em></h1>
    <p class="subtitle">Po jednej sylabie.<br>Spokojnie, w swoim tempie.</p>
    <fieldset><legend>Od czego zaczynamy?</legend><div class="levels">
      ${buildInfo.levels.map((level) => `<label class="level"><input type="radio" name="level" value="${level}" ${state.level === level ? 'checked' : ''}>
        <span><strong>${level === 1 ? 'Proste słowa' : 'Trudniejsze słowa'}</strong><small>${level === 1 ? 'kot, mama, malina' : 'miś, szafa, ślimaczek'}</small></span></label>`).join('')}
    </div></fieldset>
    ${homeError ? '<p role="alert">Nie udało się wczytać słów. Spróbuj ponownie.</p>' : ''}
    ${homeError ? button('reload', 'Spróbuj ponownie', 'repeat') : button('start', 'Start', 'play', 'primary start')}
    <p class="home-note">12 słów. Tyle czasu, ile potrzebujesz.</p>
    ${buildInfo.mode === 'public-preview' ? '<p class="preview-note">Wersja próbna. Czytaj razem z dorosłym.</p>' : ''}
  </section>`;
}

function roundView() {
  const word = currentWord(state);
  const split = state.mode === 'reading';
  const dots = Array.from({ length: 12 }, (_, index) => `<i class="${index < state.index ? 'done' : index === state.index ? 'current' : ''}"></i>`).join('');
  let actions = '';
  if (split) actions = button('check', 'Sprawdź', 'speaker');
  else if (state.mode === 'ready') actions = button('retry', 'Powtórz', 'repeat', 'secondary') + button('next', 'Super', 'next');
  else if (!state.error) actions = button('waiting', 'Słuchaj…', 'speaker', 'primary', 'disabled aria-busy="true"');
  return `<section class="practice" aria-label="Czytanie słowa">
    <div class="progress"><span>${state.index + 1} z 12</span><span class="progress-dots" aria-hidden="true">${dots}</span></div>
    <h1 class="reading-label">${split ? 'Spróbuj przeczytać' : state.mode === 'ready' ? 'Tak brzmi całe słowo' : 'Posłuchaj całego słowa'}</h1>
    <div class="word-space"><div class="word ${split ? '' : 'joined'}" ${split ? '' : `aria-label="${word.word}"`}>
      ${word.syllables.map((syllable, index) => split
        ? `<button class="syllable" type="button" data-action="syllable" data-index="${index}" aria-label="Posłuchaj sylaby „${syllable.text}”">${syllable.text}</button>`
        : `<span class="joined-part" aria-hidden="true">${syllable.text}</span>`).join('')}
    </div></div>
    <p class="help">${split ? icon(state.index === 0 ? 'hand' : 'speaker') + 'Dotknij sylaby, żeby jej posłuchać.' : 'Czytaj w swoim tempie.'}</p>
    ${state.error ? `<div class="audio-error" role="alert"><p>Nie udało się odtworzyć dźwięku.</p>${button('retryAudio', 'Spróbuj ponownie', 'speaker', 'secondary')}</div>` : ''}
    <div class="actions">${actions}</div>
  </section>`;
}

function finishView() {
  return `<section class="finished">${mascot()}<p class="eyebrow">Kawałek po kawałku</p><h1>Brawo!</h1>
    <p class="subtitle">12 słów za Tobą!</p><div class="actions">${button('start', 'Jeszcze raz', 'repeat')}${button('home', 'Na start', 'home', 'secondary')}</div></section>`;
}

/** Compute size from the split word in both modes so checking does not move/resize it. */
function fitWord() {
  const element = app.querySelector('.word');
  if (!element) return;
  const word = currentWord(state);
  const available = app.querySelector('.word-space').clientWidth;
  const mobile = matchMedia('(max-width: 600px)').matches;
  const padding = mobile ? 20 : 38;
  const gap = mobile ? 5 : 8;
  const context = document.createElement('canvas').getContext('2d');
  const family = getComputedStyle(element).fontFamily;
  let size = mobile ? 76 : 96;
  while (size > 24) {
    context.font = `700 ${size}px ${family}`;
    const width = word.syllables.reduce((sum, syllable) => sum + Math.max(48,
      context.measureText(syllable.text).width + padding), 0) + gap * (word.syllables.length - 1);
    if (width <= available) break;
    size -= 1;
  }
  element.style.fontSize = `${size}px`;
}

function updateHighlight() {
  for (const tile of app.querySelectorAll('.syllable')) {
    tile.classList.toggle('playing', state.active?.kind === 'syllable'
      && state.active.token === playingToken && Number(tile.dataset.index) === state.active.index);
  }
}

function render(previous) {
  const focused = document.activeElement;
  const action = focused?.dataset?.action;
  const index = focused?.dataset?.index;
  homeButton.hidden = state.screen !== 'round';
  if (loadError) {
    app.innerHTML = `<section class="load-error"><p role="alert">Nie udało się wczytać słów. Spróbuj ponownie.</p>${button('reload', 'Spróbuj ponownie', 'repeat')}</section>`;
    return;
  }
  app.innerHTML = state.screen === 'home' ? homeView() : state.screen === 'round' ? roundView() : finishView();
  fitWord();
  updateHighlight();
  const card = state.screen === 'round' ? `${state.index}:${currentWord(state).id}` : state.screen;
  if (card !== announcedCard) {
    announcement.textContent = state.screen === 'round' ? `Słowo ${state.index + 1} z 12` : state.screen === 'finished' ? 'Brawo! 12 słów za Tobą!' : '';
    announcedCard = card;
  }
  if (state.exiting && !dialog.open) dialog.showModal();
  if (!state.exiting && dialog.open) dialog.close();
  if (state.exiting) return;
  const changedCard = previous && (previous.screen !== state.screen || previous.index !== state.index);
  if (changedCard) app.querySelector('button, input')?.focus({ preventScroll: true });
  else if ((previous?.mode === 'checking' && state.mode === 'ready')
    || (!previous?.error && state.error)) {
    if (focused !== homeButton) app.querySelector('[data-action="retryAudio"], [data-action="retry"]')?.focus({ preventScroll: true });
  }
  else if (action) {
    const selector = `[data-action="${action}"]${index === undefined ? '' : `[data-index="${index}"]`}`;
    const target = app.querySelector(selector) ?? app.querySelector('[data-action="retryAudio"], [data-action="retry"], [data-action="check"]');
    target?.focus({ preventScroll: true });
  }
}

function dispatch(event) {
  const previous = state;
  state = transition(state, event);
  if (state === previous) return;
  if (state.request !== previous.request) { audio.stop(); playingToken = null; }
  render(previous);
  if (state.active && state.active.token !== previous.active?.token) audio.play(state.active);
  if (previous.index !== state.index || previous.screen !== state.screen) {
    audio.preload(state.screen === 'round' ? state.words.slice(state.index, state.index + 2) : []);
  }
}

function startRound() {
  if (!['home', 'finished'].includes(state.screen)) return;
  try {
    const words = drawRound(catalogue.words, state.level);
    homeError = false;
    dispatch({ type: 'start', words });
  } catch {
    state = { ...initialState(state.level), request: state.request + 1 };
    homeError = true;
    render();
  }
}

app.addEventListener('click', (event) => {
  const target = event.target.closest('button[data-action]');
  if (!target || target.disabled) return;
  const type = target.dataset.action;
  if (type === 'reload') { load(); return; }
  if (type === 'start') { startRound(); return; }
  dispatch({ type, index: Number(target.dataset.index) });
});
app.addEventListener('change', (event) => {
  if (event.target.name === 'level') {
    // Preserve the native radio's focus while selecting it.
    state = transition(state, { type: 'level', level: Number(event.target.value) });
  }
});
homeButton.addEventListener('click', () => dispatch({ type: 'exit' }));
document.querySelector('#continue-button').addEventListener('click', () => dispatch({ type: 'continue' }));
document.querySelector('#end-button').addEventListener('click', () => dispatch({ type: 'confirmExit' }));
dialog.addEventListener('cancel', (event) => { event.preventDefault(); dispatch({ type: 'continue' }); });
window.addEventListener('resize', fitWord);
window.addEventListener('pagehide', () => audio.dispose());

async function load() {
  loadError = false;
  homeError = false;
  try {
    let rawCatalogue;
    const embedded = document.querySelector('#preview-data');
    if (embedded) {
      const data = JSON.parse(embedded.textContent);
      if (data.buildInfo.mode !== 'preview') throw new Error('Embedded data is preview-only');
      buildInfo = data.buildInfo;
      rawCatalogue = data.catalogue;
    } else {
      const [catalogueResponse, infoResponse] = await Promise.all([
        fetch(new URL('./word-catalogue.json', document.baseURI), { cache: 'no-store' }),
        fetch(new URL('./build-info.json', document.baseURI), { cache: 'no-store' }),
      ]);
      if (!catalogueResponse.ok || !infoResponse.ok) throw new Error('Load failed');
      buildInfo = await infoResponse.json();
      rawCatalogue = await catalogueResponse.json();
    }
    if (!Array.isArray(buildInfo.levels) || !buildInfo.levels.length || buildInfo.levels.some((level) => ![1, 2].includes(level))) throw new Error('Invalid levels');
    catalogue = validateCatalogue(rawCatalogue, { allowDraftAudio: buildInfo.mode === 'preview' });
    state = initialState(buildInfo.levels.includes(state.level) ? state.level : buildInfo.levels[0]);
  } catch { loadError = true; }
  render();
}
load();
