import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// A single-container demonstration for hosts without a free dedicated worker.
// Commercial deployment must keep the web and durable worker services separate.
export function demoEnvironment(source) {
  if (source.APP_MODE !== "demo")
    throw new Error("The combined demo launcher requires APP_MODE=demo.");
  if (!source.DATABASE_URL)
    throw new Error(
      "Set DATABASE_URL in your hosting environment before starting the demo.",
    );
  const appUrl = source.APP_URL || source.RENDER_EXTERNAL_URL;
  if (!appUrl)
    throw new Error(
      "Set APP_URL, or use the Render-provided RENDER_EXTERNAL_URL.",
    );
  const url = new URL(appUrl);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("APP_URL must be an HTTP or HTTPS origin.");
  return { ...source, APP_URL: url.origin, APP_MODE: "demo" };
}

export async function launchDemo(source = process.env) {
  const env = demoEnvironment(source);
  const children = new Set();
  let stopping = false;
  let exitCode = 0;
  let forceStop;
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    exitCode = code;
    for (const child of children) child.kill("SIGTERM");
    if (!children.size) return resolveDone();
    forceStop = setTimeout(() => {
      for (const child of children) child.kill("SIGKILL");
    }, 10000);
    forceStop.unref();
  }
  const onTerm = () => stop(0);
  const onInt = () => stop(0);
  process.on("SIGTERM", onTerm);
  process.on("SIGINT", onInt);
  function start(args) {
    const child = spawn(process.execPath, args, { env, stdio: "inherit" });
    children.add(child);
    child.on("error", () => {
      console.error("A demo process could not start.");
      stop(1);
    });
    child.on("exit", () => {
      children.delete(child);
      if (stopping && !children.size) {
        clearTimeout(forceStop);
        resolveDone();
      }
    });
    return child;
  }
  try {
    const migration = start(["--import", "tsx", "scripts/migrate.ts"]);
    const migrated = await new Promise((resolve) => {
      migration.once("error", () => resolve(false));
      migration.once("exit", (code) => resolve(code === 0));
    });
    if (!migrated) stop(1);
    if (!stopping) {
      console.log(
        "Starting a demonstration web process and sample worker. No live generation or payments.",
      );
      for (const args of [
        ["--import", "tsx", "scripts/worker.ts"],
        ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"],
      ]) {
        const child = start(args);
        child.once("exit", (code) => {
          if (!stopping) stop(code || 1);
        });
      }
    }
    await done;
    return exitCode;
  } finally {
    process.off("SIGTERM", onTerm);
    process.off("SIGINT", onInt);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  launchDemo()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : "Demo startup failed.",
      );
      process.exitCode = 1;
    });
}
