"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Image as ImageIcon,
  ImagePlus,
  Clapperboard,
  Paperclip,
  Video,
  Sparkles,
  SlidersHorizontal,
  Plus,
  Zap,
  FolderOpen,
  Play,
  MoveUpRight,
} from "lucide-react";
const scenes = [
  {
    id: "desert",
    title: "A world beyond the ordinary",
    category: "Cinematic",
    tag: "LANDSCAPE",
    prompt:
      "A cinematic aerial photograph of vast copper-orange desert dunes at dusk, a tiny explorer in the distance, fine sand textures, warm atmospheric light",
  },
  {
    id: "portrait",
    title: "Every face tells a story",
    category: "Portrait",
    tag: "EDITORIAL",
    prompt:
      "An editorial portrait of an adult woman in sculptural ivory clothing, natural warm sunlight, rich emerald background, fine photographic detail",
  },
  {
    id: "chrome",
    title: "Give your ideas a new shape",
    category: "Abstract",
    tag: "3D & ABSTRACT",
    prompt:
      "A sculptural liquid chrome ribbon twisting in a dark graphite studio, brushed silver details, subtle teal reflections, high-end product photography",
  },
  {
    id: "product",
    title: "Small details. Big impression.",
    category: "Product",
    tag: "PRODUCT DESIGN",
    prompt:
      "A translucent amber glass perfume vessel resting on black volcanic rock, luxurious warm side light, photographic macro details",
  },
  {
    id: "architecture",
    title: "Escape into possibility",
    category: "Architecture",
    tag: "SPACES & PLACES",
    prompt:
      "A minimalist pale limestone arch overlooking turquoise sea and hazy mountains, sunlit textures, quiet Mediterranean atmosphere",
  },
  {
    id: "planet",
    title: "Somewhere only you imagined",
    category: "Cinematic",
    tag: "CONCEPT ART",
    prompt:
      "A cinematic alien landscape beneath a luminous ringed planet, muted aubergine atmosphere, subtle copper glints, realistic planetary detail",
  },
];
export function ExampleArt({
  scene,
  className = "",
  label,
}: {
  scene: string;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={`example-art art-${scene} ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
export default function Discover() {
  const router = useRouter();
  const [kind, setKind] = useState<"image" | "video">("image");
  const [idea, setIdea] = useState("");
  const [filter, setFilter] = useState("All inspiration");
  const openStudio = () =>
    router.push(
      `/${kind}${idea.trim() ? "?prompt=" + encodeURIComponent(idea.trim()) : ""}`,
    );
  return (
    <div className="discover-page">
      <div className="discover-heading">
        <div>
          <span className="studio-kicker">
            <span /> YOUR CREATIVE SPACE
          </span>
          <h1>Big ideas start here.</h1>
          <p>Your imagination. Your next creation. Your studio.</p>
        </div>
        <Link className="quiet-link" href="/library">
          <FolderOpen size={15} /> My creations <ArrowUpRight size={14} />
        </Link>
      </div>
      <section className="idea-composer" aria-labelledby="idea-title">
        <div className="composer-top">
          <h2 id="idea-title">What will you create today?</h2>
          <span>
            <Sparkles size={12} /> CREATIVE PREVIEW
          </span>
        </div>
        <div className="composer-body">
          <div
            className="composer-kind"
            role="group"
            aria-label="Choose a creative studio"
          >
            <button
              className={kind === "image" ? "selected" : ""}
              aria-pressed={kind === "image"}
              onClick={() => setKind("image")}
            >
              <ImageIcon size={16} />
              Image
            </button>
            <button
              className={kind === "video" ? "selected" : ""}
              aria-pressed={kind === "video"}
              onClick={() => setKind("video")}
            >
              <Video size={16} />
              Video
            </button>
          </div>
          <label className="sr-only" htmlFor="creative-idea">
            Describe your next idea
          </label>
          <textarea
            id="creative-idea"
            rows={3}
            maxLength={2000}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                openStudio();
              }
            }}
            placeholder="A cinematic desert, a bold new product, a world that doesn’t exist…"
          />
          <button className="composer-submit" onClick={openStudio}>
            Open studio <ArrowUpRight size={18} />
          </button>
        </div>
        <div className="composer-bottom">
          <span>
            <Sparkles size={12} /> Start with a spark
          </span>
          {[
            ["Cinematic landscape", scenes[0].prompt],
            ["Editorial portrait", scenes[1].prompt],
            ["Product photography", scenes[3].prompt],
          ].map(([text, prompt]) => (
            <button key={text} onClick={() => setIdea(prompt)}>
              {text}
              <Plus size={11} />
            </button>
          ))}
          <span className="quote-reminder">
            Shift + Enter for a new line · quote before generation
          </span>
          <Link
            className="composer-reference"
            href={`/${kind}${idea.trim() ? "?prompt=" + encodeURIComponent(idea.trim()) : ""}#reference`}
          >
            <Paperclip size={13} /> Add reference in studio
          </Link>
        </div>
      </section>
      <section
        className="studio-shortcuts mode-grid"
        aria-label="Choose a studio"
      >
        {[
          {
            label: "Text to image",
            detail: "Start with a few words",
            href: "/image",
            icon: ImageIcon,
            tone: "orange",
          },
          {
            label: "Image to image",
            detail: "Build from a reference",
            href: "/image#reference",
            icon: ImagePlus,
            tone: "mint",
          },
          {
            label: "Text to video",
            detail: "Explore a moving scene",
            href: "/video",
            icon: Video,
            tone: "lavender",
          },
          {
            label: "Image to video",
            detail: "Start with a still image",
            href: "/video#reference",
            icon: Clapperboard,
            tone: "blue",
          },
        ].map((item) => (
          <Link key={item.label} className="studio-shortcut" href={item.href}>
            <span className={`shortcut-icon ${item.tone}`}>
              <item.icon size={20} />
            </span>
            <div>
              <h2>{item.label}</h2>
              <p>{item.detail}</p>
            </div>
            <ArrowUpRight size={15} />
          </Link>
        ))}
      </section>
      <section className="cinema-hero" aria-labelledby="hero-title">
        <ExampleArt
          scene="desert"
          className="hero-art"
          label="Visual example: cinematic copper dunes and a lone explorer"
        />
        <div className="hero-shade" />
        <div className="hero-content">
          <span className="hero-edition">
            <Sparkles size={13} /> THE GEEZ CREATIVE PLAYGROUND
          </span>
          <h2 id="hero-title">
            Imagine it.
            <br />
            <em>Make it extraordinary.</em>
          </h2>
          <p>
            {process.env.NEXT_PUBLIC_TAGLINE ||
              "Create images. Generate videos. Unlock your ideas."}
          </p>
          <div className="hero-actions">
            <Link className="primary hero-primary" href="/image">
              Start creating <ArrowUpRight size={17} />
            </Link>
            <Link className="hero-secondary" href="/video">
              <span>
                <Play size={12} fill="currentColor" />
              </span>{" "}
              Explore video
            </Link>
          </div>
        </div>
        <div className="hero-caption">
          <span>01 / DESERT DREAMS</span>
          <span>Creative example · not a generated result</span>
        </div>
      </section>
      <section
        className="inspiration explore-section"
        aria-labelledby="explore-title"
      >
        <div className="section-heading">
          <div>
            <div className="studio-kicker">THE INSPIRATION EDIT</div>
            <h2 id="explore-title">A little spark. Endless directions.</h2>
            <p>Explore visual ideas, then make the prompt your own.</p>
          </div>
          <span className="example-label">
            <span /> CREATIVE EXAMPLES
          </span>
        </div>
        <div className="filter-row">
          {[
            "All inspiration",
            "Cinematic",
            "Portrait",
            "Product",
            "Architecture",
            "Abstract",
          ].map((f) => (
            <button
              key={f}
              className={filter === f ? "filter selected" : "filter"}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
            >
              {f === "All inspiration" && <Sparkles size={13} />} {f}
            </button>
          ))}
          <span className="filter-note">
            <SlidersHorizontal size={13} /> Curated perspectives
          </span>
        </div>
        <div className="editorial-gallery">
          {scenes
            .filter(
              (s) => filter === "All inspiration" || s.category === filter,
            )
            .map((s) => (
              <Link
                className="example-card editorial-card"
                href={"/image?prompt=" + encodeURIComponent(s.prompt)}
                key={s.id}
              >
                <div className="editorial-image">
                  <ExampleArt scene={s.id} label={s.prompt} />
                  <span className="editorial-tag">{s.tag}</span>
                  <span className="example-arrow">
                    <MoveUpRight size={18} />
                  </span>
                  <div className="art-credit">Visual example</div>
                </div>
                <div className="editorial-info">
                  <h3>{s.title}</h3>
                  <span>
                    Try this prompt <ArrowUpRight size={12} />
                  </span>
                </div>
              </Link>
            ))}
        </div>
        <p className="gallery-disclosure">
          Gallery artwork is supplied for inspiration. Demo generations produce
          labeled samples rather than these images.
        </p>
      </section>
      <section
        className="creative-principles"
        aria-label="How the studio works"
      >
        <div>
          <span>01</span>
          <h3>Bring your idea.</h3>
          <p>A few words. A reference. A new perspective.</p>
        </div>
        <div>
          <span>02</span>
          <h3>Know your cost.</h3>
          <p>See the exact credit quote before you confirm.</p>
        </div>
        <div>
          <span>03</span>
          <h3>Make it yours.</h3>
          <p>Keep your creations private and download your media.</p>
        </div>
      </section>
      <section className="bottom-banner premium-banner">
        <span className="banner-icon">
          <Zap size={24} />
        </span>
        <div>
          <span className="studio-kicker">MORE ROOM FOR YOUR NEXT IDEA</span>
          <h3>Monthly plans. Serious creative potential.</h3>
          <p>
            Monthly plans from $5, with a fresh allowance each paid month.
            Cancel future renewals in your account settings.
          </p>
        </div>
        <Link href="/pricing">
          Explore monthly plans <ArrowUpRight size={17} />
        </Link>
      </section>
    </div>
  );
}
