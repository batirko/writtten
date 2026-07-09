import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Onboarding coachmarks for the "See it in action" demo.
 *
 * A single tidy panel — three cards stacked in the empty gutter between the
 * writing canvas and the observation feed — that orients a first-timer to the
 * three surfaces, then gets out of the way. Each card points to its surface
 * with a thin connector (no spotlight rings — those read as clutter), and
 * carries a non-invasive "Learn more" that unfolds a second layer of detail.
 *
 * Layout: the stack is centered in the gutter and clamped on-screen, so on a
 * narrower desktop it stays usable (it may overlap the prose edge — accepted).
 * Non-blocking: the wrapper + SVG are pointer-events:none; only the cards and
 * their controls take events. Gated on `demoActive`; dismissed by the in-stack
 * "Got it" or Escape. Suppressed ≤720px (the layout stacks / the feed hides
 * there — the MobileNote strip sets the "best on a laptop" expectation).
 *
 * See docs/projects/onboarding_first_run.md § The coachmarks.
 */

const CARD_W = 220;
const MOBILE_QUERY = "(max-width: 720px)";

const STEPS = [
  {
    title: "Canvas",
    body: "Where you write your document. Everything here is yours — the AI never edits it.",
    detail:
      "Full editing — headings, lists, tables, formatting, paste. When the AI flags something, the exact words get a colored highlight; hover it to see the note that goes with it.",
  },
  {
    title: "Notes",
    body: "The AI's reactions to your writing land here as you go — things to reconsider, never fixes.",
    detail:
      "The kinds it raises: unclear passages, unsupported claims, undefined jargon, missing or underdeveloped topics, audience or structure issues, and cross-section contradictions or tensions. Each card names a spot and why it's worth a look — hover it to jump there, dismiss the ones that don't land (they move to an archive), and a card clears itself once you resolve it.",
  },
  {
    title: "Activity monitor",
    body: "Shows when the AI is reading and thinking — and it's the hub for everything else.",
    detail:
      "Click it to open settings — pick a model or add your own API key — import or export your document, or open the debug panel to see exactly what the AI is doing.",
  },
];

