import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
const bundle = await build({entryPoints:['src/index.js'],bundle:true,format:'esm',write:false,platform:'browser',conditions:['worker','browser']});
let upstreamLogins = [];
const mf = new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2025-09-01',kvNamespaces:{MARKS:'student-login-test'},bindings:{API_KEY:'owner-secret',TA_USERNAME:'owner',TA_PASSWORD:'owner-pass'},outboundService:async request => {
  const url = new URL(request.url);
  if (url.pathname === '/yrdsb/index.php') {
    const form = new URLSearchParams(await request.text());
    const username = form.get('username'); upstreamLogins.push(username);
    if (form.get('password') !== 'correct') return new Response('',{status:302,headers:{location:'https://ta.yrdsb.ca/yrdsb/index.php?error=1'}});
    return new Response('',{status:302,headers:{'set-cookie':`session_token=${username}; Path=/; HttpOnly`,location:`https://ta.yrdsb.ca/live/students/listReports.php?student_id=${username}`}});
  }
  if (url.pathname.endsWith('listReports.php')) {
    const mark = request.headers.get('cookie').includes('111') ? 81 : 94;
    return new Response(`<html><body><table><tr><td>ENG4U-01</td><td>current mark = ${mark}%</td></tr></table></body></html>`);
  }
  throw new Error('Unexpected upstream request');
}});
const post = body => mf.dispatchFetch('https://worker.test/api/marks',{method:'POST',headers:{Origin:'https://teachassist.pages.dev','content-type':'application/json'},body:JSON.stringify(body)});
try {
  const kv = await mf.getKVNamespace('MARKS');
  const owner = JSON.stringify({scrapedAt:'2026-10-01',courses:[{code:'OWNER',currentMark:99}]});
  await kv.put('latest',owner);
  for (const body of [{},null,{username:'111'},{username:'111',password:''}]) assert.equal((await post(body)).status,400);
  assert.equal(upstreamLogins.length,0,'invalid input never uses owner credentials');
  assert.equal((await post({username:'111',password:'wrong'})).status,401);
  for (const [username,mark] of [['111',81],['222',94]]) {
    const response = await post({username,password:'correct'});
    assert.equal(response.status,200,'student signs in without API key');
    assert.equal(response.headers.get('cache-control'),'no-store');
    const token = response.headers.get('X-TeachAssist-Session');
    assert.ok(token);
    const assistant = await mf.dispatchFetch('https://worker.test/api/assistant', {method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({question:'Hello'})});
    assert.equal(assistant.status,503,'signed student token passes auth and reaches missing-AI handling');
    assert.equal((await response.json())[0].currentMark,mark);
  }
  assert.equal(await kv.get('latest'),owner,'student login never overwrites owner cache');
  assert.equal((await mf.dispatchFetch('https://worker.test/api/cached')).status,401);
  assert.equal((await mf.dispatchFetch('https://worker.test/api/marks')).status,401);
  assert.equal((await mf.dispatchFetch('https://worker.test/api/marks?debug=login',{method:'POST',body:'{}'})).status,401);
  assert.equal((await mf.dispatchFetch('https://worker.test/api/marks',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'})).status,403);
  assert.equal((await mf.dispatchFetch('https://worker.test/api/marks',{method:'POST',body:'x'.repeat(9000)})).status,413);
  console.log('Student sign-in, account isolation, protected owner routes, and invalid-input tests passed.');
} finally { await mf.dispose(); }
