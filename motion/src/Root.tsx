import "./index.css";
import { Composition } from "remotion";
import { TaroMotion, TOTAL_FRAMES } from "./TaroVideo";
import { TaroIntro, TOTAL_INTRO_FRAMES } from "./IntroVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TaroMotion"
        component={TaroMotion}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="TaroIntro"
        component={TaroIntro}
        durationInFrames={TOTAL_INTRO_FRAMES}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};