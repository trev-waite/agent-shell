import { GemSmoke, LiquidMetal } from "@paper-design/shaders-react";
import { useEffect, useMemo, useState } from "react";
import {
  orbPalette,
  orbSpeed,
  type AgentOrbStatus,
} from "../lib/orbStatus";

function readToken(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

function readThemeTokens() {
  if (typeof document === "undefined") {
    return {
      accent: "#00b2ff",
      sphereFront: "#00b2ff",
      isDark: false,
    };
  }
  return {
    accent: readToken("--accent", "#00b2ff"),
    sphereFront: readToken("--sphere-front", "#00b2ff"),
    isDark: document.documentElement.classList.contains("theme-dark"),
  };
}

/**
 * Liquid agent orb — multi-color gem smoke inside a chrome metaball shell.
 * Both layers share the same metaball silhouette so color and glass stay aligned.
 */
export function AgentOrb({
  status = "idle",
  size = 72,
}: {
  status?: AgentOrbStatus;
  size?: number;
}) {
  const [tokens, setTokens] = useState(readThemeTokens);

  useEffect(() => {
    const sync = () => setTokens(readThemeTokens());
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

  const colors = useMemo(
    () =>
      orbPalette(status, tokens.accent, tokens.sphereFront, tokens.isDark),
    [status, tokens.accent, tokens.sphereFront, tokens.isDark],
  );
  const colorTint = colors[3] ?? colors[0];
  const speed = orbSpeed(status);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        filter: `drop-shadow(0 0 ${size * 0.3}px ${colors[0]}88) drop-shadow(0 0 ${size * 0.55}px ${colors[2]}55)`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          overflow: "hidden",
        }}
      >
        <GemSmoke
          shape="metaballs"
          colorBack="#00000000"
          colorInner="#00000000"
          colors={colors}
          size={0.85}
          scale={0.62}
          innerGlow={1}
          outerGlow={0}
          innerDistortion={0.85}
          outerDistortion={0}
          offset={0.15}
          speed={speed}
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            inset: 0,
          }}
        />
        <LiquidMetal
          shape="metaballs"
          colorBack="#00000000"
          colorTint={colorTint}
          scale={0.62}
          repetition={3}
          softness={0.5}
          distortion={0.2}
          contour={0.6}
          shiftRed={0.35}
          shiftBlue={0.35}
          angle={70}
          speed={speed * 1.4}
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            inset: 0,
            mixBlendMode: "overlay",
            opacity: 0.65,
          }}
        />
      </div>
    </div>
  );
}
