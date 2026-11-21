import { courseTerm } from "./term.js";
import { fullCode } from "./subjects.js";

const DB_NAME = "ta-evaluation-photos";
const STORE = "pages";
export const MAX_PHOTO_PAGES = 20;
const temporaryPhotos = new Map();

export function evaluationPhotoOwner({ studentNumber, demo }) {
  const number = String(studentNumber ?? "").trim();
  return demo ? "demo" : number && `student:${number}`;
}

const title = (e) => String(e.name || e.category || "").trim().replace(/\s+/g, " ").toLowerCase();

export function evaluationPhotoKey(course, evaluation, evaluations) {
  const term = courseTerm(course);
  const courseKey = course.id ?? course.courseId ?? fullCode(course);
  const termKey = term ? [term.start, term.end] : course.term ?? course.dates ?? "";
  if (evaluation.id != null && evaluation.id !== "") {
    return JSON.stringify([courseKey, termKey, "id", evaluation.id]);
  }
  // The current scraper provides names, sometimes with a date, but no IDs.
  // Distinguish duplicate titles without using marks, which can change.
  const date = evaluation.date || "";
  const name = title(evaluation);
  let occurrence = 0;
  for (const e of evaluations) {
    if (e === evaluation) break;
    if (title(e) === name && (e.date || "") === date) occurrence++;
  }
  return JSON.stringify([courseKey, termKey, "title", name, date, occurrence]);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: ["owner", "evaluation", "position", "id"] });
      store.createIndex("evaluation", ["owner", "evaluation"]);
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Photo storage is blocked by another tab."));
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });
}

// Resolve writes after the whole transaction commits, including every page in a batch.
async function withPhotoStore(mode, run) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      let request;
      let failure;
      const abort = (error) => {
        failure = error;
        transaction.abort();
      };
      transaction.onabort = () => reject(failure || transaction.error || new Error("Photo storage was interrupted."));
      transaction.oncomplete = () => resolve(request?.result);
      try {
        request = run(transaction.objectStore(STORE), abort);
      } catch (error) {
        abort(error);
      }
    });
  } finally {
    database.close();
  }
}

function memoryPages({ owner, evaluation }) {
  return temporaryPhotos.get(owner)?.get(evaluation) || [];
}

function saveMemoryPages({ owner, evaluation }, pages) {
  if (!temporaryPhotos.has(owner)) temporaryPhotos.set(owner, new Map());
  temporaryPhotos.get(owner).set(evaluation, pages);
}

function checkPageLimit(count, added) {
  if (count + added > MAX_PHOTO_PAGES) throw new RangeError(`You can keep up to ${MAX_PHOTO_PAGES} pages per evaluation.`);
}

export async function listEvaluationPhotos({ owner, evaluation, temporary }) {
  if (temporary) return memoryPages({ owner, evaluation }).slice();
  return withPhotoStore("readonly", (store) => store.index("evaluation").getAll([owner, evaluation]));
}

export async function addEvaluationPhotos(scope, blobs) {
  const { owner, evaluation, temporary } = scope;
  const page = (blob, position) => ({ owner, evaluation, position, id: crypto.randomUUID(), blob });
  if (temporary) {
    const pages = memoryPages(scope);
    checkPageLimit(pages.length, blobs.length);
    const last = pages.at(-1)?.position ?? 0;
    saveMemoryPages(scope, [...pages, ...blobs.map((blob, i) => page(blob, last + i + 1))]);
    return;
  }
  await withPhotoStore("readwrite", (store, abort) => {
    const request = store.index("evaluation").getAllKeys([owner, evaluation]);
    request.onsuccess = () => {
      try {
        const keys = request.result;
        checkPageLimit(keys.length, blobs.length);
        const last = keys.at(-1)?.[2] ?? 0;
        blobs.forEach((blob, i) => store.add(page(blob, last + i + 1)));
      } catch (error) {
        abort(error);
      }
    };
  });
}

export async function removeEvaluationPhoto(scope, { position, id }) {
  const { owner, evaluation, temporary } = scope;
  if (temporary) {
    saveMemoryPages(scope, memoryPages(scope).filter((page) => page.id !== id));
    return;
  }
  await withPhotoStore("readwrite", (store) => store.delete([owner, evaluation, position, id]));
}

export async function deleteEvaluationPhotos(account) {
  const owner = evaluationPhotoOwner(account);
  if (!owner) return;
  if (globalThis.indexedDB) {
    await withPhotoStore("readwrite", (store) => store.delete(IDBKeyRange.bound([owner], [owner, []])));
  }
  temporaryPhotos.delete(owner);
}
