// ============================================================================
// Authentication
// ----------------------------------------------------------------------------
// * On index.html: wires up the email/password login + signup form.
// * On app.html: exposes requireAuth() (session gate) and signOut().
// Uses Supabase Auth only — there is NO scraping or third-party password
// handling anywhere in this frontend.
// ============================================================================

import { sb } from "./supabase.js";

let cachedUser = null;

/** The signed-in user cached after requireAuth(). */
export function getCurrentUser() {
  return cachedUser;
}

/**
 * Gate for app.html. If there is no Supabase session, redirect to the login
 * page and return null. Otherwise return (and cache) the user.
 */
export async function requireAuth() {
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    window.location.replace("index.html");
    return null;
  }
  cachedUser = data.session.user;
  return cachedUser;
}

/** Sign out and return to the login screen. */
export async function signOut() {
  await sb.auth.signOut();
  window.location.replace("index.html");
}

// ---------------------------------------------------------------------------
// Login / Signup page wiring — only runs when the auth form exists (index.html)
// ---------------------------------------------------------------------------
function initAuthPage() {
  const form = document.getElementById("auth-form");
  if (!form) return; // not on the login page

  // Already signed in? Skip straight to the app.
  sb.auth.getSession().then(({ data }) => {
    if (data.session) window.location.replace("app.html");
  });

  const submit = document.getElementById("auth-submit");
  const errorEl = document.getElementById("auth-error");
  const subtitle = document.getElementById("auth-subtitle");
  const toggleText = document.getElementById("toggle-text");
  const toggleBtn = document.getElementById("toggle-mode");
  const passwordEl = document.getElementById("password");

  let mode = "login"; // "login" | "signup"

  function labelForMode() {
    return mode === "login" ? "Sign In" : "Create Account";
  }

  function setMode(next) {
    mode = next;
    errorEl.textContent = "";
    submit.textContent = labelForMode();
    if (mode === "login") {
      subtitle.textContent = "Sign in to track your marks";
      toggleText.textContent = "Don't have an account?";
      toggleBtn.textContent = "Sign Up";
      passwordEl.setAttribute("autocomplete", "current-password");
    } else {
      subtitle.textContent = "Create an account to get started";
      toggleText.textContent = "Already have an account?";
      toggleBtn.textContent = "Sign In";
      passwordEl.setAttribute("autocomplete", "new-password");
    }
  }

  toggleBtn.addEventListener("click", () =>
    setMode(mode === "login" ? "signup" : "login")
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.style.color = "var(--danger)";
    errorEl.textContent = "";

    const email = document.getElementById("email").value.trim();
    const password = passwordEl.value;

    submit.disabled = true;
    submit.innerHTML = '<span class="spinner"></span>';

    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.replace("app.html");
        return;
      }

      // Sign up
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;

      if (data.session) {
        // Email confirmation is OFF → we have a session immediately.
        window.location.replace("app.html");
        return;
      }
      // Email confirmation is ON → tell the user to confirm, then switch to login.
      setMode("login");
      errorEl.style.color = "var(--text-secondary)";
      errorEl.textContent =
        "Account created. Check your email to confirm, then sign in.";
    } catch (err) {
      errorEl.style.color = "var(--danger)";
      errorEl.textContent = err?.message || "Something went wrong. Try again.";
    } finally {
      submit.disabled = false;
      submit.textContent = labelForMode();
    }
  });
}

initAuthPage();
