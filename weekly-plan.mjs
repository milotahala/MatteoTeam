// Shared schedule rules. No authentication accounts are created by this module.
export const DEPARTMENTS = ['Pizza', 'Kasse', 'Service', 'Küche'];
export const normalizeName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

export function shiftIntervals(value) {
  const raw = String(value || '').trim();
  if (!raw || /^(frei|fre|u|urlaub|krank|k)$/i.test(raw)) return [];
  return raw.split('/').map(part => {
    const m = part.trim().match(/^(\d{1,2})(?::?(\d{2}))?\s*[-–]\s*(\d{1,2})(?::?(\d{2}))?$/);
    if (!m) throw new Error(`Ungültige Schicht: ${raw}. Bitte z. B. 14-22 oder 14:00-23:30 eingeben.`);
    const [sh, sm, eh, em] = [Number(m[1]), Number(m[2] || 0), Number(m[3]), Number(m[4] || 0)];
    if (sh > 23 || eh > 24 || sm > 59 || em > 59 || (eh === 24 && em)) throw new Error(`Ungültige Uhrzeit: ${raw}`);
    const start = sh * 60 + sm;
    let end = eh * 60 + em;
    if (end <= start) end += 1440;
    if (end - start >= 1440) throw new Error(`Bitte Anfang und Ende prüfen: ${raw}`);
    return {start, end};
  });
}

export function shiftTotals(value) {
  const intervals = shiftIntervals(value).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({...interval});
  }
  const gross = merged.reduce((sum, p) => sum + p.end - p.start, 0);
  const pause = gross >= 240 ? 30 : 0;
  // Existing app's night window: 00:00–01:00. Do not change payroll policy here.
  const night = merged.reduce((sum, p) => sum + [0, 1440].reduce((n, day) => n + Math.max(0, Math.min(p.end, day + 60) - Math.max(p.start, day)), 0), 0);
  return {total: Math.max(0, gross - pause) / 60, night: night / 60, breakHours: pause / 60, label: String(value || '').trim() || '-'};
}

export function expandStart(value, day) {
  const raw = String(value || '').trim();
  if (/^(frei|fre)$/i.test(raw)) return 'Frei';
  if (!/^\d{1,2}(?::00)?$/.test(raw)) return raw;
  const hour = Number(raw.split(':')[0]);
  const ends = {9:18, 10:18, 11:19, 14:22, 15:22, 16:23, 17:23, 18:day === 4 || day === 5 ? 6 : 4, 19:day === 4 || day === 5 ? 6 : 4};
  // 12:00 deliberately stays unresolved: owner uses both 12–17 and 12–22.
  return ends[hour] === undefined ? raw : `${hour}-${String(ends[hour]).padStart(2, '0')}`;
}

export function combineSectorDays(values) {
  const nonempty = values.map(v => String(v || '').trim()).filter(Boolean);
  if (!nonempty.length) return '';
  const work = nonempty.filter(v => shiftIntervals(v).length);
  if (!work.length) {
    const unique = [...new Set(nonempty.map(v => v.toLowerCase()))];
    if (unique.length > 1) throw new Error('Widersprüchliche Abwesenheiten in mehreren Bereichen.');
    return nonempty[0];
  }
  if (nonempty.some(v => /^(u|urlaub|k|krank)$/i.test(v))) throw new Error('Arbeit und Urlaub/Krank am selben Tag. Bitte prüfen.');
  const intervals = work.flatMap(shiftIntervals).sort((a, b) => a.start - b.start);
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i].start < intervals[i - 1].end) throw new Error('Überlappende Schichten in zwei Bereichen. Bitte Ersatzschicht nur im tatsächlichen Bereich eintragen.');
  }
  return work.join(' / ');
}

export function personDays(entries, userId, people = []) {
  const ids = [userId, ...people.filter(p => p.accountId === userId).flatMap(p => [p.id, ...(p.aliases || [])])];
  const result = {};
  for (let day = 0; day < 7; day++) {
    if (Object.hasOwn(entries?.[userId] || {}, day)) {result[day] = entries[userId][day] || ''; continue;}
    const values = [...new Set(ids.map(id => entries?.[id]?.[day]).filter(Boolean))];
    result[day] = values.length > 1 ? combineSectorDays(values) : values[0] || '';
  }
  return result;
}

