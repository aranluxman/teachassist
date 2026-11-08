// ============================================================================
// Where this browser keeps a student's things
// ----------------------------------------------------------------------------
// Normally localStorage: the sign-in, marks, settings and goals stay on this
// device until Sign Out / Delete my data.
//
// "This is a shared computer" at sign-in switches this tab to sessionStorage:
// everything lives only in this browser tab, and closing the tab clears it.
// The flag itself is kept in sessionStorage, so it ends with the tab too.
// ============================================================================

const FLAG = "ta_shared_device";

/** True when this tab signed in as "This is a shared computer". */
export function isSharedDevice() {
  try {
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false; // no sessionStorage (tests, locked-down browsers)
  }
}

/** Turn shared-computer mode on or off for this tab. */
export function setSharedDevice(on) {
  try {
    if (on) sessionStorage.setItem(FLAG, "1");
    else sessionStorage.removeItem(FLAG);
  } catch {
    /* no sessionStorage: stays on normal device storage */
  }
}

/** The storage to use for this student's data right now. */
export function deviceStore() {
  return isSharedDevice() ? sessionStorage : localStorage;
}
