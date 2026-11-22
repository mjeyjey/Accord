const YEAR = {
  first: 1,
  "1st": 1,
  second: 2,
  "2nd": 2,
  third: 3,
  "3rd": 3,
  fourth: 4,
  "4th": 4,
  fifth: 5,
  "5th": 5,
};
const YEAR_RE =
  /\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+year\b/i;
// Never imported: bridging programs.
const DROP = /bridging/i;
// Imported but unticked by default: no written exam.
const OPTIONAL =
  /(internship|practicum|on[- ]the[- ]job|\bojt\b|course audit)/i;
const NOISE = /^(code\b.*\btitle|total\b|\*|approval|name:)/i;
const CODE_RE =
  /^([A-Z][A-Za-z.\-]{0,9}(?:\s?\d{1,3}[A-Z]?(?:\.\d)?)?)(?:\s+(.*))?$/;
const UNITS_RE = /\s+(?:\(\d{1,2}\)|\d{1,2})$/;
const isCode = (c) => /\d/.test(c) || /^[A-Z][A-Z\-.]{2,}$/.test(c);
// Reads every page as two columns (left / right tables) and returns the text lines of each column, top to bottom, with their y position.
export async function readPdfColumns(file) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() })
    .promise;
  const streams = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pg = await pdf.getPage(p);
    const mid = pg.getViewport({ scale: 1 }).width / 2;
    const items = (await pg.getTextContent()).items;
    for (const side of [0, 1]) {
      const rows = [];
      for (const it of items) {
        if (!it.str?.trim()) continue;
        const x = it.transform[4],
          y = it.transform[5];
        if ((x >= mid ? 1 : 0) !== side) continue;
        // Tight tolerance: a code that is vertically centred in a two-line title must stay on its own row.
        let r = rows.find((q) => Math.abs(q.y - y) < 2);
        if (!r) rows.push((r = { y, parts: [] }));
        r.parts.push({ x, s: it.str.trim() });
      }
      rows.sort((a, b) => b.y - a.y);
      streams.push(
        rows
          .map((r) => ({
            y: r.y,
            text: r.parts
              .sort((a, b) => a.x - b.x)
              .map((q) => q.s)
              .join(" ")
              .replace(/\s+/g, " ")
              .trim(),
          }))
          .filter((l) => l.text),
      );
    }
  }
  return streams;
}
export function parseCurriculum(streams) {
  const out = new Map();
  for (const lines of streams) {
    const blocks = [];
    let year = 0,
      sem = 0;
    let cur = null;
    for (const raw of lines) {
      // "F. LANG 1" -> "F.LANG 1"
      const line = raw.text
        .replace(/^([A-Z])\.\s+(?=[A-Z])/, "$1.")
        .replace(/\s+/g, " ")
        .trim();
      if (!line || /^\d+$/.test(line) || /^\(\d+\)$/.test(line)) continue;
      const h = line.match(YEAR_RE);
      if (h) {
        year = YEAR[h[1].toLowerCase()];
        sem = /summer|mid-?year/i.test(line)
          ? 3
          : /\b(first|1st)\s+sem/i.test(line)
            ? 1
            : /\b(second|2nd)\s+sem/i.test(line)
              ? 2
              : 0;
        cur = null;
        continue;
      }
      if (NOISE.test(line)) {
        cur = null;
        continue;
      }
      if (!year || !sem) continue;
      if (!cur) {
        cur = { year, sem, anchors: [], texts: [] };
        blocks.push(cur);
      }
      const m = line.match(CODE_RE);
      const code = m?.[1].trim() ?? "";
      if (m && isCode(code)) {
        const withUnits = " " + (m[2] ?? "").trim();
        const units = UNITS_RE.test(withUnits);
        cur.anchors.push({
          code,
          units,
          lines: [{ y: raw.y, t: withUnits.replace(UNITS_RE, "").trim() }],
        });
      } else {
        cur.texts.push({ y: raw.y, t: line });
      }
    }
    for (const b of blocks) {
      if (!b.anchors.length) continue;
      // A title line belongs to the code row closest to it. Titles are centred on their code row,
      // so this joins the lines above and below the code (or the lines below a top-aligned code).
      for (const t of b.texts) {
        let best = b.anchors[0];
        for (const a of b.anchors)
          if (Math.abs(a.lines[0].y - t.y) < Math.abs(best.lines[0].y - t.y))
            best = a;
        best.lines.push(t);
      }
      for (const a of b.anchors) {
        const ls = [...a.lines].sort((p, q) => q.y - p.y);
        if (!a.units && ls.length > 1)
          ls[ls.length - 1] = {
            ...ls[ls.length - 1],
            t: ls[ls.length - 1].t.replace(UNITS_RE, ""),
          };
        const title = ls
          .map((l) => l.t)
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (!title || DROP.test(title) || /^BP\s*[12]$/i.test(a.code)) continue;
        out.set(`${b.year}|${b.sem}|${a.code}`, {
          year_level: b.year,
          semester: b.sem,
          code: a.code,
          title,
          ...(OPTIONAL.test(title) ? { optional: true } : {}),
        });
      }
    }
  }
  return [...out.values()];
}