// Parse positioned OCR words: header positions define columns, not token order.
// Empty cells must never shift later times into the wrong day.
export function parsePhotoWords(words) {
  const usable = words.filter(w => w.bbox && String(w.text || '').trim()).map(w => ({...w, text: w.text.trim(), cy: (w.bbox.y0 + w.bbox.y1) / 2}));
  const rows = [];
  for (const word of usable.sort((a, b) => a.cy - b.cy || a.bbox.x0 - b.bbox.x0)) {
    let row = rows.find(r => Math.abs(r.cy - word.cy) < Math.max(6, (word.bbox.y1 - word.bbox.y0) * .55));
    if (!row) {row = {cy: word.cy, words: []}; rows.push(row);}
    row.words.push(word);
  }
  rows.forEach(r => r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0));
  const header = rows.find(r => r.words.filter(w => /\d{1,2}[.]\d{1,2}(?![.\d])/.test(w.text)).length === 7);
  if (!header) throw new Error('Sieben Datumsspalten nicht erkannt. Bitte ein gerades, scharfes Foto der ganzen Tabelle wählen.');
  const dates = header.words.filter(w => /\d{1,2}[.]\d{1,2}(?![.\d])/.test(w.text));
  const starts = dates.map(date => {
    const weekday = header.words.filter(w => w.bbox.x0 <= date.bbox.x0 && w.bbox.x0 > date.bbox.x0 - 45 && /^(mo|di|mi|mit|do|fr|frei|sa|so)[.,:]?$/i.test(w.text)).at(-1);
    return weekday ? weekday.bbox.x0 : date.bbox.x0;
  });
  const spacing = (starts[6] - starts[0]) / 6;
  const nameEnd = starts[0] - spacing * .07;
  const limits = starts.slice(1).map(x => x - spacing * .07);
  let department = 'Pizza';
  const result = [];
  for (const row of rows.filter(r => r.cy >= header.cy)) {
    const left = row.words.filter(w => w.bbox.x0 < nameEnd).map(w => w.text).join(' ').replace(/[|]/g, '').trim();
    if (/pizzab|pizza\b/i.test(left)) {department = 'Pizza'; continue;}
    if (/^kasse\b/i.test(left)) {department = 'Kasse'; continue;}
    if (/^service\b/i.test(left)) {department = 'Service'; continue;}
    if (/^k(?:u|ü|ii|ue)che\b/i.test(left)) {department = 'Küche'; continue;}
    if (row.words.filter(w => /\d{1,2}[.]\d{1,2}/.test(w.text)).length >= 4) throw new Error(`Bereich nicht erkannt: ${left}. Bitte Bereichsüberschrift im Foto deutlicher aufnehmen.`);
    if (!left || !/[a-zäöü]/i.test(left)) continue;
    const cells = Array.from({length: 7}, () => []);
    for (const word of row.words.filter(w => w.bbox.x0 >= nameEnd)) {
      const x = (word.bbox.x0 + word.bbox.x1) / 2;
      let day = limits.findIndex(limit => x < limit);
      if (day < 0) day = 6;
      cells[day].push(word.text);
    }
    result.push({name: left, department, days: cells.map(c => c.join('').replace(/[|]/g, ''))});
  }
  if (!result.length) throw new Error('Keine Mitarbeiter erkannt. Bitte ein schärferes Foto wählen.');
  return {rows: result, dates: dates.map(w => w.text.match(/\d{1,2}[.]\d{1,2}(?![.\d])/)[0])};
}

// Remove long table rules before OCR; work stays in the browser.
export async function preparePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 2200 / image.naturalWidth, 3200 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rows = new Uint32Array(canvas.height), cols = new Uint32Array(canvas.width);
    for (let y=0; y<canvas.height; y++) for (let x=0; x<canvas.width; x++) {
      const i=(y*canvas.width+x)*4;
      if ((pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3<110) {rows[y]++;cols[x]++;}
    }
    const horizontal = [...rows.keys()].filter(y=>rows[y]>canvas.width*.6);
    const vertical = [...cols.keys()].filter(x=>cols[x]>canvas.height*.45);
    ctx.fillStyle='white';
    horizontal.forEach(y=>ctx.fillRect(0,y-1,canvas.width,3));
    vertical.forEach(x=>ctx.fillRect(x-1,0,3,canvas.height));
    const output=document.createElement('canvas');
    const zoom=Math.min(2,3500/Math.max(canvas.width,canvas.height));
    output.width=Math.round(canvas.width*zoom);output.height=Math.round(canvas.height*zoom);
    output.getContext('2d').drawImage(canvas,0,0,output.width,output.height);
    return output;
  } finally {URL.revokeObjectURL(url);}
}
