// ============================================================================
// Notes backup (Supabase): notebooks and notes, per student.
// ----------------------------------------------------------------------------
// GET /api/notes → { notebooks, notebooksAt, notes } for the signed-in student.
// PUT /api/notes → { notes: [...up to 50], notebooks?, notebooksAt? }.
// Same lock as dreams (store.js): the student is only their session's one-way
// subject, and only this Worker's secret key can call ta_notes_load /
// ta_notes_save (supabase/notes.sql). Every field is checked here first.
// ============================================================================

import { readSessionWith } from './session.js';
import { sessionKeys } from './keys.js';
import { rpc, readJson, storeConfigured } from './store.js';

const MAX_REQUEST = 512000;
const MAX_NOTES_PER_SAVE = 50;
const MAX_BODY = 200000;

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const ID = /^[A-Za-z0-9-]{8,64}$/;
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const when = (v) => {
  const t = Date.parse(v);
  // Not more than a day in the future (a wrong phone clock can't pin a note forever).
  return Number.isFinite(t) && t < Date.now() + 86400000 ? new Date(t).toISOString() : null;
};

/** One note as stored, or null when it isn't a valid note. */
export function cleanNote(n) {
  if (!n || typeof n !== 'object' || !ID.test(n.id || '')) return null;
  if (typeof n.body === 'string' && n.body.length > MAX_BODY) return null;
  const updatedAt = when(n.updatedAt);
  if (!updatedAt) return null;
  const tags = Array.isArray(n.tags)
    ? [...new Set(n.tags.filter((t) => typeof t === 'string').map((t) => t.trim().slice(0, 30)).filter(Boolean))].slice(0, 20)
    : [];
  return {
    id: n.id,
    notebook: str(n.notebook, 64) || 'general',
    title: str(n.title, 200),
    body: n.deleted ? '' : str(n.body, MAX_BODY),
    tags,
    favorite: n.favorite === true,
    course: str(n.course, 40),
    deleted: n.deleted === true,
    createdAt: when(n.createdAt) || updatedAt,
    updatedAt,
  };
}

/** The notebook list, or null when it isn't a valid list. */
export function cleanNotebooks(list) {
  if (!Array.isArray(list) || list.length > 60) return null;
  const out = [];
  for (const b of list) {
    if (!b || typeof b !== 'object' || !/^[A-Za-z0-9-]{1,64}$/.test(b.id || '')) return null;
    out.push({ id: b.id, name: str(b.name, 40) || 'Notebook', color: str(b.color, 20), course: str(b.course, 40) });
  }
  return out;
}

export async function handleNotes(request, env) {
  if (!storeConfigured(env)) return json({ error: 'Cloud saving is not set up on this site yet.', configured: false }, 503);
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  const session = await readSessionWith(token, sessionKeys(env));
  if (!session?.subject) return json({ error: 'Your session expired. Refresh your courses, then retry.' }, 401);

  if (request.method === 'GET') {
    try {
      const res = await rpc(env, 'ta_notes_load', { p_subject: session.subject });
      if (!res.ok) return json({ error: 'Could not load your notes right now.' }, 502);
      const data = (await res.json()) || {};
      return json({ notebooks: data.notebooks ?? null, notebooksAt: data.notebooksAt ?? null, notes: data.notes ?? [] });
    } catch {
      return json({ error: 'Could not load your notes right now.' }, 502);
    }
  }
  if (request.method !== 'PUT') return json({ error: 'Use GET or PUT.' }, 405);

  let body;
  try { body = await readJson(request, MAX_REQUEST); }
  catch (err) { return json({ error: err.status === 413 ? 'That is too much to save at once.' : 'Invalid data.' }, err.status || 400); }
  const raw = Array.isArray(body?.notes) ? body.notes : [];
  if (raw.length > MAX_NOTES_PER_SAVE) return json({ error: 'Too many notes in one save.' }, 400);
  const notes = raw.map(cleanNote);
  if (notes.some((n) => !n)) return json({ error: 'Invalid note.' }, 400);
  let notebooks = null;
  if ('notebooks' in (body || {})) {
    notebooks = cleanNotebooks(body.notebooks);
    if (!notebooks) return json({ error: 'Invalid notebooks.' }, 400);
  }
  if (!notes.length && !notebooks) return json({ error: 'Nothing to save.' }, 400);
  try {
    const res = await rpc(env, 'ta_notes_save', {
      p_subject: session.subject,
      p_notes: notes,
      p_notebooks: notebooks,
      p_notebooks_at: notebooks ? when(body.notebooksAt) || new Date().toISOString() : null,
    });
    return res.ok ? json({ saved: true }) : json({ error: 'Could not save your notes right now.' }, 502);
  } catch {
    return json({ error: 'Could not save your notes right now.' }, 502);
  }
}
