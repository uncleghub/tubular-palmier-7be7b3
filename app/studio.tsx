/* eslint-disable @next/next/no-img-element */
"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignIn, SignUp, SignOutButton } from "@clerk/nextjs";
import {
  Sparkles,
  Image as ImageIcon,
  Video,
  LayoutDashboard,
  FolderOpen,
  Receipt,
  Settings,
  HelpCircle,
  ArrowUpRight,
  ArrowRight,
  Plus,
  ChevronDown,
  Upload,
  Download,
  Check,
  Clock,
  Menu,
  X,
  Shield,
  LogOut,
  Coins,
  Zap,
} from "lucide-react";
import { models } from "@/lib/catalog";
import { packages } from "@/lib/config";
import { freePreviewPlan } from "@/lib/free-plan";
import Discover from "./components/discover";
type FreePreviewState = {
  enabled: boolean;
  images: { remaining: number; reserved: number; used: number; total: number };
  videos: { remaining: number; reserved: number; used: number; total: number };
  imageModelId: string | null;
  videoModelId: string | null;
  videoSeconds: number;
};
type FundingSource = "wallet" | "free_preview" | "subscription";
type Subscription = {
  id: string;
  planId: string;
  planName: string;
  status: "active" | "past_due" | "canceled" | "expired";
  cancelAtPeriodEnd: boolean;
  periodStart: string;
  periodEnd: string;
  credits: {
    total: number;
    remaining: number;
    reserved: number;
    spent: number;
  };
  mode: "test";
};
type Job = {
  id: string;
  model_id: string;
  input: { prompt: string; ratio: string };
  credits: number;
  funding_source?: FundingSource;
  state: string;
  error?: string;
  width?: number;
  height?: number;
  duration?: number;
  created_at: string;
};
type Purchase = {
  id: string;
  package_id: string;
  cents: number;
  credits: number;
  status: string;
  created_at: string;
};
type Account = {
  wallet: { balance: number; reserved: number };
  freePreview?: FreePreviewState;
  subscription?: Subscription | null;
  jobs: Job[];
  purchases: Purchase[];
  ledger: {
    kind: string;
    amount: number;
    reason: string;
    created_at: string;
  }[];
  demo: boolean;
};
const name = process.env.NEXT_PUBLIC_APP_NAME || "GEEZ AI STUDIO";
const billingDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
function modalKeyboard(
  event: ReactKeyboardEvent<HTMLElement>,
  close: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
  if (event.key !== "Tab") return;
  const controls = event.currentTarget.querySelectorAll<HTMLElement>(
    'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]',
  );
  const first = controls[0],
    last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
async function api(path: string, body?: unknown, method?: string) {
  const r = await fetch("/api/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers:
      body instanceof FormData
        ? {}
        : body
          ? { "Content-Type": "application/json" }
          : {},
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Please try again.");
  return data;
}
export default function Studio({
  page,
  isDemo = true,
  initialPrompt = "",
  initialFreePreview = false,
}: {
  page: string;
  isDemo?: boolean;
  initialPrompt?: string;
  initialFreePreview?: boolean;
}) {
  const settingsVersion = useRef(0);
  const modalRef = useRef<HTMLElement>(null);
  const demo = isDemo;
  const router = useRouter();
  const [clientTime, setClientTime] = useState(() => Date.now());
  const [account, setAccount] = useState<Account | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false);
  const kind = page === "video" ? "video" : "image";
  const [modelId, setModelId] = useState(
    kind === "image" ? "sample-image" : "sample-video",
  );
  const model = models.find((m) => m.id === modelId)!;
  const [prompt, setPrompt] = useState(initialPrompt),
    [ratio, setRatio] = useState(kind === "image" ? "1:1" : "16:9"),
    [resolution, setResolution] = useState(kind === "image" ? "1024" : "720p"),
    [duration, setDuration] = useState(6),
    [referenceId, setReferenceId] = useState<string>(),
    [referenceName, setReferenceName] = useState(""),
    [fundingChoice, setFundingChoice] = useState<"auto" | FundingSource>(
      initialFreePreview ? "free_preview" : "auto",
    ),
    [quote, setQuote] = useState<{
      id: string;
      credits: number;
      fundingSource?: FundingSource;
    } | null>(null),
    [requestId, setRequestId] = useState(""),
    [purchase, setPurchase] = useState<{
      id: string;
      package: (typeof packages)[number];
    } | null>(null),
    [cancelDialog, setCancelDialog] = useState(false),
    [latest, setLatest] = useState<string>();
  const refresh = useCallback(async () => {
    try {
      setAccount(await api("account"));
    } catch {
      setAccount(null);
    }
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setClientTime(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    api("account")
      .then((a) => {
        if (active) setAccount(a);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!account?.jobs.some((j) => ["queued", "running"].includes(j.state)))
      return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [account, refresh]);
  useEffect(() => {
    if (!menu) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [menu]);
  useEffect(() => {
    if (!purchase && !cancelDialog) return;
    const previous = document.activeElement as HTMLElement | null;
    modalRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, [purchase, cancelDialog]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const signin = () =>
    run(async () => {
      if (!demo) {
        router.push("/sign-in");
        return;
      }
      await api("session", {});
      await refresh();
      setNotice(
        "Demo workspace ready. Your 1,000 test credits have no cash value.",
      );
    });
  const allowance = account?.freePreview;
  const remaining =
    kind === "image"
      ? allowance?.images.remaining || 0
      : allowance?.videos.remaining || 0;
  const freeModelId =
    kind === "image" ? allowance?.imageModelId : allowance?.videoModelId;
  const freeSettingsMatch =
    !!freeModelId &&
    modelId === freeModelId &&
    (kind === "image" ||
      duration === (allowance?.videoSeconds || freePreviewPlan.videoSeconds));
  const freeEligible =
    !!allowance?.enabled && remaining > 0 && freeSettingsMatch;
  const subscription = account?.subscription;
  const monthlyAvailable =
    !!subscription &&
    new Date(subscription.periodEnd).getTime() > clientTime &&
    ["active", "past_due"].includes(subscription.status);
  const monthlyRemaining = monthlyAvailable
    ? subscription.credits.remaining
    : 0;
  const monthlyEligible =
    monthlyAvailable && monthlyRemaining >= (model.credits || 0);
  const effectiveFunding: FundingSource =
    fundingChoice === "auto"
      ? freeEligible
        ? "free_preview"
        : monthlyEligible
          ? "subscription"
          : "wallet"
      : fundingChoice;
  const quoteFunding = quote?.fundingSource || effectiveFunding;
  const freeProblem = !allowance?.enabled
    ? "Free Preview is not available right now."
    : modelId !== freeModelId
      ? "This model is not included in Free Preview."
      : kind === "video" && duration !== allowance.videoSeconds
        ? `Free Preview includes one ${allowance.videoSeconds}-second video. Choose that duration or select Use credits.`
        : remaining < 1
          ? `Your free ${kind} allowance is used or reserved for another job. Select Use credits to continue.`
          : "";
  const fundingBlocked =
    (effectiveFunding === "free_preview" && !freeEligible) ||
    (effectiveFunding === "subscription" && !monthlyEligible);
  const input = () => ({
    fundingSource: quote?.fundingSource || effectiveFunding,
    modelId,
    prompt,
    ratio,
    resolution,
    ...(kind === "video" ? { duration } : {}),
    ...(referenceId ? { referenceId } : {}),
    requestId,
  });
  function change() {
    settingsVersion.current += 1;
    setQuote(null);
  }
  const dismissCheckout = () =>
    run(async () => {
      if (!purchase) return;
      try {
        await api("subscription/test-payment", {
          checkoutId: purchase.id,
          outcome: "canceled",
        });
      } finally {
        setPurchase(null);
        await refresh();
      }
    });
  const current =
    account?.jobs.find((j) => j.id === latest) ||
    account?.jobs.find((j) => j.model_id === modelId);
  const nav = [
    { href: "/", label: "Discover", icon: Sparkles },
    { href: "/image", label: "Image studio", icon: ImageIcon },
    { href: "/video", label: "Video studio", icon: Video },
  ];
  const work = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/library", label: "My creations", icon: FolderOpen },
    { href: "/purchases", label: "Purchase history", icon: Receipt },
  ];
  function navLink(n: (typeof nav)[number]) {
    const Icon = n.icon;
    return (
      <Link
        key={n.href}
        className={
          "navlink " +
          (n.href === (page === "home" ? "/" : "/" + page) ? "active" : "")
        }
        href={n.href}
        onClick={() => setMenu(false)}
      >
        <Icon size={18} />
        {n.label}
        {n.label === "Video studio" && <span className="tiny">NEW</span>}
      </Link>
    );
  }
  const heading = (eyebrow: string, title: string, description: string) => (
    <div className="page-heading">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
  return (
    <div className="shell">
      <a href="#main" className="skip">
        Skip to content
      </a>
      {menu && (
        <button
          className="nav-overlay"
          aria-label="Close navigation menu"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <Link className="brand" href="/" aria-label={name}>
          <span className="geez-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none">
              <path
                d="M32 11L20 4 7 12v16l13 8 13-8V18H19v7h7v1l-6 4-7-4V15l7-4 6 4"
                stroke="currentColor"
                strokeWidth="3.6"
                strokeLinejoin="round"
              />
              <circle cx="34" cy="6" r="3" fill="#fca16b" />
            </svg>
          </span>
          {name === "GEEZ AI STUDIO" ? (
            <span className="geez-wordmark">
              GEEZ<span>AI STUDIO</span>
            </span>
          ) : (
            <span className="custom-brand">{name}</span>
          )}
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="Close menu"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <div className="nav-label">CREATE & EXPLORE</div>
        <nav aria-label="Creation tools">{nav.map(navLink)}</nav>
        <div className="nav-label workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Your workspace">{work.map(navLink)}</nav>
        <div className="sidebar-bottom">
          <div className="credit-card">
            <div className="credit-card-title">
              <Zap size={16} /> A little fuel for big ideas
            </div>
            <p>Your next creation starts here.</p>
            <Link href="/pricing">
              Explore monthly plans <ArrowUpRight size={15} />
            </Link>
          </div>
          <Link className="navlink" href="/help">
            <HelpCircle size={18} />
            Help & resources <ArrowUpRight size={14} />
          </Link>
          <Link className="navlink" href="/settings">
            <Settings size={18} />
            Settings
          </Link>
          <div className="sidebar-foot">
            AN OPEN SPACE FOR BIG IDEAS.
            <span>
              © {new Date().getFullYear()} {name}
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-toggle icon-button"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <Link href="/" className="mobile-top-brand" aria-label={name}>
              {name === "GEEZ AI STUDIO" ? (
                <>
                  GEEZ<span>AI STUDIO</span>
                </>
              ) : (
                name
              )}
            </Link>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>
              {page === "home"
                ? "Discover"
                : page === "image"
                  ? "Image studio"
                  : page === "video"
                    ? "Video studio"
                    : page.charAt(0).toUpperCase() + page.slice(1)}
            </strong>
          </div>
          <div className="top-actions">
            <span className="mode-pill">
              <span />
              {demo ? "DEMO WORKSPACE" : "STUDIO PREVIEW"}
            </span>
            {account?.subscription && (
              <Link
                href="/settings#billing"
                className="balance monthly-balance"
                aria-label={`${monthlyRemaining} monthly credits available`}
              >
                <Coins size={16} /> {monthlyRemaining.toLocaleString()}
                <span>monthly</span>
              </Link>
            )}
            <Link href="/pricing" className="balance">
              <Coins size={16} />
              {account ? account.wallet.balance.toLocaleString() : "0"}{" "}
              <span>legacy credits</span>
              <Plus size={14} />
            </Link>
            {account ? (
              <button
                className="avatar"
                aria-label="Account settings"
                onClick={() => router.push("/settings")}
              >
                GZ
              </button>
            ) : (
              <Link href="/sign-in" className="small-sign">
                Sign in <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
        </header>
        <main id="main">
          <div className="demo-strip">
            <Shield size={14} />
            {demo
              ? "You’re exploring demo mode. Samples and test credits only. No real payments or AI generation."
              : "Private preview. Purchases and live generation are not yet open."}
          </div>
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "home" && <Discover />}
          {(page === "image" || page === "video") && (
            <>
              {heading(
                "YOUR CREATIVE WORKSPACE",
                kind === "image"
                  ? "Make the impossible, visible."
                  : "Give your imagination motion.",
                kind === "image"
                  ? "Describe your idea. Set the scene. Make it yours."
                  : "Explore short-form video, one idea at a time.",
              )}
              <div className="studio-grid">
                <section className="panel controls">
                  <div className="panel-title">
                    <Sparkles size={18} />
                    {kind === "image" ? "Image" : "Video"} studio
                    <span>DEMO</span>
                  </div>
                  <label htmlFor="model">Choose your model</label>
                  <div className="select-wrap">
                    <select
                      id="model"
                      value={modelId}
                      onChange={(e) => {
                        setModelId(e.target.value);
                        change();
                      }}
                    >
                      {models
                        .filter((m) => m.kind === kind)
                        .map((m) => (
                          <option key={m.id} value={m.id} disabled={!m.enabled}>
                            {m.name}
                            {!m.enabled ? " — unavailable" : " · demo"}
                          </option>
                        ))}
                    </select>
                    <ChevronDown size={16} />
                  </div>
                  <p className="field-hint">{model.description}</p>
                  {account && (
                    <fieldset className="funding-selector">
                      <legend>Choose how to generate</legend>
                      <label
                        className={
                          effectiveFunding === "free_preview"
                            ? "funding-option selected"
                            : "funding-option"
                        }
                      >
                        <input
                          type="radio"
                          name="generation-funding"
                          aria-label="Use Free Preview"
                          checked={effectiveFunding === "free_preview"}
                          onChange={() => {
                            setFundingChoice("free_preview");
                            change();
                          }}
                        />
                        <span>
                          <strong>Use Free Preview</strong>
                          <small>
                            {allowance?.enabled
                              ? `${remaining} ${kind}${remaining === 1 ? "" : "s"} available${kind === "video" ? ` · ${allowance.videoSeconds}s` : ""}`
                              : "Unavailable right now"}
                          </small>
                        </span>
                        <span className="funding-price">$0</span>
                      </label>
                      <label
                        className={
                          effectiveFunding === "subscription"
                            ? "funding-option selected"
                            : "funding-option"
                        }
                      >
                        <input
                          type="radio"
                          name="generation-funding"
                          aria-label="Use monthly credits"
                          checked={effectiveFunding === "subscription"}
                          onChange={() => {
                            setFundingChoice("subscription");
                            change();
                          }}
                        />
                        <span>
                          <strong>Use monthly credits</strong>
                          <small>
                            {monthlyAvailable && subscription
                              ? `${monthlyRemaining} available · until ${billingDate(subscription.periodEnd)}`
                              : "Choose a monthly plan to start"}
                          </small>
                        </span>
                        <span className="funding-price">
                          {model.credits} credits
                        </span>
                      </label>
                      <label
                        className={
                          effectiveFunding === "wallet"
                            ? "funding-option selected"
                            : "funding-option"
                        }
                      >
                        <input
                          type="radio"
                          name="generation-funding"
                          aria-label="Use credits"
                          checked={effectiveFunding === "wallet"}
                          onChange={() => {
                            setFundingChoice("wallet");
                            change();
                          }}
                        />
                        <span>
                          <strong>Use credits</strong>
                          <small>Pay from your separate legacy wallet</small>
                        </span>
                        <span className="funding-price">
                          {model.credits} credits
                        </span>
                      </label>
                      <p className="funding-help">
                        {demo
                          ? "Free Preview, monthly credits and your 1,000 legacy test credits are separate. All produce demo samples."
                          : "Free Preview is a one-time allowance per verified account."}
                      </p>
                      {fundingBlocked && (
                        <p className="funding-warning" role="status">
                          {effectiveFunding === "subscription"
                            ? "Your monthly allowance is unavailable or insufficient. Choose a different funding option or manage your plan. No wallet credits will be charged automatically."
                            : freeProblem}
                        </p>
                      )}
                    </fieldset>
                  )}
                  <label htmlFor="prompt">
                    Your prompt <span>Be as imaginative as you like</span>
                  </label>
                  <textarea
                    id="prompt"
                    value={prompt}
                    maxLength={2000}
                    onChange={(e) => {
                      setPrompt(e.target.value);
                      change();
                    }}
                    placeholder={
                      kind === "image"
                        ? "A sunlit archway overlooking a tranquil sea, warm stone textures, cinematic light…"
                        : "An otherworldly landscape at golden hour, a slow cinematic camera glide…"
                    }
                  />
                  <div className="prompt-meta">
                    <button
                      onClick={() => {
                        setPrompt(
                          [
                            "A cinematic photograph of copper dunes at sunset, fine sand textures and warm atmospheric light",
                            "An editorial portrait in soft natural light, ivory fabric and an emerald background",
                            "A sculptural chrome ribbon, dark graphite studio and subtle teal reflections",
                            "A sunlit limestone arch overlooking a turquoise Mediterranean sea",
                          ][Math.floor(Math.random() * 4)],
                        );
                        change();
                      }}
                    >
                      <Sparkles size={13} /> Inspire me
                    </button>
                    <span>{prompt.length}/2000</span>
                  </div>
                  <label htmlFor="reference">
                    Reference image <span>Optional</span>
                  </label>
                  <label className="upload-area" htmlFor="reference">
                    <Upload size={22} />
                    <strong>{referenceName || "Add a reference image"}</strong>
                    <span>PNG, JPG or WebP · up to 10 MB</span>
                    <input
                      type="file"
                      id="reference"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f)
                          void run(async () => {
                            if (!account)
                              throw new Error("Sign in to upload a reference.");
                            const form = new FormData();
                            form.set("file", f);
                            const result = await api("uploads", form);
                            setReferenceId(result.id);
                            setReferenceName(f.name);
                            change();
                          });
                      }}
                    />
                  </label>
                  {referenceId && (
                    <p className="field-hint">
                      Demo mode stores this reference privately; the sample does
                      not reflect its content.
                    </p>
                  )}
                  <div className="setting-row">
                    <div>
                      <label htmlFor="ratio">Aspect ratio</label>
                      <select
                        id="ratio"
                        value={ratio}
                        onChange={(e) => {
                          setRatio(e.target.value);
                          change();
                        }}
                      >
                        {model.ratios.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="resolution">Resolution</label>
                      <select
                        id="resolution"
                        value={resolution}
                        onChange={(e) => {
                          setResolution(e.target.value);
                          change();
                        }}
                      >
                        {model.resolutions.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    {kind === "video" && (
                      <div>
                        <label htmlFor="duration">Duration</label>
                        <select
                          id="duration"
                          value={duration}
                          onChange={(e) => {
                            setDuration(Number(e.target.value));
                            change();
                          }}
                        >
                          {model.durations.map((d) => (
                            <option key={d} value={d}>
                              {d} seconds
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="quote-row">
                    <span>
                      <Coins size={16} />{" "}
                      {quote ? "Your locked quote" : "Estimated cost"}
                    </span>
                    <strong>
                      {quoteFunding === "free_preview" ? "Free Preview · " : ""}
                      {quoteFunding === "subscription"
                        ? "Monthly allowance · "
                        : ""}
                      {quote?.credits ??
                        (effectiveFunding === "free_preview"
                          ? 0
                          : model.credits)}{" "}
                      credits
                    </strong>
                  </div>
                  {!account ? (
                    <button
                      className="primary full"
                      onClick={signin}
                      disabled={busy}
                    >
                      {demo ? "Start a demo session" : "Sign in to continue"}{" "}
                      <ArrowRight size={17} />
                    </button>
                  ) : (
                    <button
                      className="primary full"
                      disabled={
                        busy || prompt.trim().length < 3 || fundingBlocked
                      }
                      onClick={() =>
                        run(async () => {
                          if (!quote) {
                            const id = crypto.randomUUID();
                            setRequestId(id);
                            const quotedVersion = settingsVersion.current;
                            const q = await api("quote", {
                              ...input(),
                              requestId: id,
                            });
                            if (quotedVersion === settingsVersion.current)
                              setQuote(q);
                          } else {
                            const j = await api("jobs", {
                              ...input(),
                              quoteId: quote.id,
                            });
                            setLatest(j.id);
                            setQuote(null);
                            await refresh();
                            setNotice(
                              "Demo job queued. You can leave this page and return to your library.",
                            );
                          }
                        })
                      }
                    >
                      {busy
                        ? "One moment…"
                        : quote
                          ? "Confirm & create sample"
                          : "Get exact credit quote"}
                      <Sparkles size={17} />
                    </button>
                  )}
                  <p className="fine-print">
                    {quoteFunding === "free_preview"
                      ? quote
                        ? "Quote expires in 5 minutes. Confirm to reserve one free generation."
                        : "No wallet credits are charged. Confirmed failures restore your free allowance."
                      : quote
                        ? "Quote expires in 5 minutes. Confirm to reserve credits."
                        : "Credits are reserved on confirmation and returned on confirmed failure."}
                  </p>
                </section>
                <section className="panel preview">
                  <div className="panel-title">
                    <span>YOUR CANVAS</span>
                    <span>{current?.state || "READY WHEN YOU ARE"}</span>
                  </div>
                  {current ? (
                    <div className="result">
                      <div className="result-art">
                        {current.state === "succeeded" ? (
                          kind === "image" ? (
                            <img
                              src={"/api/download/" + current.id}
                              alt="Demo sample output"
                            />
                          ) : (
                            <video
                              controls
                              src={"/api/download/" + current.id}
                            />
                          )
                        ) : (
                          <div className="empty-preview">
                            <Clock size={40} />
                            <h2>
                              {current.state === "failed"
                                ? "Let’s try a fresh start."
                                : current.state === "uncertain"
                                  ? "Checking the outcome."
                                  : "Your idea is on its way."}
                            </h2>
                            <p>
                              {current.error ||
                                "The worker is preparing your demo sample."}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="result-info">
                        <span className="tag">
                          DEMO SAMPLE · NOT AI GENERATED
                        </span>
                        <p>{current.input.prompt}</p>
                        <div>
                          {current.width &&
                            `${current.width} × ${current.height}`}
                          {current.duration && ` · ${current.duration}s`} ·{" "}
                          {current.funding_source === "free_preview"
                            ? "Free Preview"
                            : `${current.credits} ${current.funding_source === "subscription" ? "monthly credits" : "wallet credits"}`}
                        </div>
                        {current.state === "succeeded" && (
                          <a
                            className="primary"
                            href={"/api/download/" + current.id}
                          >
                            <Download size={16} /> Download sample
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="empty-preview">
                      <div className="canvas-symbol">
                        <Sparkles size={38} />
                      </div>
                      <h2>Great things start with an idea.</h2>
                      <p>
                        Your creation will appear here.
                        <br />
                        Write a prompt to get started.
                      </p>
                      <span className="empty-foot">
                        A SPACE FOR YOUR IMAGINATION
                      </span>
                    </div>
                  )}
                </section>
              </div>
              <div className="model-note">
                <Shield size={17} />
                <p>
                  External AI models are unavailable until their capabilities,
                  costs and credentials are verified. Demo outputs are
                  illustrative samples and do not interpret your prompt.
                </p>
              </div>
            </>
          )}
          {page === "pricing" && (
            <>
              {heading(
                "A LITTLE FUEL FOR YOUR IDEAS",
                "More room to create.",
                "Monthly plans with a fresh allowance each paid month. Cancel renewal in account settings.",
              )}
              <div className="pricing-notice">
                <Shield size={18} />
                <p>
                  <strong>Test checkout only.</strong> No money is collected.
                  Monthly billing is simulated. No real subscription or card
                  charge is created.
                </p>
              </div>
              <section className="panel free-preview-card" id="free-preview">
                <div className="free-preview-intro">
                  <span className="tag">START WITH FREE PREVIEW</span>
                  <h2>A little room to try your ideas.</h2>
                  <p>
                    {freePreviewPlan.images} images and {freePreviewPlan.videos}{" "}
                    {freePreviewPlan.videoSeconds}-second video, once per
                    verified account. No card or credit purchase needed.
                  </p>
                  <ul>
                    <li>
                      <Check size={16} /> Separate from purchased credits
                    </li>
                    <li>
                      <Check size={16} /> No subscription or daily reset
                    </li>
                    <li>
                      <Check size={16} /> Confirmed failures restore the
                      allowance
                    </li>
                  </ul>
                  <p className="free-preview-disclosure">
                    {demo
                      ? "Available now as a demo with sample media. Live AI generation is not connected."
                      : "Free model availability depends on the launch configuration. Verified sign-in is required."}
                  </p>
                </div>
                <div className="free-preview-action">
                  <div className="free-preview-price">
                    $0<span>one-time preview</span>
                  </div>
                  {account && !account.freePreview?.enabled ? (
                    <button className="secondary" disabled>
                      Free Preview unavailable
                    </button>
                  ) : (
                    <Link
                      className="primary"
                      href={
                        account
                          ? "/image?free=1"
                          : demo
                            ? "/sign-in"
                            : "/sign-up"
                      }
                    >
                      Try Free Preview <ArrowUpRight size={17} />
                    </Link>
                  )}
                  {account?.freePreview?.enabled && (
                    <span>
                      {account.freePreview.images.remaining} images ·{" "}
                      {account.freePreview.videos.remaining} video remaining
                    </span>
                  )}
                </div>
              </section>
              <div className="pricing-grid">
                {packages.map((p, i) => (
                  <section
                    className={
                      "panel price-card " + (i === 1 ? "featured" : "")
                    }
                    key={p.id}
                  >
                    {i === 1 && (
                      <div className="popular">A LITTLE MORE POSSIBILITY</div>
                    )}
                    <span className="pack-icon">
                      <Zap size={24} />
                    </span>
                    <h2>{p.name}</h2>
                    <p>
                      {
                        [
                          "For that first spark.",
                          "Keep the ideas flowing.",
                          "Room for bigger projects.",
                          "For your creative momentum.",
                        ][i]
                      }
                    </p>
                    <div className="price">
                      ${p.cents / 100}
                      <span>USD / month</span>
                    </div>
                    <div className="pack-credits">
                      <Coins size={18} />
                      <strong>{p.credits.toLocaleString()}</strong> credits /
                      month
                    </div>
                    <ul>
                      <li>
                        <Check size={15} /> Image & video demo workflow
                      </li>
                      <li>
                        <Check size={15} /> Monthly renewal · cancel anytime
                      </li>
                      <li>
                        <Check size={15} /> Allowance resets each paid month
                      </li>
                    </ul>
                    <button
                      className={i === 1 ? "primary full" : "secondary full"}
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          if (!account) {
                            if (!demo) {
                              router.push("/sign-up");
                              return;
                            }
                            await api("session", {});
                            await refresh();
                          }
                          if (!demo) {
                            setNotice(
                              "Monthly subscriptions are not open for real payments yet.",
                            );
                            return;
                          }
                          const checkout = await api("subscription/checkout", {
                            planId: p.id,
                          });
                          if (checkout.url) {
                            window.location.href = checkout.url;
                          } else setPurchase(checkout);
                        })
                      }
                    >
                      Try {p.name} monthly plan <ArrowUpRight size={16} />
                    </button>
                  </section>
                ))}
              </div>
              <div className="pricing-explainer">
                <h2>Credits, explained.</h2>
                <p>
                  Each monthly plan includes a fixed allowance, not unlimited
                  generation. Unused monthly credits expire at the end of the
                  paid period and do not roll over. Each successful renewal
                  starts a fresh allowance. Cancel renewal in Settings →
                  Billing; your paid access continues until the period ends.
                  Demo images cost 12 credits and demo videos cost 80 credits.
                  Live model prices have not been configured.
                </p>
                <p>
                  All prices are in US dollars. The final amount and any
                  applicable tax must be disclosed before live payment.{" "}
                  <Link href="/refund">
                    Read the refund policy <ArrowUpRight size={13} />
                  </Link>
                </p>
              </div>
            </>
          )}
          {["dashboard", "library", "purchases"].includes(page) && (
            <>
              {heading(
                "YOUR WORKSPACE",
                page === "library"
                  ? "Every idea, in one place."
                  : page === "purchases"
                    ? "Your billing history."
                    : "Welcome to your creative space.",
                page === "library"
                  ? "Return to your creations and download the moments you love."
                  : "Keep track of your balance, activity and creative journey.",
              )}
              {!account ? (
                <section className="panel signed-out">
                  <FolderOpen size={40} />
                  <h2>Your workspace is waiting.</h2>
                  <p>
                    Sign in to access your private library, credits and purchase
                    history.
                  </p>
                  <Link className="primary" href="/sign-in">
                    Sign in <ArrowRight size={16} />
                  </Link>
                </section>
              ) : (
                <>
                  {page === "dashboard" && account.freePreview && (
                    <FreePreviewAllowance
                      allowance={account.freePreview}
                      demo={demo}
                    />
                  )}
                  {subscription &&
                    (page === "dashboard" || page === "purchases") && (
                      <section
                        className="panel subscription-summary"
                        aria-label="Your monthly plan"
                      >
                        <div>
                          <span className="tag">MONTHLY PLAN · DEMO</span>
                          <h2>{subscription.planName}</h2>
                          <p>
                            {monthlyRemaining.toLocaleString()} monthly credits
                            available ·{" "}
                            {subscription.cancelAtPeriodEnd
                              ? "Access until"
                              : "Period ends"}{" "}
                            {billingDate(subscription.periodEnd)}
                          </p>
                        </div>
                        <Link href="/settings#billing" className="secondary">
                          Manage subscription <ArrowUpRight size={16} />
                        </Link>
                      </section>
                    )}
                  {page === "dashboard" && (
                    <div className="stats-grid">
                      {[
                        [
                          "Legacy wallet credits",
                          account.wallet.balance.toLocaleString(),
                        ],
                        ["Monthly credits available", String(monthlyRemaining)],
                        [
                          "Creations",
                          String(
                            account.jobs.filter((j) => j.state === "succeeded")
                              .length,
                          ),
                        ],
                      ].map(([l, v]) => (
                        <div className="panel stat" key={l}>
                          <span>{l}</span>
                          <strong>{v}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                  {page !== "purchases" && (
                    <>
                      <div className="section-heading">
                        <h2>
                          {page === "dashboard"
                            ? "Recent creations"
                            : "My creations"}
                        </h2>
                        <Link className="text-link" href="/image">
                          Create something new <Plus size={16} />
                        </Link>
                      </div>
                      {account.jobs.length ? (
                        <div className="jobs-grid">
                          {account.jobs.map((j) => (
                            <div className="panel job-card" key={j.id}>
                              <div className="job-art">
                                {j.state === "succeeded" ? (
                                  j.model_id === "sample-image" ? (
                                    <img
                                      src={"/api/download/" + j.id}
                                      alt="Illustrative demo output"
                                    />
                                  ) : (
                                    <video
                                      controls
                                      preload="metadata"
                                      src={"/api/download/" + j.id}
                                    />
                                  )
                                ) : (
                                  <div>
                                    <Clock />
                                    <p>{j.state}</p>
                                  </div>
                                )}
                                <span className="tag">DEMO SAMPLE</span>
                              </div>
                              <div className="job-details">
                                <strong>
                                  {j.input.prompt || "Deleted prompt"}
                                </strong>
                                <p>
                                  {j.state} ·{" "}
                                  {j.funding_source === "free_preview"
                                    ? "Free Preview"
                                    : `${j.credits} ${j.funding_source === "subscription" ? "monthly credits" : "wallet credits"}`}{" "}
                                  {j.width && `· ${j.width} × ${j.height}`}{" "}
                                  {j.duration && `· ${j.duration}s`}
                                </p>
                                {j.error && <p role="status">{j.error}</p>}
                                {j.state === "succeeded" && (
                                  <a href={"/api/download/" + j.id}>
                                    <Download size={15} /> Download sample
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="panel empty-state">
                          <ImageIcon size={35} />
                          <h3>Your next idea belongs here.</h3>
                          <p>
                            You haven’t created anything yet. Start with a few
                            words.
                          </p>
                          <Link className="primary" href="/image">
                            Open image studio <ArrowRight size={16} />
                          </Link>
                        </div>
                      )}
                    </>
                  )}
                  {page === "purchases" && (
                    <div className="panel table-panel">
                      <h2>Legacy one-time test purchases</h2>
                      <p className="fine-print">
                        Previous demo purchase records are retained separately
                        from your monthly subscription.
                      </p>
                      <table>
                        <thead>
                          <tr>
                            <th>Package</th>
                            <th>Amount</th>
                            <th>Credits</th>
                            <th>Status</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {account.purchases.map((p) => (
                            <tr key={p.id}>
                              <td>{p.package_id}</td>
                              <td>${(p.cents / 100).toFixed(2)} USD</td>
                              <td>{p.credits}</td>
                              <td>
                                <span className="tag">TEST · {p.status}</span>
                              </td>
                              <td>
                                {new Date(p.created_at).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!account.purchases.length && (
                        <div className="empty-state">
                          <Receipt />
                          <h3>A clean slate.</h3>
                          <p>Your test purchases will appear here.</p>
                          <Link href="/pricing" className="primary">
                            Explore monthly plans
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                  {page === "dashboard" && (
                    <section className="panel table-panel">
                      <h2>Legacy wallet activity</h2>
                      <table>
                        <thead>
                          <tr>
                            <th>Activity</th>
                            <th>Credits</th>
                            <th>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {account.ledger.map((l, i) => (
                            <tr key={i}>
                              <td>{l.kind}</td>
                              <td>
                                {l.amount > 0 ? "+" : ""}
                                {l.amount}
                              </td>
                              <td>{l.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="fine-print">
                        Reservations move available credits into held funds. A
                        completed spend settles the reservation; it does not
                        charge your available balance a second time.
                      </p>
                    </section>
                  )}
                </>
              )}
            </>
          )}
          {(page === "sign-in" || page === "sign-up") && (
            <>
              {heading(
                "YOUR IDEAS, YOUR SPACE",
                page === "sign-in"
                  ? "Welcome back."
                  : "Start something wonderful.",
                "A private workspace for your creative journey.",
              )}
              <section className="panel auth-panel">
                {demo ? (
                  <>
                    <span className="pack-icon">
                      <Sparkles size={30} />
                    </span>
                    <h2>Explore the studio</h2>
                    <p>
                      Start a private demo session with 1,000 test credits. No
                      email, card or real payment required. Demo access is
                      stored in this browser for seven days.
                    </p>
                    <p className="free-signin-note">
                      Your separate Free Preview includes{" "}
                      {freePreviewPlan.images} sample images and{" "}
                      {freePreviewPlan.videos} {freePreviewPlan.videoSeconds}
                      -second sample video. Live accounts will require verified
                      sign-in.
                    </p>
                    <button
                      className="primary full"
                      onClick={signin}
                      disabled={busy}
                    >
                      {account ? "Start a fresh demo" : "Enter demo workspace"}
                      <ArrowRight size={17} />
                    </button>
                    {account && (
                      <Link href="/dashboard" className="secondary full">
                        Go to my workspace
                      </Link>
                    )}
                    <p className="fine-print">
                      Live account registration will use Clerk after secure
                      configuration.
                    </p>
                  </>
                ) : page === "sign-in" ? (
                  <SignIn routing="hash" />
                ) : (
                  <SignUp routing="hash" />
                )}
              </section>
            </>
          )}
          {page === "settings" && (
            <>
              {heading(
                "MAKE YOURSELF AT HOME",
                "Account settings.",
                "Manage your session and understand your data.",
              )}
              <section
                className="panel subscription-billing"
                id="billing"
                aria-label="Subscription billing"
              >
                <div className="subscription-heading">
                  <div>
                    <span className="tag">MONTHLY MEMBERSHIP</span>
                    <h2>Billing</h2>
                  </div>
                  <span className="tag">
                    {demo ? "DEMO · NO MONEY CHARGED" : "LIVE BILLING NOT OPEN"}
                  </span>
                </div>
                {subscription ? (
                  <>
                    <div className="subscription-details">
                      <div>
                        <span>Your plan</span>
                        <strong>{subscription.planName}</strong>
                      </div>
                      <div>
                        <span>Status</span>
                        <strong>
                          {subscription.cancelAtPeriodEnd && monthlyAvailable
                            ? "Renewal canceled"
                            : subscription.status.replaceAll("_", " ")}
                        </strong>
                      </div>
                      <div>
                        <span>Monthly credits available</span>
                        <strong>
                          {monthlyRemaining.toLocaleString()} /{" "}
                          {subscription.credits.total.toLocaleString()}
                        </strong>
                      </div>
                      <div>
                        <span>
                          {subscription.cancelAtPeriodEnd || !monthlyAvailable
                            ? "Access until"
                            : demo
                              ? "Simulated renewal date"
                              : "Next renewal"}
                        </span>
                        <strong>{billingDate(subscription.periodEnd)}</strong>
                      </div>
                    </div>
                    <p>
                      {subscription.cancelAtPeriodEnd
                        ? monthlyAvailable
                          ? `You have unsubscribed from renewal. Your current allowance remains available until ${billingDate(subscription.periodEnd)}. There will be no new renewal unless you resume.`
                          : "Your paid period has ended and renewal is canceled. Choose a new monthly plan if you want to subscribe again."
                        : "Your plan renews monthly after each successful payment. Unused monthly credits expire at the end of the paid period and do not roll over."}
                    </p>
                    {demo && (
                      <p className="fine-print">
                        This is a simulated subscription. No card is charged and
                        no automatic payment runs. A new allowance requires a
                        successful simulated renewal.
                      </p>
                    )}
                    <div className="subscription-actions">
                      {subscription.cancelAtPeriodEnd ? (
                        monthlyAvailable && (
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await api("subscription/resume", {
                                  subscriptionId: subscription.id,
                                });
                                await refresh();
                                setNotice(
                                  "Subscription renewal resumed. No money was charged in this demo.",
                                );
                              })
                            }
                          >
                            Resume subscription
                          </button>
                        )
                      ) : (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => setCancelDialog(true)}
                        >
                          Cancel subscription
                        </button>
                      )}
                      {!monthlyAvailable && (
                        <Link className="primary" href="/pricing">
                          Choose a monthly plan
                        </Link>
                      )}
                      <Link className="text-link" href="/pricing">
                        View monthly plans <ArrowUpRight size={16} />
                      </Link>
                    </div>
                    <p className="fine-print">
                      Cancel subscription unsubscribes you from future billing.
                      Your account and saved work remain. Cancellation does not
                      automatically refund the current period; applicable
                      consumer rights still apply.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      {account
                        ? "You do not have a monthly subscription. Free Preview and legacy wallet credits remain separate."
                        : "Sign in to view or manage your monthly subscription."}
                    </p>
                    <Link
                      className="primary"
                      href={account ? "/pricing" : "/sign-in"}
                    >
                      {account ? "Explore monthly plans" : "Sign in"}
                      <ArrowUpRight size={16} />
                    </Link>
                  </>
                )}
              </section>
              <section className="panel prose">
                <h2>Your account</h2>
                <p>
                  {account
                    ? demo
                      ? "You are signed into a private demo workspace."
                      : "You are signed into your private account."
                    : "You are not signed in."}{" "}
                  Prompts and media are private.{" "}
                  {demo
                    ? "Demo sessions are temporary and cannot be recovered on another browser."
                    : "Manage your verified identity through the authentication provider."}
                </p>
                <p>
                  Sample media is available for 30 days by default. Monthly
                  credits expire with their paid period; legacy wallet credits
                  remain separate. See our{" "}
                  <Link href="/privacy">privacy policy</Link> for retention and
                  third-party processing.
                </p>
                {account ? (
                  !demo ? (
                    <SignOutButton redirectUrl="/">
                      <button className="secondary">
                        <LogOut size={16} />
                        Sign out
                      </button>
                    </SignOutButton>
                  ) : (
                    <button
                      className="secondary"
                      onClick={() =>
                        run(async () => {
                          await api("session", undefined, "DELETE");
                          await refresh();
                        })
                      }
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                  )
                ) : (
                  <Link href="/sign-in" className="primary">
                    Sign in
                  </Link>
                )}
                <hr />
                <h2>Delete your workspace</h2>
                <p>
                  This removes stored media and prompts. Financial ledger and
                  purchase records are retained for reconciliation and
                  applicable obligations. Active or uncertain jobs must be
                  resolved first. Live identity deletion requires a support
                  request until identity-provider deletion is integrated. A paid
                  subscription must finish its current period before workspace
                  deletion; cancel renewal in Billing first.
                </p>
                <button
                  className="danger"
                  disabled={!account || busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Delete your media and prompts? Financial records will be retained.",
                      )
                    )
                      void run(async () => {
                        await api("account/delete", {});
                        await refresh();
                        setNotice(
                          "Demo workspace deleted. Financial records were retained.",
                        );
                      });
                  }}
                >
                  Delete demo workspace
                </button>
              </section>
            </>
          )}
          {page === "admin" && <Admin />}
          {["help", "terms", "privacy", "refund", "acceptable-use"].includes(
            page,
          ) && <Policy page={page} />}
          <footer className="footer">
            <span>{name}</span>
            <div>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/refund">Refunds</Link>
              <Link href="/acceptable-use">Acceptable use</Link>
              <Link href="/help">Help</Link>
            </div>
            <span className="footer-end">
              Made for your imagination{" "}
              <span>
                <ArrowUpRight size={12} />
              </span>
            </span>
          </footer>
        </main>
      </div>
      {purchase && (
        <div className="modal-backdrop">
          <button
            className="modal-dismiss-layer"
            aria-label="Dismiss checkout"
            disabled={busy}
            onClick={dismissCheckout}
          />
          <section
            ref={modalRef}
            onKeyDown={(event) =>
              modalKeyboard(event, () => {
                if (!busy) void dismissCheckout();
              })
            }
            className="checkout-modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close checkout"
              disabled={busy}
              onClick={dismissCheckout}
            >
              <X />
            </button>
            <span className="tag">SIMULATED CHECKOUT · NO MONEY CHARGED</span>
            <h2 id="checkout-title">
              {purchase.package.name} monthly subscription
            </h2>
            <p className="checkout-price">
              ${purchase.package.cents / 100}
              <span> USD / month</span>
            </p>
            <p>
              {purchase.package.credits.toLocaleString()} monthly test credits
            </p>
            <ul>
              <li>
                Monthly billing renews until you cancel in Settings → Billing.
              </li>
              <li>
                Unused allowance expires at period end with no rollover.
                Generation prices vary by model.
              </li>
              <li>
                Cancel renewal anytime and keep paid access until the period
                ends.
              </li>
              <li>
                This is a local payment simulation, not a gateway sandbox.
              </li>
            </ul>
            <p className="fine-print">
              By continuing you acknowledge the <Link href="/terms">terms</Link>{" "}
              and <Link href="/refund">refund policy</Link>. No card details are
              collected.
            </p>
            <button
              className="primary full"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("subscription/test-payment", {
                    checkoutId: purchase.id,
                    outcome: "paid",
                  });
                  setPurchase(null);
                  await refresh();
                  setNotice(
                    "Monthly demo subscription activated. No money was charged.",
                  );
                })
              }
            >
              Simulate successful payment <Check size={17} />
            </button>
            <button
              className="secondary full"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("subscription/test-payment", {
                    checkoutId: purchase.id,
                    outcome: "failed",
                  });
                  setPurchase(null);
                  await refresh();
                  setNotice(
                    "Test payment failed. No subscription or monthly allowance was activated.",
                  );
                })
              }
            >
              Simulate failed payment
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={dismissCheckout}
            >
              Cancel checkout
            </button>
          </section>
        </div>
      )}
      {cancelDialog && subscription && (
        <div className="modal-backdrop">
          <button
            className="modal-dismiss-layer"
            aria-label="Dismiss cancellation"
            disabled={busy}
            onClick={() => setCancelDialog(false)}
          />
          <section
            className="checkout-modal panel"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-subscription-title"
            onKeyDown={(event) =>
              modalKeyboard(event, () => {
                if (!busy) setCancelDialog(false);
              })
            }
          >
            <h2 id="cancel-subscription-title">Cancel your subscription?</h2>
            <p>
              This unsubscribes you from future monthly renewals.{" "}
              {monthlyAvailable ? (
                <>
                  You keep your current allowance and paid access until{" "}
                  <strong>{billingDate(subscription.periodEnd)}</strong>.
                </>
              ) : (
                "Your previous paid period has already ended."
              )}
            </p>
            <p className="fine-print">
              Your account and saved work remain. Cancellation does not
              automatically refund the current period. Statutory rights are
              unaffected. {demo ? "No real money is charged in this demo." : ""}
            </p>
            <button
              className="secondary full"
              disabled={busy}
              onClick={() => setCancelDialog(false)}
            >
              Keep subscription
            </button>
            <button
              className="danger full"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("subscription/cancel", {
                    subscriptionId: subscription.id,
                  });
                  setCancelDialog(false);
                  await refresh();
                  setNotice(
                    monthlyAvailable
                      ? `Renewal canceled. Your paid-period access continues until ${billingDate(subscription.periodEnd)}.`
                      : "Renewal canceled. Your previous paid period has ended.",
                  );
                })
              }
            >
              Confirm cancellation
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function FreePreviewAllowance({
  allowance,
  demo,
}: {
  allowance: FreePreviewState;
  demo: boolean;
}) {
  return (
    <section
      className="panel free-allowance-panel"
      aria-label="Your Free Preview allowance"
    >
      <div>
        <span className="studio-kicker">YOUR ONE-TIME FREE PREVIEW</span>
        <h2>Try your ideas before buying credits.</h2>
        <p>
          {demo
            ? "Demo samples only. Your test-credit wallet is separate."
            : "Included once per verified account. No daily reset."}
        </p>
      </div>
      <div className="free-allowance-counts">
        <div>
          <strong>
            {allowance.images.remaining}
            <small> / {allowance.images.total}</small>
          </strong>
          <span>images available</span>
          {allowance.images.reserved > 0 && (
            <small>{allowance.images.reserved} in progress</small>
          )}
        </div>
        <div>
          <strong>
            {allowance.videos.remaining}
            <small> / {allowance.videos.total}</small>
          </strong>
          <span>{allowance.videoSeconds}-second video available</span>
          {allowance.videos.reserved > 0 && (
            <small>{allowance.videos.reserved} in progress</small>
          )}
        </div>
      </div>
      {allowance.enabled ? (
        <Link className="secondary" href="/image?free=1">
          Use Free Preview <ArrowUpRight size={16} />
        </Link>
      ) : (
        <p className="field-hint">Free Preview is currently unavailable.</p>
      )}
    </section>
  );
}
function Policy({ page }: { page: string }) {
  const content: Record<
    string,
    { title: string; sections: [string, string][] }
  > = {
    help: {
      title: "A little guidance goes a long way.",
      sections: [
        [
          "Getting started",
          "Start a demo session, choose the image or video studio, write a prompt and request a quote. Confirming reserves test credits. A separate worker prepares sample media; follow its progress in your library.",
        ],
        [
          "Understanding demo mode",
          "Illustrations and video test patterns are samples, not AI-generated interpretations of your prompt. References are stored privately but are not used to alter the sample. No real payment gateway is connected.",
        ],
        [
          "Credits and failures",
          "Free Preview, monthly allowances and legacy wallet credits are separate. Choose Use monthly credits for the current paid period, or Use credits for the legacy wallet. Demo images cost 12 credits and demo videos cost 80 credits. Confirmed failures return the reservation to its original funding source. An uncertain outcome stays reserved until investigated.",
        ],
        [
          "Monthly plans and cancellation",
          "A successful monthly payment grants the plan allowance for that billing period. Unused monthly credits expire at period end without rollover. In Settings → Billing, Cancel subscription unsubscribes you from future renewals while keeping paid access until the period ends. Resume subscription before that date to enable renewal again. Demo billing is simulated and never charges a card.",
        ],
        [
          "Need support?",
          process.env.NEXT_PUBLIC_SUPPORT_EMAIL
            ? `Contact ${process.env.NEXT_PUBLIC_SUPPORT_EMAIL} for support. Never send passwords or payment-card details.`
            : "A public support address has not been configured. Do not send payments or sensitive information. The operator must configure support before launch.",
        ],
      ],
    },
    terms: {
      title: "Terms of use",
      sections: [
        [
          "Service status",
          "GEEZ AI STUDIO currently operates as a demonstration. No live AI generation or paid checkout is available. These draft terms require operator and legal review before commercial launch.",
        ],
        [
          "Monthly subscriptions",
          "Planned monthly subscriptions are $5 for 500 credits, $10 for 1,000, $20 for 2,000, and $50 for 5,000 each paid billing period. These are usage allowances, not a guaranteed number of outputs. Unused monthly credits expire at period end without rollover. Successful renewal grants a fresh allowance; a failed payment grants none. Existing legacy test-wallet balances remain separate. All current checkout is simulated and test credits have no cash value.",
        ],
        [
          "Cancellation and unsubscribe",
          "Cancel subscription in Settings → Billing stops future renewal and keeps access through the current paid period. It does not delete your account or automatically refund the current period. You may resume before expiry. Cancellation of billing is separate from account deletion and any future email preferences. Applicable consumer rights are unaffected.",
        ],
        [
          "Generation and rights",
          "Quotes show the charge before confirmation. Credits are reserved, settled once on success, or released on confirmed failure. Output quality, permitted uses and commercial rights depend on the specific model provider and its terms; no universal rights guarantee is made.",
        ],
        [
          "Free Preview",
          `Free Preview provides ${freePreviewPlan.images} images and ${freePreviewPlan.videos} ${freePreviewPlan.videoSeconds}-second video once per verified account, on eligible configured models. It is separate from purchased credits, has no cash value and does not reset daily. A confirmed failure restores the reserved free allowance; an uncertain outcome remains reserved until reconciled. Current demo use produces samples only.`,
        ],
        [
          "Your responsibilities",
          "Only upload material you are entitled to process. Follow the acceptable-use policy. Do not submit secrets or sensitive personal data. You retain responsibility for using and reviewing output.",
        ],
        [
          "Operator details",
          "No registered company or business address is represented. Operator identity, support contact, applicable law and dispute procedures must be finalized and disclosed before live sales.",
        ],
      ],
    },
    privacy: {
      title: "Your ideas deserve privacy.",
      sections: [
        [
          "What is stored",
          "The application stores an account identifier, prompts, reference uploads, job metadata, wallet ledger and purchase history. Demo authentication uses a secure HTTP-only session cookie. No card numbers are collected.",
        ],
        [
          "Who processes your data",
          "In demo mode media is processed locally. Live configuration is designed for Clerk authentication, PostgreSQL records and private S3-compatible media storage. External AI providers are disabled; their specific processing regions, subprocessors and retention must be verified and disclosed before activation.",
        ],
        [
          "Retention and deletion",
          "Media access defaults to 30 days; an operator cleanup task removes expired objects. Monthly credits expire at the paid period end. Legacy wallet balances remain separate. Account deletion removes prompts and media after subscription and job reconciliation; wallet, subscription, billing-period, payment and free-allowance audit records are retained for reconciliation, one-time-offer enforcement and applicable obligations. A legally reviewed financial retention schedule is required before launch.",
        ],
        [
          "Your choices",
          "Media is private by default and has no public-sharing feature. Download your media before deletion. Use account settings to delete your demo workspace. Live identity deletion and privacy requests require a configured support channel before launch.",
        ],
      ],
    },
    refund: {
      title: "Clear purchases. Clear expectations.",
      sections: [
        [
          "Current test mode",
          "No money is accepted. Checkout is a simulation. Test credits have no cash value and cannot be redeemed.",
        ],
        [
          "Generation failures",
          "Credits are reserved at submission and spent once after successful output validation. A confirmed failure releases the reservation. Unknown provider outcomes require reconciliation before refunding or retrying, so they do not cause duplicate provider charges.",
        ],
        [
          "Before live launch",
          "A merchant-approved refund window, tax treatment, consumer rights, support channel and dispute process must be finalized before real payments are enabled. This draft does not restrict statutory consumer rights.",
        ],
        [
          "Refund accounting",
          "Canceling renewal is separate from a refund request. Verified legacy purchase refunds reverse balances once; spent balances are flagged for review. Monthly payment refunds, disputes, partial refunds and applicable consumer rights require an approved gateway policy and tested live implementation before sales are enabled.",
        ],
      ],
    },
    "acceptable-use": {
      title: "Create with care.",
      sections: [
        [
          "Prohibited content",
          "Do not create child sexual exploitation material, non-consensual intimate imagery, threats, targeted harassment, extremist recruitment or instructions facilitating violence or criminal activity. Do not impersonate people to defraud or deceive.",
        ],
        [
          "Respect people and their rights",
          "Only upload images with the necessary rights and consent. Do not use private or sensitive personal information without authorization. Respect intellectual property and applicable laws.",
        ],
        [
          "Moderation and enforcement",
          "Live model activation requires the provider’s mandated safety controls and an abuse reporting channel. The operator may suspend abusive access and disable models. Demo mode does not perform external AI inference.",
        ],
        [
          "Report a concern",
          "A public reporting address must be configured before launch. Do not use the demonstration to upload illegal content.",
        ],
      ],
    },
  };
  const c = content[page];
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">
          {name} ·{" "}
          {page === "help"
            ? "HELP & RESOURCES"
            : "DRAFT POLICY · REVIEW BEFORE LAUNCH"}
        </div>
        <h1>{c.title}</h1>
        <p>Last updated 26 October 2026</p>
      </div>
      <article className="panel prose">
        {process.env.NEXT_PUBLIC_SUPPORT_EMAIL && (
          <p>Support: {process.env.NEXT_PUBLIC_SUPPORT_EMAIL}</p>
        )}
        {c.sections.map(([h, p]) => (
          <section key={h}>
            <h2>{h}</h2>
            <p>{p}</p>
          </section>
        ))}
      </article>
    </>
  );
}
function Admin() {
  const [data, setData] = useState<Record<string, unknown[]> | null>(null),
    [message, setMessage] = useState(""),
    [model, setModel] = useState("all"),
    [user, setUser] = useState(""),
    [credits, setCredits] = useState(0),
    [reason, setReason] = useState("");
  useEffect(() => {
    api("admin")
      .then(setData)
      .catch((e) => setMessage(e.message));
  }, []);
  const summary = data?.summary?.[0] as
    | {
        customers: number;
        test_gross_cents: string;
        live_gross_cents: string;
        estimated_provider_micros: string;
        failures: number;
        uncertain: number;
      }
    | undefined;
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">OPERATIONS</div>
        <h1>Studio control room.</h1>
        <p>Role-protected operations, usage and audit records.</p>
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {data && (
        <>
          {summary && (
            <div className="stats-grid">
              {[
                ["Customers", String(summary.customers)],
                [
                  "Test purchases (not revenue)",
                  "$" + (Number(summary.test_gross_cents) / 100).toFixed(2),
                ],
                [
                  "Live revenue",
                  "$" + (Number(summary.live_gross_cents) / 100).toFixed(2),
                ],
                [
                  "Estimated provider costs",
                  "$" +
                    (
                      Number(summary.estimated_provider_micros) / 1000000
                    ).toFixed(2),
                ],
                [
                  "Estimated margin before fees",
                  "$" +
                    (
                      (Number(summary.live_gross_cents) * 10000 -
                        Number(summary.estimated_provider_micros)) /
                      1000000
                    ).toFixed(2),
                ],
                [
                  "Failed / uncertain",
                  `${summary.failures} / ${summary.uncertain}`,
                ],
              ].map(([label, value]) => (
                <div className="panel stat" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          )}
          <section className="panel prose">
            <h2>Model circuit breaker</h2>
            <select
              aria-label="Model to pause"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="all">All generation</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button
              className="danger"
              onClick={() =>
                api("admin", { action: "disable", model, disabled: true })
                  .then(() => setMessage("Generation disabled."))
                  .catch((e) => setMessage(e.message))
              }
            >
              Disable immediately
            </button>
            <h2>Credit adjustment</h2>
            <label>
              Customer identifier
              <input value={user} onChange={(e) => setUser(e.target.value)} />
            </label>
            <label>
              Credits (+ / −)
              <input
                type="number"
                value={credits}
                onChange={(e) => setCredits(Number(e.target.value))}
              />
            </label>
            <label>
              Reason
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              className="secondary"
              onClick={() =>
                api("admin", { action: "adjust", user, credits, reason })
                  .then(() => setMessage("Adjustment audited."))
                  .catch((e) => setMessage(e.message))
              }
            >
              Apply adjustment
            </button>
          </section>
          {Object.entries(data).map(([k, rows]) => (
            <section className="panel prose" key={k}>
              <h2>
                {k} ({rows.length})
              </h2>
              <pre>{JSON.stringify(rows, null, 2)}</pre>
            </section>
          ))}
        </>
      )}
    </>
  );
}
