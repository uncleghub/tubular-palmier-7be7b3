import { z } from "zod";
export type Model = {
  id: string;
  provider: string;
  providerId: string;
  name: string;
  kind: "image" | "video";
  tasks: string[];
  durations: number[];
  ratios: string[];
  resolutions: string[];
  audio: boolean;
  maxPrompt: number;
  maxUploadBytes: number;
  moderation: string;
  providerCostMicros: number | null;
  credits: number | null;
  enabled: boolean;
  verified: boolean;
  description: string;
};
export const models: Model[] = [
  {
    id: "sample-image",
    provider: "Local demo",
    providerId: "sample-image-v1",
    name: "Studio Canvas",
    kind: "image",
    tasks: ["text-to-image", "image-to-image"],
    durations: [],
    ratios: ["1:1", "3:4", "16:9"],
    resolutions: ["1024"],
    audio: false,
    maxPrompt: 2000,
    maxUploadBytes: 10485760,
    moderation: "Local demonstration; no external generation",
    providerCostMicros: 0,
    credits: 12,
    enabled: true,
    verified: true,
    description:
      "Explore the workflow with an illustrative sample. No AI inference.",
  },
  {
    id: "sample-video",
    provider: "Local demo",
    providerId: "sample-video-v1",
    name: "Studio Motion",
    kind: "video",
    tasks: ["text-to-video", "image-to-video"],
    durations: [6, 8],
    ratios: ["16:9", "9:16"],
    resolutions: ["720p"],
    audio: false,
    maxPrompt: 2000,
    maxUploadBytes: 10485760,
    moderation: "Local demonstration; no external generation",
    providerCostMicros: 0,
    credits: 80,
    enabled: true,
    verified: true,
    description: "A playable sample clip. No AI inference; silent, 720p.",
  },
  {
    id: "flux-schnell",
    provider: "Replicate",
    providerId: "black-forest-labs/flux-schnell",
    name: "FLUX Schnell",
    kind: "image",
    tasks: ["text-to-image"],
    durations: [],
    ratios: [],
    resolutions: [],
    audio: false,
    maxPrompt: 2000,
    maxUploadBytes: 0,
    moderation: "Provider policy review required",
    providerCostMicros: null,
    credits: null,
    enabled: false,
    verified: false,
    description:
      "Launch candidate. Documentation, pricing, terms and credentials need verification.",
  },
  {
    id: "veo",
    provider: "Replicate",
    providerId: "google/veo-3.1-fast",
    name: "Veo",
    kind: "video",
    tasks: [],
    durations: [],
    ratios: [],
    resolutions: [],
    audio: false,
    maxPrompt: 2000,
    maxUploadBytes: 0,
    moderation: "Provider policy review required",
    providerCostMicros: null,
    credits: null,
    enabled: false,
    verified: false,
    description:
      "Launch candidate. Exact model identifier and capabilities require verification.",
  },
];
export const inputSchema = z
  .object({
    modelId: z.string(),
    prompt: z.string().trim().min(3).max(2000),
    ratio: z.string(),
    resolution: z.string(),
    duration: z.number().int().optional(),
    referenceId: z.string().uuid().optional(),
    requestId: z.string().uuid(),
    quoteId: z.string().uuid().optional(),
    fundingSource: z
      .enum(["wallet", "free_preview", "subscription"])
      .optional(),
  })
  .strict();
export type GenerationInput = z.infer<typeof inputSchema>;
export function validateModel(input: GenerationInput, isDemo: boolean) {
  const m = models.find((m) => m.id === input.modelId);
  if (
    !m ||
    !m.enabled ||
    !m.verified ||
    m.credits === null ||
    m.providerCostMicros === null ||
    (!isDemo && m.provider === "Local demo")
  )
    throw new Error("This model is not available.");
  if (
    !m.ratios.includes(input.ratio) ||
    !m.resolutions.includes(input.resolution) ||
    input.prompt.length > m.maxPrompt ||
    (m.kind === "video" && !m.durations.includes(input.duration || 0)) ||
    (m.kind === "image" && input.duration !== undefined) ||
    (input.referenceId &&
      !m.tasks.includes(
        m.kind === "image" ? "image-to-image" : "image-to-video",
      ))
  )
    throw new Error("These settings are not supported by the selected model.");
  return m;
}
export function creditCost(
  providerMicros: number,
  paymentFeeBps = 500,
  overheadMicros = 10000,
  marginBps = 6000,
) {
  if (
    providerMicros < 0 ||
    marginBps < 0 ||
    paymentFeeBps < 0 ||
    marginBps + paymentFeeBps >= 10000
  )
    throw new Error("Invalid cost configuration");
  return Math.ceil(
    ((providerMicros + overheadMicros) * 10000) /
      ((10000 - marginBps - paymentFeeBps) * 10000),
  );
}
