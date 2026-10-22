import type { RandomSource } from "./types";

/**
 * Mulberry32: a tiny, fast 32-bit seeded PRNG. Not cryptographic — only used
 * so a given seed always produces the same sequence of simulated outcomes.
 */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a RandomSource that replays the given values in order, then repeats the last one. Handy in tests. */
export function createSequenceRandom(values: readonly number[]): RandomSource {
  if (values.length === 0) throw new Error("createSequenceRandom needs at least one value");
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)]!;
    index += 1;
    return value;
  };
}
