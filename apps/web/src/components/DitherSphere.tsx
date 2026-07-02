import { useEffect, useState } from "react";
import { Dithering } from "@paper-design/shaders-react";

function readSphereFront(): string {
  if (typeof document === "undefined") return "#00b2ff";
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--sphere-front")
      .trim() || "#00b2ff"
  );
}

/**
 * The dithering sphere — blue in light mode, white in dark. The app's accent
 * and its only progress indicator.
 */
export function DitherSphere({
  busy = false,
  size = 44,
}: {
  busy?: boolean;
  size?: number;
}) {
  const [colorFront, setColorFront] = useState(readSphereFront);

  useEffect(() => {
    const sync = () => setColorFront(readSphereFront());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", sync);
    };
  }, []);

  return (
    <Dithering
      speed={busy ? 3.2 : 1.24}
      shape="sphere"
      type="4x4"
      size={0.1}
      scale={busy ? 0.58 : 0.5}
      colorBack="#00000000"
      colorFront={colorFront}
      style={{ height: `${size}px`, width: `${size}px` }}
    />
  );
}
