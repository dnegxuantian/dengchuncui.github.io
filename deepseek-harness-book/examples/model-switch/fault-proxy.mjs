// Local exercise only. Faults are injected here, not incidents at DeepSeek.
// No request text, authorization headers, or response text is logged.
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { once } from "node:events";

const port = Number(process.env.BOOK_PROXY_PORT || 3095);
const audit = process.env.BOOK_PROXY_AUDIT;
const primary = process.env.BOOK_PRIMARY_MODEL || "deepseek-v4-pro";
const modes = [
  "normal",
  "primary-503",
  "primary-401",
  "primary-400",
  "both-503",
  "partial",
  "wait",
];
let mode = "normal";
function record(value) {
  const line =
    JSON.stringify({ time: new Date().toISOString(), ...value }) + "\n";
  if (audit) appendFileSync(audit, line, { mode: 0o600 });
  process.stdout.write(line);
}
function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}
const server = createServer(async (req, res) => {
  if (req.headers.origin) {
    json(res, 403, { error: "Browser-origin control is not allowed" });
    return;
  }
  if (req.url === "/mode" && req.method === "GET") {
    json(res, 200, { mode });
    return;
  }
  if (
    req.method !== "POST" ||
    !["/mode", "/chat/completions"].includes(req.url)
  ) {
    json(res, 404, { error: "Not found" });
    return;
  }
  const buffers = [];
  let bytes = 0;
  for await (const part of req) {
    bytes += part.length;
    if (bytes > 2 * 1024 * 1024) {
      json(res, 413, { error: "Exercise request too large" });
      return;
    }
    buffers.push(part);
  }
  const body = Buffer.concat(buffers);
  let input;
  try {
    input = JSON.parse(body.toString());
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }
  if (req.url === "/mode") {
    if (!modes.includes(input.mode)) {
      json(res, 400, { error: "Unknown mode", modes });
      return;
    }
    mode = input.mode;
    json(res, 200, { mode });
    return;
  }
  const id = randomUUID(),
    selected = mode,
    isPrimary = input.model === primary;
  record({ id, event: "request", model: input.model, mode: selected });
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });
  let status;
  if (selected === "both-503" || (isPrimary && selected === "primary-503"))
    status = 503;
  if (isPrimary && selected === "primary-401") status = 401;
  if (isPrimary && selected === "primary-400") status = 400;
  if (status) {
    record({ id, event: "injected-http", status });
    json(res, status, {
      error: { message: `Book exercise: injected HTTP ${status}` },
    });
    return;
  }
  if (isPrimary && selected === "wait") {
    record({ id, event: "waiting-for-cancel" });
    await once(abort.signal, "abort");
    record({ id, event: "client-cancelled" });
    return;
  }
  try {
    const headers = { "content-type": "application/json" };
    for (const [key, value] of Object.entries(req.headers)) {
      if (
        typeof value === "string" &&
        (key === "authorization" || key.startsWith("x-"))
      )
        headers[key] = value;
    }
    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers,
      body,
      signal: abort.signal,
    });
    res.writeHead(upstream.status, {
      "content-type":
        upstream.headers.get("content-type") || "text/event-stream",
    });
    record({ id, event: "upstream", status: upstream.status });
    const reader = upstream.body.getReader(),
      decoder = new TextDecoder();
    let pending = "",
      cut = false;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      if (selected === "partial" && isPrimary && upstream.ok) {
        pending += decoder.decode(item.value, { stream: true });
        let boundary;
        while ((boundary = pending.indexOf("\n\n")) >= 0) {
          const frame = pending.slice(0, boundary + 2);
          pending = pending.slice(boundary + 2);
          res.write(frame);
          const data = frame
            .split("\n")
            .find((line) => line.startsWith("data:"))
            ?.slice(5)
            .trim();
          let chunk;
          try {
            if (data && data !== "[DONE]") chunk = JSON.parse(data);
          } catch {
            /* Non-JSON frames are forwarded unchanged. */
          }
          if (chunk?.choices?.some((choice) => choice.delta?.content)) {
            record({ id, event: "cut-after-real-text" });
            await new Promise((resolve) => setTimeout(resolve, 250));
            res.destroy();
            abort.abort();
            cut = true;
            break;
          }
        }
        if (cut) break;
      } else if (!res.write(item.value))
        await once(res, "drain", { signal: abort.signal });
    }
    if (!cut) {
      if (pending) res.write(pending);
      res.end();
      record({ id, event: "complete" });
    }
  } catch (error) {
    record({
      id,
      event: abort.signal.aborted ? "cancelled" : "transport-error",
      name: error.name,
    });
    if (!res.headersSent)
      json(res, 502, {
        error: { message: "Book exercise proxy transport failure" },
      });
    else res.destroy();
  }
});
server.listen(port, "127.0.0.1", () =>
  record({ event: "listening", host: "127.0.0.1", port, mode }),
);
