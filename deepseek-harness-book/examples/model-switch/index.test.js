import test from "node:test";
import assert from "node:assert/strict";
import { ModelSwitchAdapter, canSwitch, apply } from "./index.js";

const config = {
  provider: "switch",
  primary: { provider: "official", model: "pro" },
  fallback: { provider: "official", model: "flash" },
  defaultEffort: "off",
  maxTokens: 1024,
  switchCodes: ["SERVER", "RATE_LIMIT", "TRANSPORT"],
};
const failure = (code = "SERVER") => ({
  type: "finish",
  reason: { kind: "error", failure: { code, message: "fixture" } },
});
const success = { type: "finish", reason: { kind: "stop" } };
const text = { type: "text-delta", index: 0, text: "hello" };
const request = {
  provider: "switch",
  model: "auto",
  messages: [],
  system: "rule",
  tools: [],
  maxTokens: 1024,
  reasoningEffort: "off",
  signal: new AbortController().signal,
};
function setup(routes) {
  const calls = [];
  const ctx = {
    llm: {
      async *stream(options) {
        calls.push(options);
        yield* routes[options.model];
      },
      async resolveModelInfo(provider, model) {
        return {
          provider,
          id: model,
          context: { contextWindow: model === "pro" ? 9000 : 8000 },
          defaultMaxTokens: 2048,
          inputModalities: ["text"],
          reasoning: {
            efforts: [{ id: "off", name: "off" }],
            defaultEffort: "off",
          },
        };
      },
    },
  };
  return { adapter: new ModelSwitchAdapter(ctx, config), calls, ctx };
}
async function collect(stream) {
  const out = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

test("normal stream delivers a chunk before upstream completes", async () => {
  let release;
  const barrier = new Promise((resolve) => (release = resolve));
  const routes = {
    pro: (async function* () {
      yield text;
      await barrier;
      yield success;
    })(),
  };
  const { adapter, calls } = setup(routes),
    iterator = adapter.stream(request)[Symbol.asyncIterator]();
  assert.deepEqual((await iterator.next()).value, text);
  assert.equal(calls.length, 1);
  release();
  assert.deepEqual((await iterator.next()).value, success);
});
test("pre-output SERVER switches once and preserves request controls", async () => {
  const { adapter, calls } = setup({
    pro: [failure()],
    flash: [text, success],
  });
  assert.deepEqual(await collect(adapter.stream(request)), [text, success]);
  assert.deepEqual(
    calls.map((x) => x.model),
    ["pro", "flash"],
  );
  for (const call of calls)
    for (const key of [
      "messages",
      "system",
      "tools",
      "maxTokens",
      "reasoningEffort",
      "signal",
    ])
      assert.equal(call[key], request[key]);
});
for (const code of ["AUTH", "INVALID_REQUEST", "MISSING_CREDENTIAL"])
  test(`${code} never switches`, async () => {
    const { adapter, calls } = setup({
      pro: [failure(code)],
      flash: [success],
    });
    assert.deepEqual(await collect(adapter.stream(request)), [failure(code)]);
    assert.equal(calls.length, 1);
    assert.equal(canSwitch({ code }, false, undefined, [code]), false);
  });
for (const chunk of [
  text,
  { type: "reasoning-delta", index: 0, text: "reason" },
  {
    type: "tool-call-delta",
    index: 0,
    id: "call-1",
    name: "bash",
    argumentsDelta: "{",
  },
  { type: "block-start", index: 0, blockType: "text" },
  { type: "usage", usage: { inputTokens: 1, outputTokens: 0 } },
])
  test(`no switch after ${chunk.type}`, async () => {
    const { adapter, calls } = setup({
      pro: [chunk, failure()],
      flash: [success],
    });
    assert.deepEqual(await collect(adapter.stream(request)), [
      chunk,
      failure(),
    ]);
    assert.equal(calls.length, 1);
  });
test("both attempts fail without a third request", async () => {
  const { adapter, calls } = setup({ pro: [failure()], flash: [failure()] });
  assert.deepEqual(await collect(adapter.stream(request)), [failure()]);
  assert.equal(calls.length, 2);
});
test("cancellation before dispatch makes no upstream request", async () => {
  const { adapter, calls } = setup({ pro: [success] });
  const result = await collect(
    adapter.stream({ ...request, signal: AbortSignal.abort() }),
  );
  assert.equal(result[0].reason.kind, "aborted");
  assert.equal(calls.length, 0);
});
test("cancellation delivered as finish does not switch", async () => {
  const aborted = {
    type: "finish",
    reason: {
      kind: "aborted",
      failure: { code: "ABORTED", message: "cancelled" },
    },
  };
  const { adapter, calls } = setup({ pro: [aborted], flash: [success] });
  assert.deepEqual(await collect(adapter.stream(request)), [aborted]);
  assert.equal(calls.length, 1);
});
test("advertised limits are the intersection, not the primary alone", async () => {
  const { adapter } = setup({});
  const info = await adapter.resolveModel("switch", "auto");
  assert.equal(info.context.contextWindow, 8000);
  assert.equal(info.defaultMaxTokens, 1024);
});
test("drops adapter-private replay metadata from nested provider", async () => {
  const { adapter } = setup({
    pro: [{ ...success, replayState: { response: { id: "private" } } }],
  });
  assert.deepEqual(await collect(adapter.stream(request)), [success]);
});
test("recursive route rejected at load", () => {
  assert.throws(
    () =>
      apply({}, { ...config, primary: { provider: "switch", model: "auto" } }),
    /recursive/,
  );
});
test("unterminated stream is an error, not silent success or a fallback", async () => {
  const { adapter, calls } = setup({ pro: [] });
  await assert.rejects(collect(adapter.stream(request)), /without a finish/);
  assert.equal(calls.length, 1);
});
