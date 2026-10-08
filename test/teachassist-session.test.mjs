import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTeachAssistSession, mergeCookies, TeachAssistError } from '../worker/src/teachassist-session.js';
import worker from '../worker/src/index.js';
const origin = 'https://ta.yrdsb.ca';
const loginUrl = origin + '/yrdsb/index.php';
const courseListUrl = origin + '/live/students/listReports.php';
const config = { origin, loginUrl, courseListUrl, fields: { username: 'username', password: 'password', extra: { subject_id: '0', submit: 'Login' } }, userAgent: 'test' };
const client = createTeachAssistSession(config);
const form = '<form action="/yrdsb/index.php" method="post"><input name="username"><input name="password" type="password"><input name="csrf" type="hidden" value="a&amp;b"></form>';
const creds = { username: '111', password: 'test-password' };
async function mocked(fetcher, task) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try { return await task(); } finally { globalThis.fetch = original; }
}
function redirect(location, cookies, status = 302) {
  const headers = new Headers({location});
  if (cookies) for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response('', {status, headers});
}
test('login preserves bootstrap/hidden fields, follows redirects, and collects cookies across every response', async () => {
  const calls = [];
  await mocked(async (target, options) => {
    const url = new URL(target); calls.push({url:url.href,method:options.method});
    if (url.href === loginUrl && options.method === 'GET') return new Response(form, {headers:{'set-cookie':'PHPSESSID=bootstrap; Path=/'}});
    if (url.href === loginUrl && options.method === 'POST') {
      assert.match(options.headers.cookie,/PHPSESSID=bootstrap/);
      const fields = new URLSearchParams(options.body);
      assert.equal(fields.get('csrf'),'a&b');
      assert.equal(fields.get('username'),'111');
      assert.equal(fields.get('password'),'test-password');
      return redirect('/yrdsb/finish.php', ['PHPSESSID=logged-in; Path=/']);
    }
    if (url.pathname === '/yrdsb/finish.php') {
      assert.equal(options.method,'GET');
      assert.match(options.headers.cookie,/PHPSESSID=logged-in/);
      return redirect('/live/students/listReports.php?student_id=567', ['session_token=token; Path=/', 'student_id=567; Path=/']);
    }
    assert.equal(url.href,courseListUrl+'?student_id=567');
    assert.match(options.headers.cookie,/session_token=token/);
    return new Response('<table><tr><td>ENG4U</td></tr></table>',{headers:{'set-cookie':'session_token=rotated; Path=/'}});
  }, async () => {
    const session = await client.login({},creds);
    assert.equal(session.studentId,'567');
    assert.match(session.cookie,/session_token=rotated/);
    assert.match(session.listHtml,/ENG4U/);
    assert.deepEqual(calls.map(c=>c.method),['POST','GET','POST','GET','GET']);
  });
});
test('session cookie names may change without treating a valid student landing as a bad password', async () => {
  await mocked(async (url, options) => {
    if(options.method === 'POST') return redirect(courseListUrl+'?student_id=567',['PHPSESSID=authenticated; Path=/']);
    if(String(url) === loginUrl) return new Response(form);
    return new Response('<h1>Your courses</h1>');
  },async()=>{assert.equal((await client.login({},creds)).studentId,'567');});
});
test('direct POST preserves the previously working route without requiring a login-page GET', async () => {
  const calls=[];
  await mocked(async (url, options) => {
    calls.push(options.method);
    if (options.method === 'GET' && String(url) === loginUrl) return new Response('', {status:403});
    if (options.method === 'POST') return redirect(courseListUrl+'?student_id=567',['session_token=abc; Path=/']);
    return new Response('<h1>Courses</h1>');
  }, async () => {
    assert.equal((await client.login({},creds)).studentId,'567');
    assert.deepEqual(calls,['POST','GET']);
  });
});
test('cookies from a combined header survive Expires commas; explicit deletions clear older values', () => {
  const jar = {old:'value'};
  mergeCookies(jar, {headers:{get:()=> 'first=one; Expires=Wed, 21 Oct 2099 07:28:00 GMT, second=two; Path=/, old=gone; Max-Age=0'}});
  assert.deepEqual(jar,{first:'one',second:'two'});
});
test('307/308 retain POST bodies only on the official origin; cross-origin credential redirects are blocked', async () => {
  let calls=0;
  await mocked(async(url,options)=>{
    calls++;
    if(options.method==='GET') return new Response(form);
    if(String(url)===loginUrl)return redirect('/yrdsb/submit.php',[],307);
    assert.equal(options.method,'POST');
    assert.equal(new URLSearchParams(options.body).get('password'),'test-password');
    return redirect('https://untrusted.example/collect',[],307);
  },async()=>{await assert.rejects(client.login({},creds),err=>err.code==='TA_REDIRECT_INVALID');assert.equal(calls,2);});
});
test('upstream blocks and rate limits are server errors, never password-rejection responses', async () => {
  for(const [status,code] of [[403,'TA_UPSTREAM_BLOCKED'],[429,'TA_RATE_LIMITED'],[503,'TA_UPSTREAM_UNAVAILABLE']]) {
    await mocked(async()=>new Response('',{status}),async()=>{
      const response=await worker.fetch(new Request('https://test/api/marks',{method:'POST',body:JSON.stringify(creds)}),{});
      assert.notEqual(response.status,401);
      const body=await response.json();assert.equal(body.code,code);assert.doesNotMatch(body.error,/test-password|111/);
    });
  }
});
test('missing cookies or missing student IDs get precise support codes instead of wrong-password messages', async () => {
  for(const [cookies,html,code] of [
    [[], '<a href="/live/students/listReports.php?student_id=567">Marks</a>', 'TA_SESSION_MISSING'],
    [['session_token=abc; Path=/'], '<h1>Signed in</h1>', 'TA_STUDENT_ID_MISSING'],
  ]) {
    await mocked(async(url,options)=>{
      if(options.method==='GET')return new Response(form);
      const headers=new Headers();cookies.forEach(c=>headers.append('set-cookie',c));
      return new Response(html,{headers});
    },async()=>{
      const response=await worker.fetch(new Request('https://test/api/marks',{method:'POST',body:JSON.stringify(creds)}),{});
      assert.equal(response.status,502);assert.equal((await response.json()).code,code);
    });
  }
});
test('an inconclusive direct rejection is retried once with bootstrap before reporting failure', async()=>{
  let posts=0;
  await mocked(async(url,options)=>{
    if(options.method==='GET')return new Response(form);
    posts++;return redirect('/yrdsb/index.php?error=1');
  },async()=>{
    await assert.rejects(client.login({},creds),err=>err instanceof TeachAssistError&&err.status===401&&err.code==='TA_LOGIN_REJECTED');
    assert.equal(posts,2);
  });
});
test('authenticated redirects refresh cookies; a returned login form is a session failure', async()=>{
  const session={jar:{session_token:'before'},cookie:'session_token=before',studentId:'567'};
  await mocked(async(url,options)=>{
    if(String(url)===courseListUrl+'?student_id=567')return redirect('/live/students/updated.php',['session_token=after; Path=/']);
    assert.match(options.headers.cookie,/session_token=after/);return new Response('<h1>Marks</h1>');
  },async()=>{assert.match(await client.fetchWithSession(courseListUrl+'?student_id=567',session,loginUrl),/Marks/);assert.match(session.cookie,/after/);});
  await mocked(async()=>new Response(form),async()=>{await assert.rejects(client.fetchWithSession(courseListUrl+'?student_id=567',session,loginUrl),err=>err.code==='TA_SESSION_REJECTED'&&err.status===502);});
});
