/* eslint-disable @next/next/no-img-element */
"use client";
import { useState, useEffect, useCallback } from "react";
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
import Discover from "./components/discover";
type Job = {
  id: string;
  model_id: string;
  input: { prompt: string; ratio: string };
  credits: number;
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
}: {
  page: string;
  isDemo?: boolean;
  initialPrompt?: string;
}) {
  const demo = isDemo;
  const router = useRouter();
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
    [quote, setQuote] = useState<{ id: string; credits: number } | null>(null),
    [requestId, setRequestId] = useState(""),
    [purchase, setPurchase] = useState<{
      id: string;
      package: (typeof packages)[number];
    } | null>(null),
    [latest, setLatest] = useState<string>();
  const refresh = useCallback(async () => {
    try {
      setAccount(await api("account"));
    } catch {
      setAccount(null);
    }
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
  const input = () => ({
    modelId,
    prompt,
    ratio,
    resolution,
    ...(kind === "video" ? { duration } : {}),
    ...(referenceId ? { referenceId } : {}),
    requestId,
  });
  function change() {
    setQuote(null);
  }
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
              Explore credit packs <ArrowUpRight size={15} />
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
            <Link href="/pricing" className="balance">
              <Coins size={16} />
              {account ? account.wallet.balance.toLocaleString() : "0"}{" "}
              <span>credits</span>
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
                    <strong>{quote?.credits || model.credits} credits</strong>
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
                      disabled={busy || prompt.trim().length < 3}
                      onClick={() =>
                        run(async () => {
                          if (!quote) {
                            const id = crypto.randomUUID();
                            setRequestId(id);
                            const q = await api("quote", {
                              ...input(),
                              requestId: id,
                            });
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
                    {quote
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
                          {current.credits} credits
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
                "One-time credit purchases. No subscription. No recurring charges.",
              )}
              <div className="pricing-notice">
                <Shield size={18} />
                <p>
                  <strong>Test checkout only.</strong> No money is collected.
                  These packages add demo credits with no cash value.
                </p>
              </div>
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
                      <span>USD / one time</span>
                    </div>
                    <div className="pack-credits">
                      <Coins size={18} />
                      <strong>{p.credits.toLocaleString()}</strong> credits
                    </div>
                    <ul>
                      <li>
                        <Check size={15} /> Image & video demo workflow
                      </li>
                      <li>
                        <Check size={15} /> No automatic renewal
                      </li>
                      <li>
                        <Check size={15} /> Purchased credits do not expire
                      </li>
                    </ul>
                    <button
                      className={i === 1 ? "primary full" : "secondary full"}
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          if (!account) {
                            await api("session", {});
                            await refresh();
                          }
                          const checkout = await api("checkout", {
                            packageId: p.id,
                          });
                          if (checkout.url) {
                            window.location.href = checkout.url;
                          } else setPurchase(checkout);
                        })
                      }
                    >
                      Try {p.name} checkout <ArrowUpRight size={16} />
                    </button>
                  </section>
                ))}
              </div>
              <div className="pricing-explainer">
                <h2>Credits, explained.</h2>
                <p>
                  Credits are your studio wallet, not a fixed number of images
                  or videos. Every model and output setting has its own price,
                  shown before you confirm. Demo images cost 12 credits; demo
                  videos cost 80 credits. Live prices have not been configured.
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
                    ? "Your credit purchases."
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
                  {page === "dashboard" && (
                    <div className="stats-grid">
                      {[
                        [
                          "Available credits",
                          account.wallet.balance.toLocaleString(),
                        ],
                        ["Reserved for jobs", String(account.wallet.reserved)],
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
                                  {j.state} · {j.credits} credits{" "}
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
                            Explore credit packs
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                  {page === "dashboard" && (
                    <section className="panel table-panel">
                      <h2>Credit activity</h2>
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
                  Sample media is available for 30 days by default. Purchased
                  credits do not expire. See our{" "}
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
                  request until identity-provider deletion is integrated.
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
          <section
            className="checkout-modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close checkout"
              onClick={() => setPurchase(null)}
            >
              <X />
            </button>
            <span className="tag">SIMULATED CHECKOUT · NO MONEY CHARGED</span>
            <h2 id="checkout-title">{purchase.package.name} credit pack</h2>
            <p className="checkout-price">
              ${purchase.package.cents / 100}
              <span> USD</span>
            </p>
            <p>
              {purchase.package.credits.toLocaleString()} test credits ·
              one-time purchase
            </p>
            <ul>
              <li>No subscription or automatic renewal.</li>
              <li>Credits do not expire. Generation prices vary by model.</li>
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
                  await api("test-payment", {
                    purchaseId: purchase.id,
                    outcome: "paid",
                  });
                  setPurchase(null);
                  await refresh();
                  setNotice(
                    "Test payment verified. Demo credits added once. No money was charged.",
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
                  await api("test-payment", {
                    purchaseId: purchase.id,
                    outcome: "failed",
                  });
                  setPurchase(null);
                  await refresh();
                  setNotice("Test payment failed. No credits were added.");
                })
              }
            >
              Simulate failed payment
            </button>
            <button
              className="text-button"
              onClick={() =>
                run(async () => {
                  await api("test-payment", {
                    purchaseId: purchase.id,
                    outcome: "canceled",
                  });
                  setPurchase(null);
                  await refresh();
                })
              }
            >
              Cancel checkout
            </button>
          </section>
        </div>
      )}
    </div>
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
          "Demo images cost 12 credits and demo videos cost 80 credits. Confirmed failures return reserved credits. An uncertain result keeps credits reserved until investigated, preventing repeat provider charges.",
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
          "Credit purchases",
          "Planned one-time packages are $5 for 500 credits, $10 for 1,000, $20 for 2,000, and $50 for 5,000. Credits are wallet units, not a guaranteed number of outputs. Purchased balances do not expire. Test credits have no cash value.",
        ],
        [
          "Generation and rights",
          "Quotes show the charge before confirmation. Credits are reserved, settled once on success, or released on confirmed failure. Output quality, permitted uses and commercial rights depend on the specific model provider and its terms; no universal rights guarantee is made.",
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
          "Media access defaults to 30 days; an operator cleanup task removes expired objects. Purchased credits do not expire. Account deletion removes prompts and media; financial records are retained for reconciliation and applicable legal obligations. A legally reviewed financial retention schedule is still required before launch.",
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
          "Verified refunds reverse credited balances once. If credits have already been spent, the purchase is flagged for manual review rather than overdrawing the wallet. Partial refunds require a reviewed live gateway implementation.",
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
