import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ExecutionStep } from "./useWorkflowExecution";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParticleColor {
  base: [number, number, number];
  baseOpacity: number;
  glowColor: [number, number, number];
}

interface Particle {
  x: number; y: number;
  restX: number; restY: number;
  vx: number; vy: number;
  r: number;
  color: ParticleColor;
  driftPhase: number; driftPhaseY: number;
  driftSpeed: number; driftRadius: number;
  driftRatioX: number; driftRatioY: number;
  lightness: number;
}

interface WorkflowRunningScreenProps {
  steps: ExecutionStep[];
  onCancel: () => void;
}

// ─── Color palette ────────────────────────────────────────────────────────────

const PARTICLE_COLORS: ParticleColor[] = [
  { base: [185, 205, 190], baseOpacity: 0.32, glowColor: [185, 205, 190] },
  { base: [185, 205, 190], baseOpacity: 0.42, glowColor: [200, 220, 205] },
  { base: [252, 195, 220], baseOpacity: 0.35, glowColor: [252, 195, 220] },
  { base: [252, 195, 220], baseOpacity: 0.50, glowColor: [255, 210, 230] },
  { base: [255, 100,  50], baseOpacity: 0.38, glowColor: [255, 130,  80] },
];

const COLOR_WEIGHTS = [0.45, 0.65, 0.83, 0.95, 1.00]; // cumulative

function pickColor(): ParticleColor {
  const r = Math.random();
  for (let i = 0; i < COLOR_WEIGHTS.length; i++) {
    if (r < COLOR_WEIGHTS[i]) return PARTICLE_COLORS[i];
  }
  return PARTICLE_COLORS[0];
}

// ─── Particle factory ─────────────────────────────────────────────────────────

function createParticle(x: number, y: number): Particle {
  const cat = Math.random();
  let driftRadius: number, driftSpeed: number;
  if (cat < 0.3) {
    driftRadius = 22 + Math.random() * 18; driftSpeed = 0.0004 + Math.random() * 0.0003;
  } else if (cat < 0.7) {
    driftRadius = 14 + Math.random() * 14; driftSpeed = 0.0007 + Math.random() * 0.0005;
  } else {
    driftRadius = 8 + Math.random() * 10;  driftSpeed = 0.0012 + Math.random() * 0.0008;
  }
  return {
    x, y, restX: x, restY: y,
    vx: 0, vy: 0,
    r: 0.9 + Math.random() * 1.5,
    color: pickColor(),
    driftPhase: Math.random() * Math.PI * 2,
    driftPhaseY: Math.random() * Math.PI * 2,
    driftSpeed, driftRadius,
    driftRatioX: 0.6 + Math.random() * 0.8,
    driftRatioY: 0.6 + Math.random() * 0.8,
    lightness: 0,
  };
}

