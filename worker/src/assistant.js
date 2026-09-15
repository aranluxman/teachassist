import { calculatePlan } from "../../frontend/js/grade-math.js";
// No student records or credentials are included in model context.
export async function interpretQuestion(request, env) {
  if (!env.AI)
    return {
      status: 503,
      body: {
        error: "AI is not connected yet. The quick calculator works now.",
      },
    };
  const reader = request.body?.getReader();
  if (!reader) return { status: 400, body: { error: "Enter a question." } };
  let size = 0,
    chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      return { status: 413, body: { error: "Please shorten your question." } };
    }
    chunks.push(value);
  }
  let input;
  try {
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.length;
    }
    input = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { status: 400, body: { error: "Invalid question format." } };
  }
  if (
    typeof input?.question !== "string" ||
    !input.question.trim() ||
    input.question.length > 1500
  )
    return {
      status: 400,
      body: { error: "Enter a question of up to 1,500 characters." },
    };
  try {
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "system",
          content: `You extract math and grade calculation inputs. Return only one JSON object. Never calculate answers. Supported schemas: {"kind":"required","current":85,"target":90,"remaining":30}, {"kind":"projected","current":85,"score":90,"remaining":30}, {"kind":"average","rows":[{"score":85,"weight":70},{"score":90,"weight":30}]}. For arithmetic use {"kind":"arithmetic","expression":"(12 + 8) / 2"}. Supported arithmetic: numbers, + - * / ^ % sqrt() and parentheses only, no variables. Grade input numbers are percentages 0 to 100. Current means the average of completed work, remaining means percentage of the entire final grade still ungraded. Use only explicitly supplied numbers. Never assume an exam weight. For missing data, ambiguous questions, unsupported math, or unrelated questions return {"clarification":"a concise request for the missing inputs, asking the user to resubmit the complete question"}. Each request is independent; there is no conversation history.`,
        },
        { role: "user", content: input.question },
      ],
      max_tokens: 400,
      temperature: 0,
      response_format: { type: "json_object" },
    });
    const plan = JSON.parse(result.response);
    if (typeof plan.clarification === "string")
      return {
        status: 200,
        body: { clarification: plan.clarification.slice(0, 700) },
      };
    calculatePlan(plan); // Reject out-of-range, incomplete, or unsupported model outputs.
    return { status: 200, body: { plan } };
  } catch {
    return {
      status: 502,
      body: {
        error:
          "I could not interpret that reliably. Include your current grade, target, and remaining weight, or use the quick calculator.",
      },
    };
  }
}
