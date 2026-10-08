import { el, fmtPercent, escapeHtml } from './courses.js';
import { getSnapshots } from './ta-client.js';
import { preferences } from './personalization.js';

export function historyCard(codes) {
  const card = el('<section class="card grade-history"><div class="tool-heading"><h2>Grade history</h2><span class="small muted"></span></div></section>');
  const rows = getSnapshots().map(s => {
    const marks = codes.map(code => s.marks[code]).filter(Number.isFinite);
    return { date: s.date, value: marks.length ? marks.reduce((a,b) => a+b,0)/marks.length : null };
  });
  card.querySelector('span').textContent = `${rows.length} snapshot${rows.length === 1 ? '' : 's'}`;
  if (preferences().hideMarks) { card.append(el('<p class="muted">Grade history is concealed while Hide grades is on.</p>')); return card; }
  const points = rows.filter(r => r.value !== null);
  if (points.length < 2) {
    card.append(el(`<p class="muted">${points.length ? `First snapshot: ${fmtPercent(points[0].value)}. ` : ''}Refresh your courses later to build your history on this device.</p>`));
  } else {
    const min = Math.max(0, Math.floor(Math.min(...points.map(p => p.value)) - 2));
    const max = Math.min(100, Math.ceil(Math.max(...points.map(p => p.value)) + 2));
    const start = Date.parse(rows[0].date), end = Date.parse(rows.at(-1).date);
    const x = r => 20 + (end === start ? .5 : (Date.parse(r.date)-start)/(end-start)) * 300;
    const y = r => 125 - (r.value-min)/(max-min || 1)*100;
    let path = '', gap = true;
    rows.forEach(r => { if (r.value === null) { gap = true; return; } path += `${gap ? 'M' : 'L'}${x(r).toFixed(1)},${y(r).toFixed(1)} `; gap = false; });
    card.append(el(`<svg viewBox="0 0 340 150" role="img" aria-label="Average for currently displayed courses, from ${fmtPercent(points[0].value)} to ${fmtPercent(points.at(-1).value)}"><path d="M20 125H320" stroke="var(--border)"/><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="3"/>${points.map(r => `<circle cx="${x(r)}" cy="${y(r)}" r="3" fill="var(--accent)"/>`).join('')}</svg>`));
  }
  if (rows.length) {
    const details = el('<details><summary>View recorded averages</summary><p class="small muted">Based on the courses currently displayed. Saved on this device; up to 60 snapshots.</p><div class="history-records"></div></details>');
    details.querySelector('.history-records').innerHTML = rows.slice().reverse().map(r => `<div class="tool-heading"><time datetime="${escapeHtml(r.date)}">${escapeHtml(new Date(r.date).toLocaleString())}</time><b>${fmtPercent(r.value)}</b></div>`).join('');
    card.append(details);
  }
  return card;
}
