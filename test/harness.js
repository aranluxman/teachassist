// Test-only worker: exposes the parser functions over HTTP so a Miniflare-based
// test can exercise the real HTMLRewriter code inside the Workers runtime.
import { parseCourseList, parseEvaluations } from "../src/index.js";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const html = await request.text();
    if (url.pathname === "/courses") {
      return Response.json(await parseCourseList(html));
    }
    if (url.pathname === "/evals") {
      return Response.json(await parseEvaluations(html));
    }
    return new Response("not found", { status: 404 });
  },
};
