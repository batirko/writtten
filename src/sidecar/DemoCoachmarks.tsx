import { useEffect, useState } from "react";

/**
 * Onboarding coachmarks for the "See it in action" demo.
 *
 * Three floating, obviously-temporary callouts that orient a first-timer to the
 * three surfaces — the writing canvas, the observation feed, and the activity
 * monitor — then get out of the way. Shown only while `active` (the demo is
 * loaded); dismissed with the single "Got it" or Escape. Deliberately styled
 * apart from core UX (dashed accent, numbered steps, spotlight rings) so it
 * reads as a tour, not a permanent part of the product.
 *
 * Non-blocking: the overlay itself is `pointer-events: none` (only the cards +
 * dismiss button take pointer events), so the demo behind stays visible and
 * interactive. Rect-anchored (measures the three targets and repositions on
 * resize/scroll). Suppressed on ≤720px — the layout stacks and the feed hides
 * there, so rect-anchored callouts would be fragile; the MobileNote strip
 * already sets the "best on a laptop" expectation.
 *
 * See docs/projects/onboarding_first_run.md § The coachmarks.
 */

const CARD_W = 236;
const MOBILE_QUERY = "(max-width: 720px)";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface Ring {
  x: number;
  y: number;
  w: number;
  h: number;
  rx: number;
}
interface Conn {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface Layout {
  vw: number;
  vh: number;
  cards: { x: number; y: number }[];
  rings: Ring[];
  conns: Conn[];
}

const STEPS = [
  {
    title: "This is your canvas",
    body: "You write everything here. The AI never edits or rewrites your words.",
  },
  {
    title: "Notes land here",
    body: "As you write, observations appear — contradictions, tensions, unclear bits.",
  },
  {
    title: "Activity monitor",
    body: "Lights up while the AI reads and thinks. Quiet when it's idle.",
  },
];

function rectOf(sel: string): Rect | null {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function computeLayout(): Layout | null {
  const cvs = rectOf(".editor-column");
  const feed = rectOf(".sidecar-panel");
  const dot = rectOf('[data-testid="control-anchor"]');
  if (!cvs || !feed || !dot) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.max(8, Math.min(x, vw - CARD_W - 8));
  const clampY = (y: number, h = 96) => Math.max(8, Math.min(y, vh - h - 8));

  // 1 — canvas: ring the WHOLE writing column, clamped to the viewport so a long,
  //     scrolled document doesn't run the outline off-screen. The card labels the
  //     region from its top-left corner (no connector — the ring is the pointer).
  const ring1Top = Math.max(8, cvs.top + 8);
  const ring1Bottom = Math.min(vh - 8, cvs.top + cvs.height - 8);
  const ring1: Ring = {
    x: cvs.left + 8,
    y: ring1Top,
    w: cvs.width - 16,
    h: Math.max(80, ring1Bottom - ring1Top),
    rx: 10,
  };
  const c1 = { x: clampX(cvs.left + 20), y: clampY(cvs.top + 16) };

  // 2 — feed: ring the whole feed, card to its left (falls back to overlap).
  const ring2: Ring = {
    x: feed.left + 6,
    y: feed.top + 6,
    w: feed.width - 12,
    h: feed.height - 12,
    rx: 12,
  };
  const c2 = { x: clampX(feed.left - CARD_W - 20), y: clampY(feed.top + 28) };

  // 3 — activity dot: ring the dot, card up-and-left of it.
  const dcx = dot.left + dot.width / 2;
  const dcy = dot.top + dot.height / 2;
  const dr = Math.max(dot.width, dot.height) / 2 + 9;
  const c3 = { x: clampX(dot.left - CARD_W - 18), y: clampY(dot.top - 88, 88) };

  // card 1 sits inside its ring as a label (no connector). Cards 2 and 3 point.
  const conns: Conn[] = [
    // card 2 right-mid → ring2 left edge
    { x1: c2.x + CARD_W, y1: c2.y + 42, x2: ring2.x, y2: feed.top + 42 },
    // card 3 right-mid → dot (upper-left of the ring)
    { x1: c3.x + CARD_W, y1: c3.y + 60, x2: dcx - dr * 0.7, y2: dcy - dr * 0.7 },
  ];

  return {
    vw,
    vh,
    cards: [c1, c2, c3],
    rings: [ring1, ring2, { x: dcx, y: dcy, w: dr, h: dr, rx: 0 }],
    conns,
  };
}

export function DemoCoachmarks({ active }: { active: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const [layout, setLayout] = useState<Layout | null>(null);

  // A fresh demo load re-shows the tour (the demo itself isn't persisted).
  useEffect(() => {
    if (active) setDismissed(false);
  }, [active]);

  const visible = active && !dismissed;

  useEffect(() => {
    if (!visible) return;
    // Note: don't early-return on mobile here — measure() suppresses the overlay
    // on ≤720px, and we still want the resize listener attached so a mobile→
    // desktop resize recovers (and vice-versa).
    let raf = 0;
    const measure = () => {
      if (window.matchMedia(MOBILE_QUERY).matches) {
        setLayout(null);
        return;
      }
      setLayout(computeLayout());
    };
    // Targets (feed, cards) settle a beat after the demo loads; measure now and
    // again on the next frame.
    measure();
    raf = requestAnimationFrame(measure);
    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    const ro = new ResizeObserver(onChange);
    const panel = document.querySelector(".editor-panel");
    const feedSlot = document.querySelector(".feed-slot");
    if (panel) ro.observe(panel);
    if (feedSlot) ro.observe(feedSlot);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
      ro.disconnect();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDismissed(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  if (!visible || !layout) return null;

  return (
    <div className="demo-coachmarks" role="region" aria-label="Getting started">
      <svg
        className="demo-coach-svg"
        width={layout.vw}
        height={layout.vh}
        viewBox={`0 0 ${layout.vw} ${layout.vh}`}
        aria-hidden="true"
      >
        {layout.rings.map((r, i) =>
          i === 2 ? (
            <circle key={i} className="demo-coach-ring" cx={r.x} cy={r.y} r={r.w} />
          ) : (
            <rect
              key={i}
              className="demo-coach-ring"
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx={r.rx}
            />
          )
        )}
        {layout.conns.map((c, i) => (
          <g key={i}>
            <path className="demo-coach-conn" d={`M${c.x1} ${c.y1} L${c.x2} ${c.y2}`} />
            <circle className="demo-coach-conn-dot" cx={c.x2} cy={c.y2} r={3} />
          </g>
        ))}
      </svg>

      {STEPS.map((step, i) => (
        <div
          key={i}
          className="demo-coach-card"
          style={{ left: layout.cards[i].x, top: layout.cards[i].y }}
        >
          <button
            type="button"
            className="demo-coach-close"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss tips"
            title="Dismiss (Esc)"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div className="demo-coach-head">
            <span className="demo-coach-step">{i + 1} of 3</span>
            <span className="demo-coach-title">{step.title}</span>
          </div>
          <p className="demo-coach-body">{step.body}</p>
        </div>
      ))}

      <div className="demo-coach-dismiss-bar">
        <button
          type="button"
          className="demo-coach-dismiss"
          data-testid="coachmarks-dismiss"
          onClick={() => setDismissed(true)}
          autoFocus
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Got it, hide these tips
        </button>
      </div>
    </div>
  );
}