interface Placement {
  left: number;
  top: number;
}
interface Conn {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function rectOf(sel: string): DOMRect | null {
  const r = document.querySelector(sel)?.getBoundingClientRect();
  return r && r.width >= 1 && r.height >= 1 ? r : null;
}

function connsEqual(a: Conn[], b: Conn[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((c, i) => {
    const d = b[i];
    return (
      Math.abs(c.x1 - d.x1) < 0.5 &&
      Math.abs(c.y1 - d.y1) < 0.5 &&
      Math.abs(c.x2 - d.x2) < 0.5 &&
      Math.abs(c.y2 - d.y2) < 0.5
    );
  });
}

export function DemoCoachmarks({ active }: { active: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [place, setPlace] = useState<Placement | null>(null);
  const [conns, setConns] = useState<Conn[]>([]);
  const [dotRing, setDotRing] = useState<{ cx: number; cy: number; r: number } | null>(null);
  const [tick, setTick] = useState(0);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  // A fresh demo load re-shows the tour, collapsed (the demo isn't persisted).
  useEffect(() => {
    if (active) {
      setDismissed(false);
      setExpanded(new Set());
    }
  }, [active]);

  const visible = active && !dismissed;

  // One rAF-throttled tick drives every recompute (resize / scroll / observed
  // layout change). Listeners attach whenever visible — even on mobile — so a
  // mobile→desktop resize recovers (measurement suppresses on ≤720px).
  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const bump = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTick((t) => t + 1));
    };
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
    const ro = new ResizeObserver(bump);
    const panel = document.querySelector(".editor-panel");
    const feedSlot = document.querySelector(".feed-slot");
    if (panel) ro.observe(panel);
    if (feedSlot) ro.observe(feedSlot);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", bump);
      window.removeEventListener("scroll", bump, true);
      ro.disconnect();
    };
  }, [visible]);

  // Place the stack in the gutter (centered between prose-right and feed-left),
  // clamped on-screen. Suppress on mobile.
  useLayoutEffect(() => {
    if (!visible) return;
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setPlace(null);
      return;
    }
    const col = rectOf(".editor-column");
    const prose = rectOf(".ProseMirror") ?? col;
    const feed = rectOf(".sidecar-panel");
    if (!col || !prose || !feed) {
      setPlace(null);
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min((prose.right + feed.left) / 2 - CARD_W / 2, vw - CARD_W - 8));
    const top = Math.max(12, Math.min(col.top, vh * 0.14));
    setPlace((prev) =>
      prev && Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5
        ? prev
        : { left, top }
    );
  }, [visible, tick]);

  // After the cards lay out, draw thin connectors from cards 1 and 2 to their
  // surfaces. Card 3 (activity monitor) gets no connector — instead the dot is
  // ringed (below), which reads cleaner than a line crossing the feed to reach
  // the far-right dot.
  useLayoutEffect(() => {
    if (!visible || !place) {
      if (conns.length) setConns([]);
      if (dotRing) setDotRing(null);
      return;
    }
    const col = rectOf(".editor-column");
    const feed = rectOf(".sidecar-panel");
    const dot = rectOf('[data-testid="control-anchor"]');
    const rects = cardRefs.current.map((el) => el?.getBoundingClientRect());
    if (!col || !feed || !dot || !rects[0] || !rects[1]) {
      if (conns.length) setConns([]);
      if (dotRing) setDotRing(null);
      return;
    }
    const [r0, r1] = rects as DOMRect[];
    const midY = (r: DOMRect) => r.top + r.height / 2;
    const next: Conn[] = [
      // card 1 → canvas (left, into the writing column's right edge)
      {
        x1: r0.left,
        y1: midY(r0),
        x2: col.right,
        y2: Math.max(col.top + 8, Math.min(midY(r0), col.bottom - 8)),
      },
      // card 2 → feed (right, to its left edge)
      {
        x1: r1.right,
        y1: midY(r1),
        x2: feed.left,
        y2: Math.max(feed.top + 8, Math.min(midY(r1), feed.bottom - 8)),
      },
    ];
    setConns((prev) => (connsEqual(prev, next) ? prev : next));
    const ring = {
      cx: dot.left + dot.width / 2,
      cy: dot.top + dot.height / 2,
      r: Math.max(dot.width, dot.height) / 2 + 9,
    };
    setDotRing((prev) =>
      prev && Math.abs(prev.cx - ring.cx) < 0.5 && Math.abs(prev.cy - ring.cy) < 0.5 ? prev : ring
    );
  }, [visible, place, expanded, tick, conns.length, dotRing]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDismissed(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  if (!visible || !place) return null;

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="demo-coachmarks" role="region" aria-label="Getting started">
      <svg
        className="demo-coach-svg"
        width={window.innerWidth}
        height={window.innerHeight}
        viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
        aria-hidden="true"
      >
        {conns.map((c, i) => (
          <g key={i}>
            <path className="demo-coach-conn" d={`M${c.x1} ${c.y1} L${c.x2} ${c.y2}`} />
            <circle className="demo-coach-conn-dot" cx={c.x2} cy={c.y2} r={3} />
          </g>
        ))}
        {dotRing && (
          <circle className="demo-coach-ring" cx={dotRing.cx} cy={dotRing.cy} r={dotRing.r} />
        )}
      </svg>

      <div
        className="demo-coach-stack"
        style={{
          left: place.left,
          top: place.top,
          width: CARD_W,
          height: Math.max(180, window.innerHeight - place.top - 16),
        }}
      >
        {/* Cards spread top → middle → bottom (space-between) so each sits near
            its surface — card 3 lands low by the activity dot, keeping its
            connector short instead of a long diagonal from the top. */}
        <div className="demo-coach-cards">
          {STEPS.map((step, i) => {
            const open = expanded.has(i);
            return (
              <div
                key={i}
                className="demo-coach-card"
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
              >
                <div className="demo-coach-head">
                  <span className="demo-coach-step">{i + 1}</span>
                  <span className="demo-coach-title">{step.title}</span>
                </div>
                <p className="demo-coach-body">{step.body}</p>
                {open && <p className="demo-coach-detail">{step.detail}</p>}
                <button
                  type="button"
                  className="demo-coach-more"
                  aria-expanded={open}
                  onClick={() => toggle(i)}
                >
                  {open ? "Show less" : "Learn more"}
                  <span className="demo-coach-more-chev" aria-hidden="true">
                    {open ? "▴" : "▾"}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
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
          Got it
        </button>
      </div>
    </div>
  );
}
