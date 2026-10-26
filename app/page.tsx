import { demo } from "@/lib/config";
import Studio from "./studio";
export default function Home() {
  return <Studio page="home" isDemo={demo} />;
}

export const dynamic = "force-dynamic";