function buildParticles(w: number, h: number, count: number): Particle[] {
  const particles: Particle[] = [];
  const MIN_DIST = 26;
  let attempts = 0;
  while (particles.length < count && attempts < count * 40) {
    attempts++;
    const x = 18 + Math.random() * (w - 36);
    const y = 18 + Math.random() * (h - 36);
    const dx = (x - w / 2) / (w * 0.18);
    const dy = (y - h / 2) / (h * 0.14);
    if (dx * dx + dy * dy < 1) continue;
    let tooClose = false;
    for (const p of particles) {
      const nx = p.restX - x, ny = p.restY - y;
      if (nx * nx + ny * ny < MIN_DIST * MIN_DIST) { tooClose = true; break; }
    }
    if (tooClose) continue;
    particles.push(createParticle(x, y));
  }
  return particles;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────



// ─── Component ────────────────────────────────────────────────────────────────

export function WorkflowRunningScreen({ steps, onCancel }: WorkflowRunningScreenProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const blurCanvasRef = useRef<HTMLCanvasElement>(null);
  const sharpCanvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mousePosRef = useRef({ x: -9999, y: -9999, active: false });
  const rafRef = useRef<number>(0);
  const dimsRef = useRef({ w: 0, h: 0 });

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const NUM_PARTICLES = isMobile ? 60 : 110;

  // ── Canvas setup ──────────────────────────────────────────────────
  const setupCanvas = useCallback(() => {
    const stage = stageRef.current;
    const blur = blurCanvasRef.current;
    const sharp = sharpCanvasRef.current;
    if (!stage || !blur || !sharp) return false;

    const rect = stage.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (w < 50 || h < 50) return false;
    if (w === dimsRef.current.w && h === dimsRef.current.h) return true;

    const dpr = window.devicePixelRatio || 1;
    [blur, sharp].forEach(c => {
      c.width = w * dpr; c.height = h * dpr;
      c.style.width = w + "px"; c.style.height = h + "px";
      c.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
    });

    dimsRef.current = { w, h };
    particlesRef.current = buildParticles(w, h, NUM_PARTICLES);
    return true;
  }, [NUM_PARTICLES]);

  // ── Render loop ───────────────────────────────────────────────────
  const tick = useCallback((t: number) => {
    const blur = blurCanvasRef.current;
    const sharp = sharpCanvasRef.current;
    if (!blur || !sharp) { rafRef.current = requestAnimationFrame(tick); return; }

    const ctxBlur = blur.getContext("2d")!;
    const ctxSharp = sharp.getContext("2d")!;
    const { w, h } = dimsRef.current;
    const { x: mouseX, y: mouseY, active: mouseActive } = mousePosRef.current;

    ctxBlur.clearRect(0, 0, w, h);
    ctxSharp.clearRect(0, 0, w, h);

    const LIGHT_RADIUS = 220, NUDGE_RADIUS = 120;
    const NUDGE_STRENGTH = 0.18, SPRING = 0.025, DAMPING = 0.88;

    for (const p of particlesRef.current) {
      const driftX = Math.cos(t * p.driftSpeed + p.driftPhase) * p.driftRadius * p.driftRatioX;
      const driftY = Math.sin(t * p.driftSpeed * 1.2 + p.driftPhaseY) * p.driftRadius * p.driftRatioY;
      const targetX = p.restX + driftX;
      const targetY = p.restY + driftY;

      const dx = p.x - mouseX, dy = p.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let targetLightness = 0;
      if (mouseActive && dist < LIGHT_RADIUS) {
        const t01 = 1 - dist / LIGHT_RADIUS;
        targetLightness = Math.pow(t01, 1.3);
      }
      const lerpSpeed = targetLightness > p.lightness ? 0.18 : 0.05;
      p.lightness += (targetLightness - p.lightness) * lerpSpeed;

      if (mouseActive && dist < NUDGE_RADIUS && dist > 0) {
        const force = (NUDGE_RADIUS - dist) / NUDGE_RADIUS;
        p.vx += (dx / dist) * force * NUDGE_STRENGTH;
        p.vy += (dy / dist) * force * NUDGE_STRENGTH;
      }
      p.vx += (targetX - p.x) * SPRING;
      p.vy += (targetY - p.y) * SPRING;
      p.vx *= DAMPING; p.vy *= DAMPING;
      p.x += p.vx; p.y += p.vy;

      const opacity = p.color.baseOpacity + (1 - p.color.baseOpacity) * p.lightness;
      const drawR = p.r * (1 + p.lightness * 0.8);
      const blurOpacity = opacity * (1 - p.lightness);
      const sharpOpacity = opacity * p.lightness;

      if (blurOpacity > 0.01) {
        ctxBlur.fillStyle = `rgba(${p.color.base[0]},${p.color.base[1]},${p.color.base[2]},${blurOpacity.toFixed(3)})`;
        ctxBlur.beginPath(); ctxBlur.arc(p.x, p.y, drawR, 0, Math.PI * 2); ctxBlur.fill();
      }

      if (p.lightness > 0.02) {
        ctxSharp.shadowColor = `rgba(${p.color.glowColor[0]},${p.color.glowColor[1]},${p.color.glowColor[2]},${p.lightness.toFixed(3)})`;
        ctxSharp.shadowBlur = 22 + p.lightness * 28;
        ctxSharp.fillStyle = `rgba(${p.color.base[0]},${p.color.base[1]},${p.color.base[2]},${sharpOpacity.toFixed(3)})`;
        ctxSharp.beginPath(); ctxSharp.arc(p.x, p.y, drawR, 0, Math.PI * 2); ctxSharp.fill();

        if (p.lightness > 0.3) {
          ctxSharp.shadowBlur = 8 + p.lightness * 10;
          ctxSharp.fillStyle = `rgba(${p.color.glowColor[0]},${p.color.glowColor[1]},${p.color.glowColor[2]},${(p.lightness * 0.8).toFixed(3)})`;
          ctxSharp.beginPath(); ctxSharp.arc(p.x, p.y, drawR * 0.6, 0, Math.PI * 2); ctxSharp.fill();
        }
        if (p.lightness > 0.6) {
          ctxSharp.shadowBlur = 4;
          ctxSharp.fillStyle = `rgba(255,255,255,${((p.lightness - 0.6) * 1.5).toFixed(3)})`;
          ctxSharp.beginPath(); ctxSharp.arc(p.x, p.y, drawR * 0.35, 0, Math.PI * 2); ctxSharp.fill();
        }
      }
    }
    ctxSharp.shadowBlur = 0;
    rafRef.current = requestAnimationFrame(tick);
  }, []);


  // ── Mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    const tryInit = () => { if (!setupCanvas()) requestAnimationFrame(tryInit); else rafRef.current = requestAnimationFrame(tick); };
    tryInit();

    const ro = new ResizeObserver(() => requestAnimationFrame(setupCanvas));
    if (stageRef.current) ro.observe(stageRef.current);

    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [setupCanvas, tick]);

  // ── Cursor tracking ───────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const rect = sharpCanvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
    };
    const onLeave = () => { mousePosRef.current = { ...mousePosRef.current, active: false }; };
    const el = sharpCanvasRef.current;
    el?.addEventListener("mousemove", onMove);
    el?.addEventListener("mouseleave", onLeave);
    return () => { el?.removeEventListener("mousemove", onMove); el?.removeEventListener("mouseleave", onLeave); };
  }, []);


  // ── Escape to cancel ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  const completedCount = steps.filter(s => s.status === "completed").length;
  const allDone = completedCount === steps.length && steps.length > 0;

  const screen = (
    <div
      ref={stageRef}
      role="status"
      aria-live="polite"
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "hsl(var(--background))",
        backgroundImage: "radial-gradient(rgba(185,205,190,0.06) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
        overflow: "hidden",
        animation: "wr-enter 600ms cubic-bezier(0.16,1,0.3,1) both",
      }}
    >
      <style>{`
        @keyframes wr-enter  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes wr-aura   { 0%,100% { transform: translate(-50%,-50%) scale(1); opacity:0.8; } 50% { transform: translate(-50%,-50%) scale(1.12); opacity:1; } }
        @keyframes wr-pulse  { 0%,100% { box-shadow: 0 0 12px rgba(252,195,220,0.7); } 50% { box-shadow: 0 0 22px rgba(252,195,220,1), 0 0 32px rgba(252,195,220,0.4); } }
        @keyframes wr-status { 0%,100% { opacity: 0.55; } 50% { opacity: 0.9; } }
        @keyframes wr-dots   { 0% { content: ''; } 33% { content: '.'; } 66% { content: '..'; } 100% { content: '...'; } }
        .wr-status-text::after { content: ''; animation: wr-dots 1.6s steps(1,end) infinite; }
        @media (prefers-reduced-motion: reduce) {
          .wr-aura-el { animation: none !important; opacity: 0.9 !important; }
          .wr-marker-active { animation: none !important; }
        }
      `}</style>

      {/* Breathing aura */}
      <div className="wr-aura-el" style={{
        position: "absolute", top: "50%", left: "50%",
        width: 480, height: 480, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(252,195,220,0.03) 0%, rgba(185,205,190,0.02) 35%, transparent 70%)",
        animation: "wr-aura 5s ease-in-out infinite",
        pointerEvents: "none", zIndex: 1,
      }} />

      {/* Blur canvas */}
      <canvas ref={blurCanvasRef} style={{
        position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
        display: "block", zIndex: 2, filter: "blur(2.5px)", pointerEvents: "none",
      }} />
      {/* Sharp canvas — receives cursor events */}
      <canvas ref={sharpCanvasRef} style={{
        position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
        display: "block", zIndex: 3, cursor: "crosshair",
      }} />

      {/* Centre content */}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        display: "flex", alignItems: "center", gap: 50,
        zIndex: 10, pointerEvents: "none",
      }}>
        {/* Step ladder */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {steps.map((step) => {
            const isActive = step.status === "active";
            const isDone = step.status === "completed";
            const isFailed = step.status === "failed";
            return (
              <div key={step.nodeId} style={{
                display: "flex", alignItems: "center", gap: 12,
                opacity: isDone ? 0.55 : isActive ? 1 : isFailed ? 0.6 : 0.3,
                fontSize: 11, fontWeight: isActive ? 500 : 400,
                color: isDone ? "hsl(var(--primary))" : isFailed ? "#FF6B33" : isActive ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                transition: "opacity 400ms ease-out, color 400ms ease-out",
              }}>
                {/* Square marker — intentionally not circular to differ from particles */}
                <div className={isActive ? "wr-marker-active" : undefined} style={{
                  width: isActive ? 10 : 7,
                  height: isActive ? 10 : 7,
                  background: isFailed ? "#FF4800" : isActive ? "rgba(252,195,220,1)" : "currentColor",
                  flexShrink: 0,
                  borderRadius: isActive ? 2 : 1,
                  boxShadow: isActive ? "0 0 12px rgba(252,195,220,0.7)" : "none",
                  animation: isActive ? "wr-pulse 1.8s ease-in-out infinite" : "none",
                  transition: "all 300ms cubic-bezier(0.16,1,0.3,1)",
                }} />
                <span>{step.label}</span>
              </div>
            );
          })}
        </div>

        {/* Vertical divider + info block */}
        <div style={{ borderLeft: "1px solid rgba(185,205,190,0.15)", paddingLeft: 38 }}>
          <p
            className={allDone ? undefined : "wr-status-text"}
            style={{
              fontSize: 11, color: "hsl(var(--muted-foreground))",
              fontStyle: "italic", maxWidth: 220, lineHeight: 1.4, margin: 0,
              animation: allDone ? "none" : "wr-status 2.4s ease-in-out infinite",
            }}
          >
            {allDone ? "Complete" : "Running workflow"}
          </p>
          <p style={{ marginTop: 8, fontSize: 10, color: "#7A8E90", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {steps.length > 0 ? `${completedCount} of ${steps.length} steps done` : ""}
          </p>

          {/* Notify + cancel — directly below the info block */}
          <div style={{
            marginTop: 24, display: "flex", alignItems: "center", gap: 12,
            pointerEvents: "auto",
          }}>
            <span style={{ fontSize: 10, color: "#7A8E90", letterSpacing: "0.04em" }}>
              We'll notify you when it's ready
            </span>
            <button
              onClick={onCancel}
              style={{
                background: "transparent", border: "1px solid rgba(255,72,0,0.22)",
                color: "rgba(255,100,50,0.8)", padding: "4px 10px", borderRadius: 999,
                fontSize: 10, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
                transition: "border-color 120ms, background 120ms",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,72,0,0.4)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,72,0,0.05)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,72,0,0.22)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(screen, document.body);
}
