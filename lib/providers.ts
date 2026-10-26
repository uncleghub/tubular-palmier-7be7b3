import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { store } from "./storage";
import { brand, demo } from "./config";
const exec = promisify(execFile);
export type ProviderResult = {
  key: string;
  width: number;
  height: number;
  duration?: number;
};
export interface ProviderAdapter {
  generate(job: {
    id: string;
    model_id: string;
    input: { ratio: string; duration?: number; prompt: string };
  }): Promise<ProviderResult>;
}
// No external adapter is enabled until official schemas, costs and commercial eligibility are verified.
export const sampleAdapter: ProviderAdapter = {
  async generate(j) {
    if (!demo) throw new Error("Sample generation is unavailable.");
    if (j.input.prompt === "[simulate failure]")
      throw new Error("Requested demo failure");
    if (j.model_id === "sample-image") {
      const [width, height] =
        j.input.ratio === "1:1"
          ? [1024, 1024]
          : j.input.ratio === "3:4"
            ? [768, 1024]
            : [1024, 576];
      const label = brand.name.replace(
        /[&<>"']/g,
        (character) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&apos;",
          })[character]!,
      );
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1024 1024"><defs><radialGradient id="g"><stop stop-color="#ea8351"/><stop offset="1" stop-color="#15293b"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><circle cx="515" cy="415" r="210" fill="#efbe91"/><path d="M0 800L280 450 540 800 790 560 1024 820V1024H0" fill="#203846"/><path d="M0 900L390 650 650 930 950 690 1024 840V1024H0" fill="#10202c"/><text x="50" y="970" fill="white" font-family="sans-serif" font-size="24">${label} · DEMO SAMPLE · NOT AI GENERATED</text></svg>`;
      const key = `outputs/${j.id}.svg`;
      await store(key, Buffer.from(svg), "image/svg+xml");
      return { key, width, height };
    }
    const duration = j.input.duration!;
    const [width, height] =
      j.input.ratio === "9:16" ? [720, 1280] : [1280, 720];
    const dir = await mkdtemp(path.join(tmpdir(), "studio-"));
    try {
      const f = path.join(dir, "sample.mp4");
      await exec(
        "ffmpeg",
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          `testsrc2=size=${width}x${height}:rate=24`,
          "-t",
          String(duration),
          "-c:v",
          "libx264",
          "-threads",
          "1",
          "-preset",
          "ultrafast",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          f,
        ],
        { timeout: 120000, maxBuffer: 1024 * 1024 },
      );
      const probe = await exec("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=width,height",
        "-of",
        "json",
        f,
      ]);
      const meta = JSON.parse(probe.stdout);
      const actual = Number(meta.format.duration);
      if (Math.abs(actual - duration) > 0.15)
        throw new Error("Output duration does not match");
      const key = `outputs/${j.id}.mp4`;
      await store(key, await readFile(f), "video/mp4");
      return {
        key,
        width: meta.streams[0].width,
        height: meta.streams[0].height,
        duration: actual,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};
