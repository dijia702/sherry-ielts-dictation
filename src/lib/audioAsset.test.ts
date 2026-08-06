import { describe, expect, it } from "vitest";
import { resolveAudioAssetUrl } from "./audioAsset";

describe("resolveAudioAssetUrl", () => {
  it("uses local assets when no hosted audio base is configured", () => {
    expect(resolveAudioAssetUrl("audio/jian21/sea.mp3", "http://127.0.0.1:5173/", "")).toBe(
      "http://127.0.0.1:5173/audio/jian21/sea.mp3",
    );
  });

  it("uses the hosted audio directory for cloud builds", () => {
    expect(
      resolveAudioAssetUrl(
        "audio/jian21/sea.mp3",
        "https://dijia702.github.io/sherry-ielts-dictation/",
        "https://raw.githubusercontent.com/dijia702/sherry-ielts-dictation/release/v1.2.0/public/audio",
      ),
    ).toBe(
      "https://raw.githubusercontent.com/dijia702/sherry-ielts-dictation/release/v1.2.0/public/audio/jian21/sea.mp3",
    );
  });
});
