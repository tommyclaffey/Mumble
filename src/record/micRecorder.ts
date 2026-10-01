/**
 * The microphone, recorded — alongside the live transcription.
 *
 * The transcript comes from SpeechRecognition; the RECORDING comes from here.
 * They run together and pause together, so a line's start time (taken from
 * the recording timer) lands where that line is in the audio.
 *
 * If the browser won't record (no MediaRecorder, or the mic is refused), the
 * capture is still saved as a transcript and says it has no audio — the
 * words aren't lost because the audio couldn't be kept.
 */

export interface MicRecorder {
  readonly available: boolean;
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  /** Stops and hands back the recording (undefined if nothing was recorded). */
  stop(): Promise<Blob | undefined>;
}

export function browserMicRecorder(): MicRecorder {
  const ok = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  if (!ok) return unavailableMic();

  let rec: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  const parts: Blob[] = [];

  return {
    available: true,
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      /* Chrome/Firefox record webm/opus; Safari records mp4/aac. Let the
         browser pick what it can play back itself. */
      rec = new MediaRecorder(stream);
      parts.length = 0;
      rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      rec.start(1000);
    },
    pause() { if (rec?.state === 'recording') rec.pause(); },
    resume() { if (rec?.state === 'paused') rec.resume(); },
    stop() {
      return new Promise((resolve) => {
        if (!rec || rec.state === 'inactive') { resolve(undefined); return; }
        const r = rec;
        r.onstop = () => {
          /* Release the mic — otherwise the browser's recording light stays on. */
          stream?.getTracks().forEach((t) => t.stop());
          resolve(parts.length ? new Blob(parts, { type: r.mimeType || parts[0].type }) : undefined);
        };
        r.stop();
      });
    },
  };
}

export function unavailableMic(): MicRecorder {
  return { available: false, start: async () => {}, pause() {}, resume() {}, stop: async () => undefined };
}
