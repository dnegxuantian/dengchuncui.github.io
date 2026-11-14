import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

export const name = "book-model-switch";
export const inject = ["llm"];

// Cancellation, bad credentials, and malformed requests never become failover.
export function canSwitch(failure, committed, signal, allowedCodes) {
  return (
    !committed &&
    !signal?.aborted &&
    !["AUTH", "MISSING_CREDENTIAL", "INVALID_REQUEST", "ABORTED"].includes(
      failure.code,
    ) &&
    allowedCodes.includes(failure.code)
  );
}

function withoutReplay(chunk) {
  if (chunk.type !== "finish" || !("replayState" in chunk)) return chunk;
  const { replayState, ...plain } = chunk;
  return plain;
}

export class ModelSwitchAdapter {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
  }
  providerInfo(provider) {
    return { id: provider, name: "主备模型切换" };
  }
  providerRetryPolicy() {
    // This adapter already owns at most two attempts. Do not replay the whole
    // failed step, especially after a partial answer has reached the session.
    return {
      mode: "normal",
      maxRetries: 0,
      retryableCodes: ["SERVER"],
      initialDelayMs: 500,
      maxDelayMs: 1000,
      jitterRatio: 0,
    };
  }
  async listModels(provider) {
    return [{ provider, id: "auto", name: "主模型 → 备用模型" }];
  }
  async resolveModel(provider, model, signal) {
    if (model !== "auto")
      throw new Error("book-model-switch: model must be auto");
    const c = this.config;
    const [a, b] = await Promise.all(
      [c.primary, c.fallback].map((route) =>
        this.ctx.llm.resolveModelInfo(route.provider, route.model, signal),
      ),
    );
    const efforts = (a.reasoning?.efforts ?? []).filter((e) =>
      b.reasoning?.efforts.some((other) => other.id === e.id),
    );
    if (!efforts.some((e) => e.id === c.defaultEffort))
      throw new Error(
        "book-model-switch: defaultEffort must be supported by both models",
      );
    if (!a.context || !b.context)
      throw new Error(
        "book-model-switch: both routes must report a context window",
      );
    return {
      provider,
      id: model,
      name: "主模型 → 备用模型",
      context: {
        contextWindow: Math.min(
          a.context.contextWindow,
          b.context.contextWindow,
        ),
      },
      inputModalities: (a.inputModalities ?? ["text"]).filter((m) =>
        (b.inputModalities ?? ["text"]).includes(m),
      ),
      defaultMaxTokens: Math.min(
        c.maxTokens,
        a.defaultMaxTokens ?? c.maxTokens,
        b.defaultMaxTokens ?? c.maxTokens,
      ),
      reasoning: { efforts, defaultEffort: c.defaultEffort },
    };
  }
  async prepareCall(provider, model, signal) {
    return {
      model: await this.resolveModel(provider, model, signal),
      stream: (options) => this.stream(options),
    };
  }
  record(value) {
    if (this.config.auditFile)
      appendFileSync(
        this.config.auditFile,
        JSON.stringify({ time: new Date().toISOString(), ...value }) + "\n",
        { mode: 0o600 },
      );
  }
  async *stream(options) {
    const c = this.config,
      decisionId = randomUUID();
    const base = {
      decisionId,
      sessionId: options.sessionId,
      purpose: options.purpose ?? "conversation",
    };
    for (const [attempt, route] of [c.primary, c.fallback].entries()) {
      if (options.signal?.aborted) {
        this.record({ ...base, event: "cancelled-before-attempt", attempt });
        yield {
          type: "finish",
          reason: {
            kind: "aborted",
            failure: {
              code: "ABORTED",
              message: "Request cancelled before model dispatch",
            },
          },
        };
        return;
      }
      let committed = false,
        switchFailure;
      this.record({
        ...base,
        event: "attempt",
        attempt,
        provider: route.provider,
        model: route.model,
      });
      const request = {
        ...options,
        provider: route.provider,
        model: route.model,
      };
      for await (const chunk of this.ctx.llm.stream(request)) {
        if (chunk.type === "finish") {
          const failure =
            chunk.reason.kind === "error" ? chunk.reason.failure : undefined;
          if (
            attempt === 0 &&
            failure &&
            canSwitch(failure, committed, options.signal, c.switchCodes)
          ) {
            switchFailure = failure;
            break;
          }
          this.record({
            ...base,
            event: "finish",
            attempt,
            model: route.model,
            kind: chunk.reason.kind,
            committed,
            ...(failure ? { code: failure.code, status: failure.status } : {}),
          });
          yield withoutReplay(chunk);
          return;
        }
        // Even a block-start or usage event belongs to this attempt. Once
        // forwarded, no second model can silently replace that stream.
        committed = true;
        yield chunk;
      }
      if (!switchFailure) {
        throw new Error(
          "book-model-switch: upstream ended without a finish chunk",
        );
      }
      this.record({
        ...base,
        event: "switch",
        from: c.primary.model,
        to: c.fallback.model,
        code: switchFailure.code,
        status: switchFailure.status,
      });
    }
  }
}

export function apply(ctx, config) {
  for (const key of ["provider", "defaultEffort"])
    if (typeof config?.[key] !== "string" || !config[key].trim())
      throw new Error(`book-model-switch: ${key} required`);
  for (const key of ["primary", "fallback"]) {
    for (const field of ["provider", "model"])
      if (
        typeof config[key]?.[field] !== "string" ||
        !config[key][field].trim()
      )
        throw new Error(`book-model-switch: ${key}.${field} required`);
    if (config[key].provider === config.provider)
      throw new Error("book-model-switch: recursive provider route");
  }
  if (
    config.primary.provider === config.fallback.provider &&
    config.primary.model === config.fallback.model
  )
    throw new Error("book-model-switch: primary and fallback must differ");
  if (!Number.isSafeInteger(config.maxTokens) || config.maxTokens < 1)
    throw new Error("book-model-switch: maxTokens must be a positive integer");
  if (
    !Array.isArray(config.switchCodes) ||
    !config.switchCodes.length ||
    config.switchCodes.some((x) => typeof x !== "string" || !x)
  )
    throw new Error("book-model-switch: switchCodes required");
  if (
    config.auditFile !== undefined &&
    (typeof config.auditFile !== "string" || !config.auditFile)
  )
    throw new Error("book-model-switch: auditFile must be a non-empty path");
  if (config.auditFile) appendFileSync(config.auditFile, "", { mode: 0o600 });
  ctx.llm.registerAdapter(
    [config.provider],
    new ModelSwitchAdapter(ctx, structuredClone(config)),
  );
}
