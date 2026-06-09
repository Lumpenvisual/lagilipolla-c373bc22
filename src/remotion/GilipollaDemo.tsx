import { loadFont } from "@remotion/google-fonts/BebasNeue";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import heroStadium from "@/assets/hero-stadium.jpg";

const { fontFamily: DISPLAY } = loadFont();

/** Metadatos de la composición (compartidos con el <Player>). */
export const DEMO = { fps: 30, width: 1280, height: 720, durationInFrames: 360 } as const;

const GOLD = "#FCD116";
const BLUE = "#2b55c8";
const RED = "#ce1126";
const BG = "#0b1530";
const CREAM = "#f5ecd6";
const MUTED = "#9aa8c8";

const GRUPO_K = [
  { n: "Colombia", c: GOLD },
  { n: "Portugal", c: RED },
  { n: "RD Congo", c: BLUE },
  { n: "Uzbekistán", c: CREAM },
];

const LEADERBOARD = [
  { n: "Sofía", pts: 41, c: GOLD },
  { n: "Andrés", pts: 35, c: BLUE },
  { n: "Camila", pts: 28, c: RED },
];

function useFadeUp(start: number, dur = 18, shift = 28) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [start, start + dur], [shift, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  return { opacity, transform: `translateY(${y}px)` };
}

function FlagBar({ height = 10 }: { height?: number }) {
  return (
    <div style={{ display: "flex", width: "100%", height }}>
      <div style={{ flex: 2, background: GOLD }} />
      <div style={{ flex: 1, background: BLUE }} />
      <div style={{ flex: 1, background: RED }} />
    </div>
  );
}

function Background() {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <AbsoluteFill style={{ opacity: 0.14 }}>
        <Img src={heroStadium} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(900px 540px at 50% -10%, rgba(252,209,22,0.18), transparent 60%), radial-gradient(700px 480px at 90% 100%, rgba(206,17,38,0.16), transparent 60%)",
        }}
      />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        <FlagBar />
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
        <FlagBar />
      </div>
    </AbsoluteFill>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: 64,
        fontFamily: DISPLAY,
        color: CREAM,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

function Intro() {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const s = spring({ frame, fps, config: { damping: 200 } });
  const scale = interpolate(s, [0, 1], [0.8, 1]);
  const sub = useFadeUp(18);
  return (
    <Center>
      <div style={{ transform: `scale(${scale})`, opacity: s }}>
        <div style={{ fontSize: 34, letterSpacing: 8, color: GOLD }}>POLLA OFICIAL DEL BAR</div>
        <div style={{ fontSize: 130, lineHeight: 1, marginTop: 8 }}>
          LA <span style={{ color: GOLD }}>GILIPOLLA</span> 2026
        </div>
      </div>
      <div style={{ ...sub, fontSize: 30, color: MUTED, marginTop: 12, letterSpacing: 2 }}>
        Bar El Guanábano · Mundial FIFA 2026
      </div>
    </Center>
  );
}

function Step({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  const head = useFadeUp(0);
  const body = useFadeUp(10);
  return (
    <Center>
      <div style={{ ...head }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 16,
            justifyContent: "center",
          }}
        >
          <span
            style={{
              width: 72,
              height: 72,
              borderRadius: 999,
              background: GOLD,
              color: "#1a1200",
              fontSize: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {num}
          </span>
          <span style={{ fontSize: 64 }}>{title}</span>
        </div>
      </div>
      <div style={{ ...body, marginTop: 28 }}>{children}</div>
    </Center>
  );
}

function Chip({ label, color, delay }: { label: string; color: string; delay: number }) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14 } });
  return (
    <div
      style={{
        opacity: s,
        transform: `scale(${s})`,
        border: `2px solid ${color}`,
        color: CREAM,
        background: "rgba(20,33,67,0.7)",
        borderRadius: 14,
        padding: "14px 26px",
        fontSize: 38,
      }}
    >
      {label}
    </div>
  );
}

function Bar({
  name,
  pts,
  color,
  max,
  delay,
}: {
  name: string;
  pts: number;
  color: string;
  max: number;
  delay: number;
}) {
  const frame = useCurrentFrame();
  const w = interpolate(frame - delay, [0, 24], [0, (pts / max) * 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, width: 760 }}>
      <div style={{ width: 180, textAlign: "right", fontSize: 34, color: CREAM }}>{name}</div>
      <div style={{ flex: 1, height: 40, background: "rgba(255,255,255,0.08)", borderRadius: 8 }}>
        <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 8 }} />
      </div>
      <div style={{ width: 70, fontSize: 34, color: GOLD }}>{Math.round((w / 100) * max)}</div>
    </div>
  );
}

function Outro() {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const s = spring({ frame, fps, config: { damping: 200 } });
  return (
    <Center>
      <div style={{ transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`, opacity: s }}>
        <div style={{ fontSize: 88, lineHeight: 1.05 }}>
          ¡Qué Polla,
          <br />
          <span style={{ color: GOLD }}>por fin salió!</span>
        </div>
        <div style={{ fontSize: 30, color: MUTED, marginTop: 20, letterSpacing: 2 }}>
          Inscríbete antes del 11 de junio · $100.000 COP
        </div>
      </div>
    </Center>
  );
}

export function GilipollaDemo() {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Background />

      <Sequence durationInFrames={2.6 * fps}>
        <Intro />
      </Sequence>

      <Sequence from={2.6 * fps} durationInFrames={2.4 * fps}>
        <Step num="1" title="Inscríbete">
          <div style={{ fontSize: 40, color: CREAM }}>
            Paga <span style={{ color: GOLD }}>$100.000 COP</span> en el bar
          </div>
        </Step>
      </Sequence>

      <Sequence from={5 * fps} durationInFrames={3 * fps}>
        <Step num="2" title="Llena tu planilla">
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center" }}>
            {GRUPO_K.map((t, i) => (
              <Chip key={t.n} label={t.n} color={t.c} delay={5 * fps + 10 + i * 8} />
            ))}
          </div>
          <div style={{ fontSize: 26, color: MUTED, marginTop: 22 }}>
            Grupo K · marcadores y los 2 que clasifican de cada grupo
          </div>
        </Step>
      </Sequence>

      <Sequence from={8 * fps} durationInFrames={2.6 * fps}>
        <Step num="3" title="Sube en la tabla">
          <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
            {LEADERBOARD.map((r, i) => (
              <Bar
                key={r.n}
                name={r.n}
                pts={r.pts}
                color={r.c}
                max={45}
                delay={8 * fps + 12 + i * 6}
              />
            ))}
          </div>
        </Step>
      </Sequence>

      <Sequence from={10.6 * fps}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
}
