"use client";
import { useEffect } from "react";

export function ScrollEffects() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const nodes = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12 },
    );
    // Visible without JS; only below-the-fold elements acquire the initial hidden state.
    nodes.forEach((node) => {
      if (node.getBoundingClientRect().top > window.innerHeight) {
        node.classList.add("reveal-ready");
        observer.observe(node);
      }
    });
    let frame = 0;
    const paint = () => {
      frame = 0;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      document.documentElement.style.setProperty(
        "--page-progress",
        String(height > 0 ? window.scrollY / height : 0),
      );
      document
        .querySelector(".site-header")
        ?.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    window.addEventListener("scroll", scroll, { passive: true });
    paint();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", scroll);
      cancelAnimationFrame(frame);
      nodes.forEach((n) => n.classList.remove("reveal-ready"));
    };
  }, []);
  return null;
}
