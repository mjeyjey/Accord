export const LITE =
  matchMedia("(prefers-reduced-motion: reduce)").matches ||
  (navigator.hardwareConcurrency || 8) <= 4 ||
  (navigator.deviceMemory || 8) <= 4;
