/** One active media element. Every request owns its events and cancellation token. */
export class AudioController {
  constructor({ createAudio = () => new Audio(), baseURL = document.baseURI,
    onEnd = () => {}, onError = () => {}, onPlaying = () => {} } = {}) {
    this.createAudio = createAudio;
    this.baseURL = baseURL;
    this.onEnd = onEnd;
    this.onError = onError;
    this.onPlaying = onPlaying;
    this.generation = 0;
    this.active = null;
    this.preloads = new Map();
  }

  stop() {
    this.generation += 1;
    if (!this.active) return;
    const media = this.active;
    this.active = null;
    media.onended = null;
    media.onerror = null;
    media.onplaying = null;
    media.pause();
    media.removeAttribute('src');
    media.load();
  }

  /** Called synchronously from a user gesture, including retries on mobile Safari. */
  play(request) {
    this.stop();
    const generation = this.generation;
    let media;
    const isCurrent = () => generation === this.generation && this.active === media;
    const finish = (callback) => {
      if (!isCurrent()) return;
      this.stop();
      callback(request.token);
    };
    try {
      media = this.createAudio();
      this.active = media;
      media.src = new URL(request.path, this.baseURL).href;
      media.onended = () => finish(this.onEnd);
      media.onerror = () => finish(this.onError);
      media.onplaying = () => { if (isCurrent()) this.onPlaying(request.token); };
      const started = media.play();
      Promise.resolve(started).catch(() => finish(this.onError));
    } catch {
      if (generation === this.generation) {
        this.stop();
        this.onError(request.token);
      }
    }
  }

  /** Keep only the current and next card's clips; preload never starts playback. */
  preload(words) {
    const paths = new Set(words.flatMap((word) => [word.wordAudio, ...word.syllables.map((s) => s.audio)]));
    for (const [path, media] of this.preloads) {
      if (!paths.has(path)) { media.removeAttribute('src'); media.load(); this.preloads.delete(path); }
    }
    for (const path of paths) {
      if (this.preloads.has(path)) continue;
      const media = this.createAudio();
      media.preload = 'auto';
      media.src = new URL(path, this.baseURL).href;
      this.preloads.set(path, media);
      media.load();
    }
  }

  dispose() { this.stop(); this.preload([]); }
}
