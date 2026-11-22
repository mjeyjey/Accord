import { floorLabel } from "./api";
import { makeZip } from "./zip";
export const C = {
  navy: "#0A1B3F",
  deep: "#11306E",
  blue: "#1A52A3",
  teal: "#4A8FE0",
  ice: "#BFD7F7",
  faint: "#F4F8FE",
  ink: "#0E2142",
  muted: "#5B6F8C",
  line: "#D5E0F0",
};
export const W = 1240,
  H = 1754,
  M = 64,
  FOOT = 96,
  CONT = 110; // A4 at 150 dpi
export const SANS = `Poppins, 'Helvetica Neue', Helvetica, Arial, sans-serif`;
export const SERIF = `'EB Garamond', Garamond, Georgia, serif`;
const TX = M + 470,
  TW = W - M - 24 - TX;
let LOGO = null;
export const loadLogo = () =>
  new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = "/logo.png";
  });
const hhmm = (t) => String(t || "").slice(0, 5);
const clock = (t) => {
  const [h, m] = hhmm(t).split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const longDate = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
const shortDate = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
export function wrap(g, text, maxW) {
  const out = [];
  let cur = "";
  for (const w of text.split(" ")) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > maxW && cur) {
      out.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}
function build(rows, meta) {
  const mg = document.createElement("canvas").getContext("2d");
  const ops = [];
  const dates = [...new Set(rows.map((r) => r.exam_date))].sort();
  const range = !dates.length
    ? ""
    : dates[0] === dates[dates.length - 1]
      ? shortDate(dates[0])
      : `${shortDate(dates[0])} to ${shortDate(dates[dates.length - 1])}`;
  // Header
  ops.push({
    h: 270,
    draw: (g, y) => {
      const gr = g.createLinearGradient(0, y, W, y + 270);
      gr.addColorStop(0, C.navy);
      gr.addColorStop(1, C.blue);
      g.fillStyle = gr;
      g.fillRect(0, y, W, 270);
      if (LOGO) g.drawImage(LOGO, M - 6, y + 34, 76, 76);
      g.textBaseline = "alphabetic";
      g.textAlign = "left";
      g.fillStyle = "#fff";
      g.font = `700 34px ${SERIF}`;
      g.fillText("Accord", M + 72, y + 74);
      g.fillStyle = C.ice;
      g.font = `500 16px ${SANS}`;
      g.fillText("LA CONCEPCION COLLEGE", M + 72, y + 98);
      g.fillStyle = "#fff";
      g.font = `700 64px ${SERIF}`;
      g.fillText("Exam Schedule", M, y + 192);
      g.fillStyle = C.ice;
      g.font = `600 28px ${SANS}`;
      g.fillText(
        meta.subtitle ?? `${meta.program} · Year ${meta.year}`,
        M,
        y + 236,
      );
      g.textAlign = "right";
      g.fillStyle = "#fff";
      g.font = `600 24px ${SANS}`;
      g.fillText(meta.period, W - M, y + 192);
      g.fillStyle = C.ice;
      g.font = `400 22px ${SANS}`;
      g.fillText(range, W - M, y + 236);
      g.textAlign = "left";
    },
  });
  // How to read
  mg.font = `500 20px ${SANS}`;
  const help = wrap(
    mg,
    "How to read this: find your section below, then your day. The blue bar shows the day, the room and the floor. Your subjects and times are listed under it.",
    W - 2 * M - 56,
  );
  const boxH = help.length * 30 + 34;
  ops.push({
    h: boxH + 44,
    draw: (g, y) => {
      rr(g, M, y + 22, W - 2 * M, boxH, 18);
      g.fillStyle = C.faint;
      g.fill();
      g.strokeStyle = C.line;
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = C.deep;
      g.font = `500 20px ${SANS}`;
      g.textAlign = "left";
      g.textBaseline = "alphabetic";
      help.forEach((l, i) => g.fillText(l, M + 28, y + 22 + 40 + i * 30));
    },
  });
  // Sections
  const bySec = {};
  rows.forEach((r) => {
    (bySec[r.section_id] ||= []).push(r);
  });
  const skey = (r) =>
    `${r.program?.code}|${r.section?.year_level}|${r.section?.name}`;
  const secList = Object.values(bySec).sort((a, b) =>
    skey(a[0]).localeCompare(skey(b[0]), undefined, { numeric: true }),
  );
  let lastProg = "";
  for (const list of secList) {
    const f = list[0];
    const progCode = f.program?.code || "";
    if (meta.headings && progCode !== lastProg) {
      lastProg = progCode;
      ops.push({
        h: 112,
        keepNext: true,
        draw: (g, y) => {
          const gr = g.createLinearGradient(M, 0, W - M, 0);
          gr.addColorStop(0, C.navy);
          gr.addColorStop(1, C.deep);
          rr(g, M, y + 20, W - 2 * M, 76, 18);
          g.fillStyle = gr;
          g.fill();
          g.fillStyle = "#fff";
          g.font = `700 44px ${SERIF}`;
          g.textAlign = "left";
          g.textBaseline = "alphabetic";
          g.fillText(progCode, M + 30, y + 72);
        },
      });
    }
    const label = `${f.program?.code ?? meta.program} ${f.section?.year_level ?? meta.year}${f.section?.name ?? ""}`;
    const students = f.section?.student_count;
    ops.push({
      h: 96,
      keepNext: true,
      draw: (g, y) => {
        rr(g, M, y + 28, 8, 48, 4);
        g.fillStyle = C.teal;
        g.fill();
        g.textAlign = "left";
        g.textBaseline = "alphabetic";
        g.fillStyle = C.navy;
        g.font = `700 42px ${SERIF}`;
        g.fillText(label, M + 26, y + 64);
        if (students) {
          g.textAlign = "right";
          g.fillStyle = C.muted;
          g.font = `500 20px ${SANS}`;
          g.fillText(`${students} students`, W - M, y + 62);
          g.textAlign = "left";
        }
      },
    });
    const batches = {};
    list.forEach((r) => {
      (batches[`${r.exam_date}|${r.room_id}`] ||= []).push(r);
    });
    const bl = Object.values(batches).sort((a, b) =>
      (a[0].exam_date + hhmm(a[0].start_time)).localeCompare(
        b[0].exam_date + hhmm(b[0].start_time),
      ),
    );
    for (const b of bl) {
      b.sort((p, q) => hhmm(p.start_time).localeCompare(hhmm(q.start_time)));
      const room = b[0].room;
      const roomText = room
        ? `Room ${room.name} · ${floorLabel(room.floor)}`
        : "Room to be announced";
      ops.push({
        h: 78,
        keepNext: true,
        draw: (g, y) => {
          const gr = g.createLinearGradient(M, 0, W - M, 0);
          gr.addColorStop(0, C.deep);
          gr.addColorStop(1, C.blue);
          rr(g, M, y + 8, W - 2 * M, 62, 16);
          g.fillStyle = gr;
          g.fill();
          g.textBaseline = "alphabetic";
          g.fillStyle = "#fff";
          g.font = `600 26px ${SANS}`;
          g.textAlign = "left";
          g.fillText(longDate(b[0].exam_date), M + 26, y + 48);
          g.textAlign = "right";
          g.fillStyle = C.ice;
          g.font = `600 24px ${SANS}`;
          g.fillText(roomText, W - M - 26, y + 47);
          g.textAlign = "left";
        },
      });
      for (const r of b) {
        mg.font = `400 21px ${SANS}`;
        const lines = wrap(mg, r.subject?.title || "", TW);
        const h = Math.max(62, lines.length * 30 + 28);
        ops.push({
          h,
          draw: (g, y) => {
            g.textAlign = "left";
            g.textBaseline = "alphabetic";
            g.fillStyle = C.deep;
            g.font = `600 21px ${SANS}`;
            g.fillText(
              `${clock(r.start_time)} – ${clock(r.end_time)}`,
              M + 24,
              y + 38,
            );
            g.fillStyle = C.blue;
            g.fillText(r.subject?.code || "", M + 290, y + 38);
            g.fillStyle = C.ink;
            g.font = `400 21px ${SANS}`;
            lines.forEach((l, i) => g.fillText(l, TX, y + 38 + i * 30));
            g.fillStyle = C.line;
            g.fillRect(M, y + h - 1, W - 2 * M, 1);
          },
        });
      }
      ops.push({ h: 22, draw: () => {} });
    }
    ops.push({ h: 24, draw: () => {} });
  }
  return ops;
}
function paginate(ops, limit) {
  const pages = [[]];
  let y = 0;
  const bottom = limit - FOOT;
  for (let i = 0; i < ops.length; i++) {
    let need = ops[i].h,
      j = i;
    while (ops[j].keepNext && ops[j + 1]) {
      need += ops[j + 1].h;
      j++;
    }
    if (y + need > bottom && pages[pages.length - 1].length) {
      pages.push([]);
      y = CONT;
    }
    pages[pages.length - 1].push({ op: ops[i], y });
    y += ops[i].h;
  }
  return { pages, end: y };
}
function render(items, idx, total, height, meta) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = height;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, height);
  items.forEach(({ op, y }) => op.draw(g, y));
  if (idx > 0) {
    g.fillStyle = C.navy;
    g.fillRect(0, 0, W, 76);
    g.fillStyle = "#fff";
    g.font = `700 28px ${SERIF}`;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillText(
      `Accord · ${meta.subtitle ?? `${meta.program} Year ${meta.year}`} · ${meta.period}`,
      M,
      49,
    );
  }
  g.fillStyle = C.line;
  g.fillRect(M, height - FOOT + 18, W - 2 * M, 2);
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  g.fillStyle = C.muted;
  g.font = `400 18px ${SANS}`;
  g.fillText(
    "Schedules may change. Please confirm with your department.",
    M,
    height - FOOT + 54,
  );
  g.fillText(
    `Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} with Accord`,
    M,
    height - FOOT + 80,
  );
  if (total > 1) {
    g.textAlign = "right";
    g.fillText(`Page ${idx + 1} of ${total}`, W - M, height - FOOT + 54);
    g.textAlign = "left";
  }
  return c;
}
export function makePdf(pages) {
  const PW = 595.28,
    PH = 841.89;
  const enc = new TextEncoder();
  const parts = [];
  const offs = [];
  let len = 0;
  const push = (b) => {
    const u = typeof b === "string" ? enc.encode(b) : b;
    parts.push(u);
    len += u.length;
  };
  const start = (n) => {
    offs[n] = len;
    push(`${n} 0 obj\n`);
  };
  push("%PDF-1.4\n");
  start(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  start(2);
  push(
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`,
  );
  pages.forEach((p, i) => {
    const pg = 3 + i * 3,
      ct = pg + 1,
      im = pg + 2;
    start(pg);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>\nendobj\n`,
    );
    const s = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    start(ct);
    push(`<< /Length ${s.length} >>\nstream\n${s}\nendstream\nendobj\n`);
    start(im);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
    );
    push(p.jpeg);
    push("\nendstream\nendobj\n");
  });
  const total = 2 + pages.length * 3;
  const xref = len;
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let n = 1; n <= total; n++)
    push(`${String(offs[n]).padStart(10, "0")} 00000 n \n`);
  push(
    `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
  );
  return new Blob(parts, { type: "application/pdf" });
}
export const save = (blob, name) => {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};
export const toBlob = (c) =>
  new Promise((res, rej) =>
    c.toBlob(
      (b) => (b ? res(b) : rej(new Error("Could not create the image"))),
      "image/png",
    ),
  );
export async function exportYearLevel(rows, meta, format) {
  if (!rows.length)
    throw new Error("There are no scheduled exams to export yet.");
  await Promise.all([
    document.fonts.load(`400 20px Poppins`),
    document.fonts.load(`600 20px Poppins`),
    document.fonts.load(`700 40px "EB Garamond"`),
  ]).catch(() => {});
  LOGO = await loadLogo();
  const ops = build(rows, meta);
  const name = (
    meta.file ?? `ExamSchedule_${meta.program}_Year${meta.year}`
  ).replace(/[^\w-]+/g, "_");
  if (format === "png") {
    const { pages, end } = paginate(ops, Infinity);
    if (end + FOOT > 16000)
      throw new Error("Too long for one image. Use PDF instead.");
    const c = render(pages[0], 0, 1, Math.ceil(end + FOOT), meta);
    save(await toBlob(c), `${name}.png`);
    return;
  }
  const { pages } = paginate(ops, H);
  const out = pages.map((items, i) => {
    const c = render(items, i, pages.length, H, meta);
    const bin = atob(c.toDataURL("image/jpeg", 0.92).split(",")[1]);
    const jpeg = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) jpeg[k] = bin.charCodeAt(k);
    return { jpeg, w: W, h: H };
  });
  save(makePdf(out), `${name}.pdf`);
}
// One PNG per program, bundled in a ZIP (a single program downloads as one PNG).
export async function exportPngPerProgram(rows, meta, zipName) {
  if (!rows.length)
    throw new Error("There are no scheduled exams to export yet.");
  await Promise.all([
    document.fonts.load(`400 20px Poppins`),
    document.fonts.load(`600 20px Poppins`),
    document.fonts.load(`700 40px "EB Garamond"`),
  ]).catch(() => {});
  LOGO = await loadLogo();
  const byProg = {};
  rows.forEach((r) => {
    (byProg[r.program?.code || "Other"] ||= []).push(r);
  });
  const files = [];
  for (const code of Object.keys(byProg).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )) {
    const m = {
      ...meta,
      program: code,
      subtitle: `${code} · all year levels`,
      headings: false,
    };
    const { pages, end } = paginate(build(byProg[code], m), Infinity);
    if (end + FOOT > 16000)
      throw new Error(`${code} is too long for one image. Use PDF instead.`);
    const blob = await toBlob(render(pages[0], 0, 1, Math.ceil(end + FOOT), m));
    files.push({
      name: `${code.replace(/[^\w-]+/g, "_")}.png`,
      data: new Uint8Array(await blob.arrayBuffer()),
    });
  }
  if (files.length === 1)
    save(new Blob([files[0].data], { type: "image/png" }), files[0].name);
  else save(makeZip(files), `${zipName}.zip`);
}
