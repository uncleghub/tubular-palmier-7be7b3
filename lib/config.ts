export const brand = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "GEEZ AI STUDIO",
  tagline:
    process.env.NEXT_PUBLIC_TAGLINE ||
    "Create images. Generate videos. Unlock your ideas.",
  support: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
};
export const demo = process.env.APP_MODE !== "production";
export const packages = [
  { id: "starter", name: "Starter", cents: 500, credits: 500 },
  { id: "creator", name: "Creator", cents: 1000, credits: 1000 },
  { id: "pro", name: "Pro", cents: 2000, credits: 2000 },
  { id: "premium", name: "Premium", cents: 5000, credits: 5000 },
] as const;
