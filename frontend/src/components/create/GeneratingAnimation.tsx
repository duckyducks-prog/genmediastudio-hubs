import { useState, useEffect, useRef } from "react";

const PARTICLE_COLORS: Record<number, string> = {
  2: "lavender", 5: "orange",
  7: "lavender", 10: "orange",
  12: "lavender", 16: "orange",
};

const VERBS = [
  "generating", "thinking", "drawing", "painting", "composing",
  "imagining", "crafting", "sketching", "conjuring", "dreaming",
];

interface GeneratingAnimationProps {
  mode: "image" | "video";
}

export function GeneratingAnimation({ mode: _mode }: GeneratingAnimationProps) {
  const [currentVerb, setCurrentVerb] = useState(VERBS[0]);
  const [swapping, setSwapping] = useState(false);
  const verbIndexRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSwapping(true);
      setTimeout(() => {
        verbIndexRef.current = (verbIndexRef.current + 1) % VERBS.length;
        setCurrentVerb(VERBS[verbIndexRef.current]);
        setSwapping(false);
      }, 400);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="ratio-stage" style={{ position: "absolute", top: 25, left: "50%", transform: "translateX(-50%)", width: 240, height: 170 }}>
      {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          className={`particle pp-${n}${PARTICLE_COLORS[n] ? ` ${PARTICLE_COLORS[n]}` : ""}`}
        />
      ))}
      {/* Text centered at the same origin as the particles */}
      <div className="gen-text-wrap">
        <span className={`gen-text${swapping ? " swapping" : ""}`}>
          {currentVerb}
        </span>
      </div>
    </div>
  );
}
