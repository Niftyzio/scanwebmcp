const DIMENSIONS = [
  { score: "d1", code: "D1", label: "legibility" },
  { score: "d2", code: "D2", label: "answerability" },
  { score: "d3", code: "D3", label: "callability" },
  { score: "d4", code: "D4", label: "transactability" },
  { score: "d5", code: "D5", label: "standing" },
] as const;

export function weakestReportDimension(scores: Record<string, number>) {
  return DIMENSIONS.reduce((weakest, candidate) =>
    Number(scores[candidate.score]) < Number(scores[weakest.score]) ? candidate : weakest,
  );
}

export function selectReportEvidence<T extends { dimension: string; key: string }>(options: {
  scores: Record<string, number>;
  signals: T[];
  signalKey?: unknown;
  dimension?: unknown;
}): { ok: true; focus: string; signals: T[] } | { ok: false; message: string } {
  if (typeof options.signalKey === "string" && options.signalKey) {
    const signal = options.signals.find((candidate) => candidate.key === options.signalKey);
    return signal
      ? { ok: true, focus: signal.dimension.toUpperCase(), signals: [signal] }
      : { ok: false, message: `No signal named ${options.signalKey} in this scan.` };
  }

  const requestedDimension = typeof options.dimension === "string"
    ? options.dimension.toUpperCase()
    : undefined;
  if (requestedDimension && !/^D[1-5]$/.test(requestedDimension)) {
    return { ok: false, message: "Dimension must be D1, D2, D3, D4 or D5." };
  }

  const focus = requestedDimension ?? weakestReportDimension(options.scores).code;
  const signals = options.signals.filter((signal) => signal.dimension.toUpperCase() === focus);
  return signals.length > 0
    ? { ok: true, focus, signals }
    : { ok: false, message: `No ${focus} evidence was stored in this scan.` };
}
