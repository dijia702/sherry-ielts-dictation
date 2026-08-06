import { useCallback, useEffect, useRef, useState } from "react";
import { resolveAudioAssetUrl } from "../lib/audioAsset";
import type { Accent, QuizQuestion } from "../types";

interface AudioSequenceState {
  isPlaying: boolean;
  activeAccent: Accent | null;
}

const GAP_MS = 250;

export function useAudioSequence(playbackRate: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const runTokenRef = useRef(0);
  const [state, setState] = useState<AudioSequenceState>({ isPlaying: false, activeAccent: null });

  const stop = useCallback(() => {
    runTokenRef.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setState({ isPlaying: false, activeAccent: null });
  }, []);

  const play = useCallback(
    async (question: QuizQuestion) => {
      stop();
      const token = runTokenRef.current;
      setState({ isPlaying: true, activeAccent: question.audioSequence[0]?.accent ?? null });

      for (let index = 0; index < question.audioSequence.length; index += 1) {
        if (token !== runTokenRef.current) return;
        const clip = question.audioSequence[index];
        setState({ isPlaying: true, activeAccent: clip.accent });
        const audio = new Audio(resolveAudioAssetUrl(clip.src, document.baseURI));
        audio.preload = "auto";
        audio.playbackRate = playbackRate;
        audioRef.current = audio;

        try {
          await new Promise<void>((resolve, reject) => {
            audio.addEventListener("ended", () => resolve(), { once: true });
            audio.addEventListener("error", () => reject(new Error(`Audio failed: ${clip.src}`)), {
              once: true,
            });
            void audio.play().catch(reject);
          });
        } catch {
          if (token === runTokenRef.current) {
            setState({ isPlaying: false, activeAccent: null });
          }
          return;
        }

        if (index < question.audioSequence.length - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, GAP_MS));
        }
      }

      if (token === runTokenRef.current) {
        audioRef.current = null;
        setState({ isPlaying: false, activeAccent: null });
      }
    },
    [playbackRate, stop],
  );

  useEffect(() => stop, [stop]);

  return { ...state, play, stop };
}
