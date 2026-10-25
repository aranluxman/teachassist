import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { verifySession } from '../src/session.js';
const bundle = await build({entryPoints:['src/index.js'],bundle:true,format:'esm',write:false,platform:'browser',conditions:['worker','browser']});
let upstreamLogins = [];
const mf = new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2025-09-01',kvNamespaces:{MARKS:'student-login-test'},bindings:{API_KEY:'owner-secret',TA_USERNAME:'owner',TA_PASSWORD:'owner-pass'},outboundService:async request => {
  const url = new URL(request.url);
  if (url.pathname === '/yrdsb/index.php') {
    if (request.method === 'GET') return new Response('<form action="/yrdsb/index.php"><input name="username"><input type="password" name="password"></form>');
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
    assert.equal(await verifySession(token,'owner-secret'),true,'the session token is signed by the server');
    assert.equal((await response.json())[0].currentMark,mark);
  }
  assert.equal(await kv.get('latest'),owner,'student login never overwrites owner cache');
  assert.equal((await mf.dispatchFetch('https://worker.test/api/cached')).status,401);
  assert.equal((await mf.dispatchFetch('https://worker.test/api/marks')).status,401);
  assert.equal((await mf.dispatchFetch('https://worker.test/api/marks?debug=login',{method:'POST',body:'{}'})).status,401);
  assert.equal((await mf.dispatchFetch('https://worker.test/api/marks',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'})).status,403);
  assert.equal((await mf.dispatchFetch('https://worker.test/api/marks',{method:'POST',body:'x'.repeat(9000)})).status,413);
  // Sealed credential: sign in once with the password, refresh with the box.
  upstreamLogins = [];
  const first = await post({username:'111',password:'correct'});
  const box = first.headers.get('X-TeachAssist-Cred');
  assert.match(box || '', /^v1\./, 'sign-in returns a sealed credential');
  assert.ok(!box.includes('correct'), 'the box does not contain the password');
  const again = await post({username:'111',cred:box});
  assert.equal(again.status,200,'refresh with the box signs in');
  assert.equal((await again.json())[0].currentMark,81);
  assert.match(again.headers.get('X-TeachAssist-Cred') || '', /^v1\./, 'refresh issues a fresh box');
  assert.deepEqual(upstreamLogins,['111','111'],'the box opens to the right student');
  const stolen = await post({username:'222',cred:box});
  assert.equal(stolen.status,401,"a box can't be used with another student number");
  assert.equal((await stolen.json()).code,'TA_CRED_EXPIRED');
  assert.equal((await post({username:'111',cred:'v1.bad.box'})).status,401,'a forged box is refused');
  assert.equal(upstreamLogins.length,2,'refused boxes never reach TeachAssist');
  console.log('Student sign-in, account isolation, protected owner routes, and invalid-input tests passed.');
} finally { await mf.dispose(); }
