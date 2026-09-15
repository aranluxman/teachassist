import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requiredGrade,
  projectedGrade,
  weightedAverage,
  calculatePlan,
  localPlan,
} from "../frontend/js/grade-math.js";
import { interpretQuestion } from "../worker/src/assistant.js";
test("grade calculations match independently worked scenarios", () => {
  assert.ok(Math.abs(requiredGrade(85, 90, 30) - 101.6666666667) < 1e-8);
  assert.equal(projectedGrade(80, 100, 25), 85);
  assert.equal(
    weightedAverage([
      { score: 80, weight: 20 },
      { score: 100, weight: 30 },
    ]),
    92,
  );
  assert.equal(requiredGrade(90, 80, 100), 80);
});
test("invalid weights, missing data, and non-finite inputs cannot produce results", () => {
  for (const n of [-1, 101, NaN, Infinity, null, "90"])
    assert.throws(() => requiredGrade(n, 90, 30));
  assert.throws(() => requiredGrade(80, 90, 0));
  assert.throws(() => weightedAverage([]));
  assert.throws(() => weightedAverage([{ score: 80, weight: 0 }]));
  assert.throws(() => calculatePlan({ kind: "unknown" }));
});
test("impossible and already secured goals are explained", () => {
  assert.match(
    calculatePlan({ kind: "required", current: 85, target: 90, remaining: 30 })
      .text,
    /not reachable/,
  );
  assert.match(
    calculatePlan({ kind: "required", current: 100, target: 50, remaining: 10 })
      .text,
    /already secured/,
  );
});
test("offline parsing accepts only complete explicit syntax", () => {
  assert.deepEqual(localPlan("Current 85, target 90, remaining 30"), {
    kind: "required",
    current: 85,
    target: 90,
    remaining: 30,
  });
  assert.equal(localPlan("I have 85 and want 90"), null);
});
const request = (q) =>
  new Request("https://test/api/assistant", {
    method: "POST",
    body: JSON.stringify({ question: q }),
  });
test("AI plan is validated, not used as an answer", async () => {
  const result = await interpretQuestion(request("target grade"), {
    AI: {
      run: async () => ({
        response: '{"kind":"required","current":85,"target":90,"remaining":30}',
      }),
    },
  });
  assert.equal(result.status, 200);
  assert.equal(
    calculatePlan(result.body.plan).value,
    requiredGrade(85, 90, 30),
  );
});
test("AI failures and ambiguous questions have actionable states", async () => {
  assert.equal((await interpretQuestion(request("hello"), {})).status, 503);
  assert.equal(
    (
      await interpretQuestion(request("hello"), {
        AI: {
          run: async () => ({ response: '{"kind":"required","current":85}' }),
        },
      })
    ).status,
    502,
  );
  assert.equal(
    (
      await interpretQuestion(request("hello"), {
        AI: {
          run: async () => ({
            response: '{"clarification":"What is the remaining weight?"}',
          }),
        },
      })
    ).body.clarification,
    "What is the remaining weight?",
  );
});
test("oversized and malformed requests are rejected", async () => {
  assert.equal(
    (await interpretQuestion(request("x".repeat(1600)), { AI: {} })).status,
    400,
  );
  assert.equal(
    (await interpretQuestion(request("x".repeat(9000)), { AI: {} })).status,
    413,
  );
});
import { arithmetic } from "../frontend/js/grade-math.js";
test("arithmetic uses precedence, parentheses, percentages, roots, and right-associative powers", () => {
  assert.equal(arithmetic("2+3*4"), 14);
  assert.equal(arithmetic("(2+3)*4"), 20);
  assert.equal(arithmetic("2^3^2"), 512);
  assert.equal(arithmetic("-2^2"), -4);
  assert.equal(arithmetic("2^-2"), 0.25);
  assert.equal(arithmetic("sqrt(144)+2^3"), 20);
  assert.equal(arithmetic("80 * 25%"), 20);
  assert.ok(Math.abs(arithmetic(".1+.2") - 0.3) < 1e-12);
});
test("invalid arithmetic cannot execute code or return misleading values", () => {
  for (const exp of [
    "alert(1)",
    "1/0",
    "sqrt(-1)",
    "(2+3",
    "2**3",
    "2 3",
    "2(3)",
    "Infinity",
  ]) {
    assert.throws(() => arithmetic(exp), exp);
  }
});
import worker from '../worker/src/index.js';
test('assistant route requires authentication and allows only expected origins and methods',async()=>{const env={API_KEY:'test-only-key',AI:{run:async()=>({response:'{"clarification":"Supply the complete grade question."}'})}};const make=(method='POST',key='',origin='https://teachassist.pages.dev')=>new Request('https://worker.test/api/assistant',{method,headers:{'x-api-key':key,Origin:origin},...(method==='POST'?{body:'{"question":"hello"}'}:{})});assert.equal((await worker.fetch(make(),env,{})).status,401);assert.equal((await worker.fetch(make('GET'),env,{})).status,405);assert.equal((await worker.fetch(make('POST','test-only-key','https://other.test'),env,{})).status,403);const res=await worker.fetch(make('POST','test-only-key'),env,{});assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');});
test('null JSON question payload is rejected without throwing',async()=>{const res=await interpretQuestion(new Request('https://test/api/assistant',{method:'POST',body:'null'}),{AI:{}});assert.equal(res.status,400);});
