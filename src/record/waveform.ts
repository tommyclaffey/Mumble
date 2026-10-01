/**
 * Peaks for a recording made in this browser — decoded with Web Audio at save
 * time, the same 160 RMS slices the demo files get from ffmpeg. If the browser
 * can't decode its own recording, there's simply no waveform (the plain track
 * shows instead); the save never fails over a picture.
 */
export async function peaksFromBlob(blob: Blob, buckets = 160): Promise<number[] | undefined> {
  const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  if (!Ctx) return undefined;
  try {
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    void ctx.close();
    const data = audio.getChannelData(0);
    const size = Math.max(1, Math.floor(data.length / buckets));
    const rms: number[] = [];
    for (let b = 0; b < buckets; b++) {
      let sum = 0;
      for (let i = b * size; i < Math.min((b + 1) * size, data.length); i++) sum += data[i] * data[i];
      rms.push(Math.sqrt(sum / size));
    }
    const max = Math.max(...rms) || 1;
    return rms.map((v) => Math.round((v / max) * 100) / 100);
  } catch {
    return undefined;
  }
}
