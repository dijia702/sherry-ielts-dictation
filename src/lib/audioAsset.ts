const configuredAudioBase = import.meta.env.VITE_AUDIO_BASE_URL?.trim();

export function resolveAudioAssetUrl(
  src: string,
  documentBase: string,
  audioBase = configuredAudioBase,
): string {
  if (!audioBase || !src.startsWith("audio/")) {
    return new URL(src, documentBase).href;
  }

  const normalizedBase = audioBase.endsWith("/") ? audioBase : `${audioBase}/`;
  return new URL(src.slice("audio/".length), normalizedBase).href;
}
