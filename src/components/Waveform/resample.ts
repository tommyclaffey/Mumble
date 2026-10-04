/** Average the peaks down (or stretch them up) to exactly `n` bars. */
export function resample(peaks: number[], n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const from = (i / n) * peaks.length, to = ((i + 1) / n) * peaks.length;
    let sum = 0, count = 0;
    for (let j = Math.floor(from); j < Math.max(Math.ceil(to), Math.floor(from) + 1) && j < peaks.length; j++) { sum += peaks[j]; count++; }
    out.push(count ? sum / count : 0);
  }
  return out;
}
