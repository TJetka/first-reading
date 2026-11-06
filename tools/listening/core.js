export const ISSUES = ['Wrong sound', 'Clipped', 'Too fast', 'Too slow', 'Noisy'];

/** Keep trial order repeatable while hiding the original method position. */
export function trialOrder(caseId, variants) {
  let seed = [...caseId].reduce((value, character) => ((value * 31 + character.charCodeAt(0)) >>> 0), 7);
  const result = [...variants];
  for (let index = result.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const other = seed % (index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

/** A review applies only to the exact bytes that were heard. */
export function reviewKey(caseId, variantId, hash) { return `${caseId}:${variantId}:${hash}`; }

export function emptyReview(datasetId) {
  return { schemaVersion: 1, datasetId, ratings: {}, winners: {}, notes: {}, imports: {} };
}

/** Validate imported browser review data without merging unexpected fields. */
export function parseReview(value, dataset) {
  if (value?.schemaVersion !== 1 || value.datasetId !== dataset.id) throw new Error('This review belongs to a different experiment.');
  const result = emptyReview(dataset.id);
  const ids = new Set(dataset.cases.map((item) => item.id));
  for (const [key, rating] of Object.entries(value.ratings ?? {})) {
    const [id, variant, hash, extra] = key.split(':');
    if (!ids.has(id) || ![...dataset.variants.map((v) => v.id), 'external'].includes(variant)
      || !/^[a-f0-9]{64}$/.test(hash ?? '') || extra
      || (rating.score !== null && (!Number.isInteger(rating.score) || rating.score < 1 || rating.score > 5)) || !Array.isArray(rating.issues)
      || rating.issues.some((issue) => !ISSUES.includes(issue))) throw new Error('Invalid rating in review file.');
    result.ratings[key] = { score: rating.score, issues: [...new Set(rating.issues)] };
  }
  for (const [id, note] of Object.entries(value.notes ?? {})) {
    if (!ids.has(id) || typeof note !== 'string' || note.length > 2000) throw new Error('Invalid review note.');
    result.notes[id] = note;
  }
  for (const [id, winner] of Object.entries(value.winners ?? {})) {
    if (!ids.has(id) || (winner !== 'none' && !Object.hasOwn(result.ratings, winner))) throw new Error('Invalid preferred clip.');
    if (winner !== 'none' && !winner.startsWith(`${id}:`)) throw new Error('Preferred clip belongs to another syllable.');
    result.winners[id] = winner;
  }
  for (const [id, record] of Object.entries(value.imports ?? {})) {
    if (!ids.has(id) || typeof record.label !== 'string' || record.label.length > 100
      || typeof record.filename !== 'string' || record.filename.length > 255
      || !/^[a-f0-9]{64}$/.test(record.sha256 ?? '')) throw new Error('Invalid imported clip record.');
    result.imports[id] = { label: record.label, filename: record.filename, sha256: record.sha256 };
  }
  return result;
}

/** CSV cells are spreadsheet-safe even when free-text notes begin with a formula. */
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function reviewCSV(dataset, review) {
  const rows = [['case', 'word', 'syllable', 'variant', 'audio_sha256', 'score', 'issues', 'preferred', 'note']];
  for (const item of dataset.cases) {
    for (const variant of [...dataset.variants, { id: 'external' }]) {
      const clip = variant.id === 'external' ? review.imports[item.id] : item.clips[variant.id];
      if (!clip) continue;
      const key = reviewKey(item.id, variant.id, clip.sha256);
      const rating = review.ratings[key];
      rows.push([item.id, item.word, item.text, variant.id, clip.sha256, rating?.score ?? '',
        rating?.issues.join('; ') ?? '', review.winners[item.id] === 'none' ? 'none acceptable'
          : review.winners[item.id] === key ? 'yes' : '', review.notes[item.id] ?? '']);
    }
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
