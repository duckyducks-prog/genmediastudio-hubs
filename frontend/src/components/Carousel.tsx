import { useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CarouselProps {
  children: React.ReactNode;
  cardStep: number;  // px to scroll per arrow click (card width + gap)
  className?: string;
}

export function Carousel({ children, cardStep, className = "" }: CarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLButtonElement>(null);
  const rightRef = useRef<HTMLButtonElement>(null);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!el || !left || !right) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 1;
    const display = hasOverflow ? "" : "none";
    left.style.display = display;
    right.style.display = display;
    if (hasOverflow) {
      left.disabled = el.scrollLeft <= 0;
      right.disabled = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    }
    wrapRef.current?.classList.toggle("scrolled-from-start", el.scrollLeft > 0);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    const observer = new ResizeObserver(updateArrows);
    observer.observe(el);
    updateArrows();
    return () => {
      el.removeEventListener("scroll", updateArrows);
      observer.disconnect();
    };
  }, [updateArrows]);

  return (
    <div ref={wrapRef} className="carousel-wrap">
      <div ref={scrollRef} className={`carousel ${className}`}>
        {children}
      </div>
      <button
        ref={leftRef}
        className="carousel-arrow left"
        aria-label="Previous"
        onClick={() => scrollRef.current?.scrollBy({ left: -cardStep, behavior: "smooth" })}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        ref={rightRef}
        className="carousel-arrow right"
        aria-label="Next"
        onClick={() => scrollRef.current?.scrollBy({ left: cardStep, behavior: "smooth" })}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
