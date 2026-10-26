import { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "image",
    "video",
    "pricing",
    "help",
    "terms",
    "privacy",
    "refund",
    "acceptable-use",
  ].map((p) => ({
    url: `${process.env.APP_URL || "http://localhost:3000"}/${p}`,
    changeFrequency: "monthly",
    priority: p ? 0.6 : 1,
  }));
}
