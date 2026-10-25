// Local stand-in for an HTTP API in tests: routes are "METHOD /path" → handler(req, body) returning
// { status, headers, body }. Every request is recorded in `calls`; an unknown route answers 404.
import { createServer } from "node:http";

export async function fakeApi(routes) {
  const calls = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const body = Buffer.concat(chunks);
      calls.push({ method: req.method, url: req.url, headers: req.headers, body });
      const handler = routes[`${req.method} ${req.url.split("?")[0]}`];
      const r = handler ? await handler(req, body) : { status: 404, body: "not found" };
      const payload = typeof r.body === "string" || Buffer.isBuffer(r.body) ? r.body : JSON.stringify(r.body ?? "");
      res.writeHead(r.status ?? 200, r.headers ?? {});
      res.end(payload);
    });
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, calls, close: () => new Promise((ok) => server.close(ok)) };
}
