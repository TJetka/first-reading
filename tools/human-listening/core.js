/** A cut uses seconds on the original recording, with at least 20 ms of audio. */
export function validRange(range, duration) {
  return Array.isArray(range) && range.length === 2 && range.every(Number.isFinite)
    && range[0] >= 0 && range[1] <= duration && range[1] - range[0] >= 0.019999;
}

export function emptyHumanReview(dataset) {
  return {
    schemaVersion: 1, purpose: 'human-speech-review', datasetId: dataset.id,
    words: Object.fromEntries(dataset.words.map((word) => [word.id, {
      sourceSHA256: word.source.sha256, pcmSHA256: word.clip.pcmSHA256,
      sourceVerdict: 'unreviewed', note: '',
      segments: [word.source.wordRange, ...word.source.cuts].map((range) => ({ range: [...range], verdict: 'unreviewed' })),
    }])),
  };
}

/** Reject stale source identities and malformed bounds; never interpret a review as release approval. */
export function parseHumanReview(value, dataset) {
  if (!value || value.schemaVersion !== 1 || value.purpose !== 'human-speech-review'
    || value.datasetId !== dataset.id || !value.words || Array.isArray(value.words)
    || Object.keys(value.words).length !== dataset.words.length) throw new Error('Review belongs to a different recording set');
  const result = emptyHumanReview(dataset);
  for (const word of dataset.words) {
    const item = value.words[word.id];
    if (!item || item.sourceSHA256 !== word.source.sha256 || item.pcmSHA256 !== word.clip.pcmSHA256) throw new Error('Recording hash mismatch');
    if (!['unreviewed', 'good', 'poor'].includes(item.sourceVerdict)
      || typeof item.note !== 'string' || item.note.length > 2000
      || !Array.isArray(item.segments) || item.segments.length !== word.syllables.length + 1) throw new Error('Invalid review fields');
    for (const segment of item.segments) {
      if (!validRange(segment.range, word.clip.duration)
        || !['unreviewed', 'usable', 'needs-work'].includes(segment.verdict)) throw new Error('Invalid cut or verdict');
    }
    result.words[word.id] = {
      sourceSHA256: item.sourceSHA256, pcmSHA256: item.pcmSHA256, sourceVerdict: item.sourceVerdict,
      note: item.note, segments: item.segments.map((segment) => ({ range: [...segment.range], verdict: segment.verdict })),
    };
  }
  return result;
}

/** Editing a boundary invalidates only that segment's prior listening verdict. Overlaps are allowed. */
export function changeRange(review, word, position, range) {
  if (!Number.isInteger(position) || position < 0 || position > word.syllables.length
    || !validRange(range, word.clip.duration)) throw new Error('Invalid cut boundaries');
  const next = structuredClone(review);
  const segment = next.words[word.id].segments[position];
  if (segment.range.some((value, index) => value !== range[index])) {
    segment.range = [...range];
    segment.verdict = 'unreviewed';
  }
  return next;
}

export function frameRange(range, sampleRate, frameCount) {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0 || !Number.isInteger(frameCount) || frameCount <= 0
    || !validRange(range, frameCount / sampleRate)) throw new Error('Invalid PCM cut');
  const start = Math.round(range[0] * sampleRate);
  const end = Math.min(frameCount, Math.round(range[1] * sampleRate));
  if (start >= end) throw new Error('Empty PCM cut');
  return [start, end];
}

/** Export the exact selected mono frames with source/derivative credits in RIFF INFO/ICMT. */
export function cutWav(samples, sampleRate, range, credit) {
  const [start, end] = frameRange(range, sampleRate, samples.length);
  const note = new TextEncoder().encode(`${credit}\0`);
  const padded = note.length + note.length % 2;
  const dataLength = (end - start) * 2;
  const output = new ArrayBuffer(44 + dataLength + 20 + padded);
  const view = new DataView(output);
  const bytes = new Uint8Array(output);
  const tag = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  tag(0, 'RIFF'); view.setUint32(4, output.byteLength - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, dataLength, true);
  for (let index = start; index < end; index++) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + (index - start) * 2, Math.max(-32768, Math.min(32767, Math.round(value * 32768))), true);
  }
  const offset = 44 + dataLength;
  tag(offset, 'LIST'); view.setUint32(offset + 4, 12 + padded, true); tag(offset + 8, 'INFO'); tag(offset + 12, 'ICMT');
  view.setUint32(offset + 16, note.length, true); bytes.set(note, offset + 20);
  return output;
}

export function clipCredit(word, segment, sampleRate, frames) {
  return JSON.stringify({ title: word.source.title, creator: word.source.speaker, source: word.source.page,
    license: word.source.license, licenseURL: word.source.licenseURL, sourceSHA256: word.source.sha256,
    pcmSHA256: word.clip.pcmSHA256, modification: 'Decoded to mono PCM16; excerpted without speed/pitch changes.',
    rangeSeconds: segment.range, sampleRate, frameRange: frames, prototypeVerdict: segment.verdict,
    redistribution: word.source.license.includes('BY-SA') ? 'Credit the source; distribute adaptations under the same license.' : 'Retain this source and license notice.' });
}

export function portableReview(review, dataset) {
  return { ...parseHumanReview(review, dataset), exportedAt: new Date().toISOString(), provenance: dataset.provenance,
    sources: dataset.words.map((word) => ({ wordId: word.id, word: word.word, syllables: word.syllables, ...word.source, pcmSHA256: word.clip.pcmSHA256 })),
    meaning: 'Personal prototype listening notes; not editorial or release approval. All ranges are seconds from the source start.' };
}
