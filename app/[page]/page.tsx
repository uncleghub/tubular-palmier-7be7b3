import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { demo } from "@/lib/config";
import Studio from "../studio";
const pages = [
  "image",
  "video",
  "pricing",
  "dashboard",
  "library",
  "purchases",
  "settings",
  "help",
  "terms",
  "privacy",
  "refund",
  "acceptable-use",
  "admin",
  "sign-in",
  "sign-up",
];
export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const { page } = await params;
  return {
    title: page.replaceAll("-", " ").replace(/^./, (s) => s.toUpperCase()),
    robots: [
      "dashboard",
      "library",
      "purchases",
      "settings",
      "admin",
      "sign-in",
      "sign-up",
    ].includes(page)
      ? { index: false, follow: false }
      : undefined,
  };
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ page: string }>;
  searchParams: Promise<{ prompt?: string }>;
}) {
  const { page } = await params;
  const search = await searchParams;
  if (!pages.includes(page)) notFound();
  return (
    <Studio
      key={page}
      page={page}
      isDemo={demo}
      initialPrompt={(search.prompt || "").slice(0, 2000)}
    />
  );
}
