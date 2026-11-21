import { el } from "./courses.js";
import { isSharedDevice } from "./device-store.js";
import { isDemo, isLoggedIn, studentNumber } from "./ta-client.js";
import { addEvaluationPhotos, evaluationPhotoKey, evaluationPhotoOwner, listEvaluationPhotos, MAX_PHOTO_PAGES, removeEvaluationPhoto } from "./evaluation-photo-store.js";

const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const FORMATS = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  heic: "image/heic", heif: "image/heif", avif: "image/avif",
};

class PhotoError extends Error {}

async function preparePhoto(file) {
  if (!file.size || file.size > MAX_PHOTO_BYTES) {
    throw new PhotoError("Choose photos that are up to 20 MB each.");
  }
  const extension = file.name.split(".").pop().toLowerCase();
  const type = Object.values(FORMATS).includes(file.type) ? file.type : Object.hasOwn(FORMATS, extension) && FORMATS[extension];
  if (!type) throw new PhotoError("Choose a JPG, PNG, WebP, AVIF, or HEIC photo.");
  // Keep the whole image at its original resolution and omit the filename.
  const blob = file.slice(0, file.size, type);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
  } catch {
    throw new PhotoError("This browser couldn't open one of those photos. Try a JPG or PNG copy.");
  } finally {
    URL.revokeObjectURL(url);
  }
  return blob;
}

function activePhotoOwner() {
  return isLoggedIn() ? evaluationPhotoOwner({ studentNumber: studentNumber(), demo: isDemo() }) : "";
}

