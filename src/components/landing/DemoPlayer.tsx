import { Player } from "@remotion/player";
import { DEMO, GilipollaDemo } from "@/remotion/GilipollaDemo";

/** Reproductor del video demo (composición Remotion). Carga solo en cliente vía React.lazy. */
export default function DemoPlayer() {
  return (
    <Player
      component={GilipollaDemo}
      durationInFrames={DEMO.durationInFrames}
      fps={DEMO.fps}
      compositionWidth={DEMO.width}
      compositionHeight={DEMO.height}
      style={{ width: "100%", height: "100%" }}
      controls
      autoPlay
      loop
    />
  );
}
