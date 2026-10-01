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
  /** How loud the mic is right now, 0–1 — drives the live meter. Optional:
      without it the meter stays flat rather than pretending. */
  level?(): number;
}

export function browserMicRecorder(): MicRecorder {
  const ok = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  if (!ok) return unavailableMic();

  let rec: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let buf: Float32Array<ArrayBuffer> | null = null;
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
      /* A level meter on the same stream — the live bars are your voice. */
      try {
        ctx = new AudioContext();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        buf = new Float32Array(analyser.fftSize);
      } catch { analyser = null; }
    },
    level() {
      if (!analyser || !buf || rec?.state !== 'recording') return 0;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      return Math.min(1, Math.sqrt(sum / buf.length) * 4);
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
          void ctx?.close();
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
