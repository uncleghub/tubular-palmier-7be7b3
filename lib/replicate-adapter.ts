import { z } from "zod";
// Endpoints and payload checked against official SDK 1.4.0 source, 2026-10-26.
// No model-specific schema has been verified: this transport is NOT registered for paid use.
export class UnknownProviderOutcome extends Error {
  constructor() {
    super(
      "Provider submission outcome is unknown. Reconcile before resubmitting.",
    );
  }
}
const prediction = z.object({
  id: z.string(),
  status: z.string(),
  output: z.unknown().optional(),
});
export class ReplicateTransport {
  constructor(
    private token: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  async submit(version: string, input: Record<string, unknown>) {
    if (!/^[a-f0-9]{64}$/.test(version))
      throw new Error("A verified immutable model version is required.");
    // One POST only. The upstream SDK retries network exceptions, which is unsuitable
    // for a billable submission whose first outcome may be unknown.
    try {
      const r = await this.fetcher("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version, input }),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      if (!r.ok) throw new UnknownProviderOutcome();
      return prediction.parse(await r.json());
    } catch {
      throw new UnknownProviderOutcome();
    }
  }
  async reconcile(id: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id))
      throw new Error("Invalid provider identifier");
    // Reads are safe to retry; billable submissions are not.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await this.fetcher(
          `https://api.replicate.com/v1/predictions/${id}`,
          {
            headers: { Authorization: `Bearer ${this.token}` },
            signal: AbortSignal.timeout(15000),
            redirect: "error",
          },
        );
        if (!r.ok) throw new Error("Provider lookup failed");
        const p = prediction.parse(await r.json());
        if (p.id !== id) throw new Error("Provider identifier mismatch");
        const state =
          p.status === "succeeded"
            ? "succeeded"
            : ["failed", "canceled", "aborted"].includes(p.status)
              ? "failed"
              : p.status === "starting"
                ? "queued"
                : p.status === "processing"
                  ? "running"
                  : "uncertain";
        return {
          id: p.id,
          state,
          output: p.output,
          error:
            state === "failed"
              ? "The provider could not complete this generation."
              : null,
        };
      } catch {
        if (attempt === 2) throw new UnknownProviderOutcome();
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    throw new UnknownProviderOutcome();
  }
}
export const verifiedModelConfiguration = z.object({
  immutableVersion: z.string().regex(/^[a-f0-9]{64}$/),
  documentationChecked: z.string().date(),
  commercialTermsReviewed: z.literal(true),
  geographicEligibilityReviewed: z.literal(true),
  moderationReviewed: z.literal(true),
  providerCostMicros: z.number().int().positive(),
  credits: z.number().int().positive(),
  inputSchema: z.record(z.string(), z.unknown()),
});
