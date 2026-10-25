// Which secret does which job. API_KEY used to do all of them; separate
// secrets now sign sessions and seal saved logins, with API_KEY kept as a
// fallback so tokens and boxes made before the switch still work.
//   API_KEY         owner key for the standalone Worker, and the key behind
//                   each student's one-way id (it files their saved data in
//                   Supabase, so never change it)
//   SESSION_SECRET  signs the one-hour session tokens
//   VAULT_SECRET    seals saved logins ("locked boxes")
// The first key in each list signs or seals; every key in it is accepted.
const distinct = (...keys) => [...new Set(keys.filter(Boolean))];

export const sessionKeys = (env) => distinct(env.SESSION_SECRET, env.API_KEY);
export const vaultKeys = (env) => distinct(env.VAULT_SECRET, env.API_KEY);
export const idKey = (env) => env.API_KEY || '';
