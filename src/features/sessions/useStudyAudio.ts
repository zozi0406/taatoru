import { useAudioPlayer } from 'expo-audio';

/** Keep the player independent of the next subject so audio can finish after advancing. */
export function useStudyAudio(onPlayAudio?: (url: string) => void) {
  const player = useAudioPlayer(null);
  return (url: string) => {
    try {
      if (onPlayAudio !== undefined) {
        onPlayAudio(url);
        return;
      }
      player.replace(url);
      player.play();
    } catch {
      // Audio availability must never turn a persisted answer into a failed grade.
    }
  };
}