/** A local photo picker and page viewer inside the evaluation sheet. */
export function evaluationPhotos(course, evaluation, evaluations) {
  const owner = activePhotoOwner();
  if (!owner) return null;
  const scope = { owner, evaluation: evaluationPhotoKey(course, evaluation, evaluations), temporary: isSharedDevice() };
  const storageNote = scope.temporary ? "Photos stay in this tab until you reload or close it." : "Photos are saved in this browser for you to review.";
  const root = el(`
    <section class="ev-photos" aria-label="Test and quiz photos">
      <div data-photo-collection>
        <button type="button" class="btn secondary ev-photo-upload" disabled>Upload test/quiz</button>
        <input type="file" accept="image/*" multiple hidden>
        <p class="ev-photo-note">${isDemo() ? "Use sample images in demo mode. " : ""}${storageNote}</p>
        <p class="ev-photo-status" role="status"></p>
        <ol class="ev-photo-list" aria-label="Saved pages"></ol>
      </div>
      <div class="ev-photo-viewer" hidden>
        <div class="ev-photo-toolbar">
          <button type="button" class="btn secondary" data-photo-back>Back to pages</button>
          <button type="button" class="btn secondary" data-photo-size>Actual size</button>
        </div>
        <h3 tabindex="-1"></h3>
        <p class="ev-photo-view-error" role="status" hidden>This photo couldn't be displayed. Try uploading a JPG or PNG copy.</p>
        <div class="ev-photo-scroll" tabindex="0" role="region" aria-label="Photo">
          <img alt="">
        </div>
      </div>
    </section>`);
  const collection = root.querySelector("[data-photo-collection]");
  const upload = root.querySelector(".ev-photo-upload");
  const picker = root.querySelector('input[type="file"]');
  const list = root.querySelector(".ev-photo-list");
  const status = root.querySelector(".ev-photo-status");
  const viewer = root.querySelector(".ev-photo-viewer");
  const heading = viewer.querySelector("h3");
  const viewError = viewer.querySelector(".ev-photo-view-error");
  const scroller = viewer.querySelector(".ev-photo-scroll");
  const image = viewer.querySelector("img");
  const size = viewer.querySelector("[data-photo-size]");
  let disposed = false;
  let busy = true;
  let url = "";
  let openedBy = null;

  const isActive = () => !disposed && activePhotoOwner() === owner && isSharedDevice() === scope.temporary;

  function setBusy(value) {
    busy = value;
    upload.disabled = value;
    list.querySelectorAll("button").forEach((button) => { button.disabled = value; });
  }

  function closeViewer(focus = false) {
    if (url) URL.revokeObjectURL(url);
    url = "";
    image.removeAttribute("src");
    viewer.hidden = true;
    collection.hidden = false;
    if (focus) openedBy?.focus();
    openedBy = null;
  }

  function viewPage(page, label, opener) {
    closeViewer();
    openedBy = opener;
    url = URL.createObjectURL(page.blob);
    image.alt = `Photo of ${label.toLowerCase()}`;
    viewError.hidden = true;
    size.disabled = false;
    image.classList.remove("ev-photo-actual");
    size.textContent = "Actual size";
    heading.textContent = label;
    image.src = url;
    collection.hidden = true;
    viewer.hidden = false;
    scroller.scrollTo(0, 0);
    heading.focus();
  }

  image.addEventListener("error", () => {
    if (!url) return;
    viewError.hidden = false;
    size.disabled = true;
  });
  size.addEventListener("click", () => {
    const actual = image.classList.toggle("ev-photo-actual");
    size.textContent = actual ? "Fit to screen" : "Actual size";
    if (!actual) scroller.scrollTo(0, 0);
  });
  viewer.querySelector("[data-photo-back]").addEventListener("click", () => closeViewer(true));

  async function refresh() {
    const pages = await listEvaluationPhotos(scope);
    if (!isActive()) return;
    list.replaceChildren(...pages.map((page, index) => {
      const label = `Page ${index + 1}`;
      const row = el(`<li><button type="button" class="btn ghost" data-open aria-label="View ${label.toLowerCase()}">${label}</button><button type="button" class="btn ghost" data-remove aria-label="Remove ${label.toLowerCase()}">Remove</button></li>`);
      const open = row.querySelector("[data-open]");
      open.addEventListener("click", () => {
        if (isActive()) viewPage(page, label, open);
      });
      row.querySelector("[data-remove]").addEventListener("click", () => changePhotos(async () => {
        await removeEvaluationPhoto(scope, page);
        return `${label} removed.`;
      }, "Couldn’t remove the page. Try again.", () => list.children[index]?.querySelector("[data-open]") || upload));
      return row;
    }));
  }

  async function changePhotos(change, failure, focus) {
    if (busy || !isActive()) return;
    const previousFocus = document.activeElement;
    setBusy(true);
    status.textContent = "";
    let changed = false;
    try {
      const message = await change();
      if (!isActive()) return;
      changed = true;
      status.textContent = message;
      await refresh();
    } catch (error) {
      if (!isActive()) return;
      status.textContent = changed ? `${status.textContent} Reopen this evaluation to refresh the list.`
        : error instanceof PhotoError || error instanceof RangeError ? error.message : failure;
    } finally {
      if (isActive()) {
        setBusy(false);
        if (document.activeElement === document.body || root.contains(document.activeElement)) {
          (changed ? focus() : previousFocus)?.focus();
        }
      }
    }
  }

  upload.addEventListener("click", () => {
    if (isActive()) picker.click();
  });
  picker.addEventListener("change", () => {
    const files = Array.from(picker.files);
    picker.value = "";
    if (!files.length) return;
    void changePhotos(async () => {
      if (files.length > MAX_PHOTO_PAGES) throw new PhotoError(`Choose up to ${MAX_PHOTO_PAGES} pages at a time.`);
      status.textContent = "Saving photos…";
      const blobs = [];
      for (const file of files) {
        if (!isActive()) return;
        blobs.push(await preparePhoto(file));
      }
      if (!isActive()) return;
      await addEvaluationPhotos(scope, blobs);
      return blobs.length === 1 ? "1 page saved." : `${blobs.length} pages saved.`;
    }, "Couldn’t save the photos. Check your browser storage and try again.", () => upload);
  });

  return {
    root,
    async load() {
      try {
        await refresh();
        if (isActive()) setBusy(false);
      } catch {
        if (isActive()) status.textContent = "Photo storage is unavailable. Reopen this evaluation to try again.";
      }
    },
    dispose() {
      disposed = true;
      closeViewer();
      list.replaceChildren();
    },
  };
}
