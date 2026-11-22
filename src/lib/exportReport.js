import {
  C,
  W,
  H,
  M,
  FOOT,
  SANS,
  SERIF,
  rr,
  wrap,
  makePdf,
  save,
  toBlob,
  loadLogo,
} from "./exportSchedule";
import { makeZip } from "./zip";
const CW = W - 2 * M,
  PAD = 30,
  CONT = 110,
  AMBER = "#E0A93B",
  MAX_PNG = 10000;
const hm = (t) => String(t || "").slice(0, 5);
const fit = (g, text, maxW) => {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + "…").width > maxW)
    t = t.slice(0, -1);
  return t + "…";
};
const noData = (g, x, y) => {
  g.textAlign = "left";
  g.fillStyle = C.muted;
  g.font = `400 20px ${SANS}`;
  g.fillText("No data", x, y + 30);
};
function card(mg, title, bodyH, body, insight) {
  mg.font = `500 19px ${SANS}`;
  const lines = insight ? wrap(mg, insight, CW - 2 * PAD - 36) : [];
  const insH = lines.length ? lines.length * 28 + 26 : 0;
  const h = 80 + bodyH + (insH ? insH + 18 : 0) + 24;
  return {
    h: h + 26,
    draw: (g, y) => {
      g.save();
      g.shadowColor = "rgba(10,27,63,.10)";
      g.shadowBlur = 18;
      g.shadowOffsetY = 6;
      rr(g, M, y, CW, h, 24);
      g.fillStyle = "#fff";
      g.fill();
      g.restore();
      rr(g, M, y, CW, h, 24);
      g.strokeStyle = C.line;
      g.lineWidth = 1.5;
      g.stroke();
      g.textAlign = "left";
      g.textBaseline = "alphabetic";
      g.fillStyle = C.navy;
      g.font = `700 30px ${SERIF}`;
      g.fillText(title, M + PAD, y + 52);
      body(g, M + PAD, y + 80, CW - 2 * PAD);
      if (lines.length) {
        const by = y + 80 + bodyH + 18;
        rr(g, M + PAD, by, CW - 2 * PAD, insH, 14);
        g.fillStyle = C.faint;
        g.fill();
        g.fillStyle = C.deep;
        g.font = `500 19px ${SANS}`;
        g.textAlign = "left";
        lines.forEach((l, i) => g.fillText(l, M + PAD + 18, by + 36 + i * 28));
      }
    },
  };
}
const headerOp = (d, logo) => ({
  h: 280,
  draw: (g, y) => {
    const gr = g.createLinearGradient(0, y, W, y + 250);
    gr.addColorStop(0, C.navy);
    gr.addColorStop(1, C.blue);
    g.fillStyle = gr;
    g.fillRect(0, y, W, 250);
    if (logo) g.drawImage(logo, M - 6, y + 30, 70, 70);
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    g.fillStyle = "#fff";
    g.font = `700 32px ${SERIF}`;
    g.fillText("Accord", M + 70, y + 68);
    g.fillStyle = C.ice;
    g.font = `500 15px ${SANS}`;
    g.fillText("LA CONCEPCION COLLEGE", M + 70, y + 92);
    g.fillStyle = "#fff";
    g.font = `700 62px ${SERIF}`;
    g.fillText("Exam Report", M, y + 178);
    g.fillStyle = C.ice;
    g.font = `600 26px ${SANS}`;
    g.fillText(d.period, M, y + 222);
    g.textAlign = "right";
    g.font = `500 22px ${SANS}`;
    g.fillText(d.semester, W - M, y + 178);
    g.fillText(d.range, W - M, y + 222);
    g.textAlign = "left";
  },
});
const kpiOp = (d) => ({
  h: 200,
  draw: (g, y) => {
    const gap = 18,
      w = (CW - gap * 3) / 4;
    d.kpis.forEach(([label, val], i) => {
      const x = M + i * (w + gap);
      rr(g, x, y, w, 150, 22);
      if (i === 0) {
        const gr = g.createLinearGradient(x, y, x + w, y + 150);
        gr.addColorStop(0, C.navy);
        gr.addColorStop(1, C.blue);
        g.fillStyle = gr;
        g.fill();
      } else {
        g.fillStyle = C.faint;
        g.fill();
        g.strokeStyle = C.line;
        g.lineWidth = 1.5;
        g.stroke();
      }
      g.textAlign = "left";
      g.textBaseline = "alphabetic";
      g.fillStyle = i === 0 ? "#fff" : C.navy;
      g.font = `700 56px ${SERIF}`;
      g.fillText(val, x + 24, y + 84);
      g.fillStyle = i === 0 ? C.ice : C.muted;
      g.font = `500 18px ${SANS}`;
      g.fillText(label, x + 24, y + 122);
    });
  },
});
const donutBody = (d) => (g, x, y, w) => {
  const cx = x + 130,
    cy = y + 120,
    r = 92,
    total = d.scheduled + d.unscheduled;
  g.lineWidth = 34;
  g.lineCap = "butt";
  g.strokeStyle = C.line;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  if (total) {
    let a = -Math.PI / 2;
    [
      [d.scheduled, C.blue],
      [d.unscheduled, AMBER],
    ].forEach(([v, c]) => {
      if (!v) return;
      const e = a + (v / total) * Math.PI * 2;
      g.strokeStyle = c;
      g.beginPath();
      g.arc(cx, cy, r, a, e);
      g.stroke();
      a = e;
    });
  }
  g.textAlign = "center";
  g.fillStyle = C.navy;
  g.font = `700 44px ${SERIF}`;
  g.fillText(`${d.rate}%`, cx, cy + 14);
  g.textAlign = "left";
  const items = [
    ["Scheduled", d.scheduled, C.blue],
    ["Unscheduled", d.unscheduled, AMBER],
    ["No proctor yet", d.tba, C.line],
  ];
  items.forEach(([label, v, col], i) => {
    const yy = y + 52 + i * 52;
    rr(g, x + 330, yy - 18, 22, 22, 6);
    g.fillStyle = col;
    g.fill();
    g.fillStyle = C.ink;
    g.font = `500 22px ${SANS}`;
    g.fillText(label, x + 368, yy);
    g.textAlign = "right";
    g.font = `700 22px ${SANS}`;
    g.fillStyle = C.deep;
    g.fillText(String(v), x + w, yy);
    g.textAlign = "left";
  });
};
const areaBody = (d) => (g, x, y, w) => {
  const data = d.perDay;
  if (!data.length) return noData(g, x, y);
  const top = y + 28,
    base = y + 220,
    left = x + 16,
    right = x + w - 16;
  const max = Math.max(1, ...data.map((v) => v[1]));
  const px = (i) =>
    data.length === 1
      ? (left + right) / 2
      : left + (i * (right - left)) / (data.length - 1);
  const py = (v) => base - (v / max) * (base - top);
  g.strokeStyle = C.line;
  g.lineWidth = 1.5;
  g.setLineDash([6, 6]);
  [0, 0.5, 1].forEach((t) => {
    const yy = base - t * (base - top);
    g.beginPath();
    g.moveTo(left, yy);
    g.lineTo(right, yy);
    g.stroke();
  });
  g.setLineDash([]);
  const pts = data.map((v, i) => [px(i), py(v[1])]);
  const line = new Path2D();
  line.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1],
      [x1, y1] = pts[i],
      cx = (x0 + x1) / 2;
    line.bezierCurveTo(cx, y0, cx, y1, x1, y1);
  }
  const area = new Path2D();
  area.addPath(line);
  area.lineTo(pts[pts.length - 1][0], base);
  area.lineTo(pts[0][0], base);
  area.closePath();
  const gr = g.createLinearGradient(0, top, 0, base);
  gr.addColorStop(0, "rgba(26,82,163,.35)");
  gr.addColorStop(1, "rgba(26,82,163,0)");
  g.fillStyle = gr;
  g.fill(area);
  g.strokeStyle = C.blue;
  g.lineWidth = 4;
  g.lineCap = "round";
  g.stroke(line);
  const step = Math.ceil(data.length / 10);
  pts.forEach(([cx, cy], i) => {
    g.beginPath();
    g.arc(cx, cy, 6, 0, Math.PI * 2);
    g.fillStyle = "#fff";
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = C.blue;
    g.stroke();
    g.textAlign = "center";
    if (data.length <= 12) {
      g.fillStyle = C.deep;
      g.font = `700 16px ${SANS}`;
      g.fillText(String(data[i][1]), cx, cy - 14);
    }
    if (i % step === 0) {
      g.fillStyle = C.muted;
      g.font = `400 15px ${SANS}`;
      g.fillText(
        new Date(data[i][0] + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        cx,
        base + 32,
      );
    }
  });
  g.textAlign = "left";
};
function barsCard(mg, title, data, limit, insight) {
  const rows = [...data].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return card(
    mg,
    title,
    rows.length ? rows.length * 40 : 50,
    (g, x, y, w) => {
      if (!rows.length) return noData(g, x, y);
      const lw = 280,
        vw = 64,
        tx = x + lw,
        tw = w - lw - vw;
      rows.forEach(([k, v], i) => {
        const yy = y + i * 40;
        g.textAlign = "left";
        g.font = `500 18px ${SANS}`;
        g.fillStyle = C.ink;
        g.fillText(fit(g, k, lw - 16), x, yy + 24);
        rr(g, tx, yy + 8, tw, 18, 9);
        g.fillStyle = "#E3EDFB";
        g.fill();
        const gr = g.createLinearGradient(tx, 0, tx + tw, 0);
        gr.addColorStop(0, C.blue);
        gr.addColorStop(1, C.teal);
        rr(g, tx, yy + 8, Math.max(18, (v / max) * tw), 18, 9);
        g.fillStyle = gr;
        g.fill();
        g.textAlign = "right";
        g.font = `700 18px ${SANS}`;
        g.fillStyle = C.deep;
        g.fillText(String(v), x + w, yy + 24);
      });
      g.textAlign = "left";
    },
    insight,
  );
}
function tableOps(mg, title, note, cols, rows) {
  const sum = cols.reduce((s, c) => s + c.weight, 0);
  const widths = cols.map((c) => (c.weight / sum) * CW);
  const xs = widths.map(
    (_, i) => M + widths.slice(0, i).reduce((a, b) => a + b, 0),
  );
  const TH = 50;
  const head = {
    h: TH,
    draw: (g, y) => {
      rr(g, M, y, CW, TH, 12);
      g.fillStyle = C.deep;
      g.fill();
      g.fillStyle = "#fff";
      g.font = `600 15px ${SANS}`;
      g.textAlign = "left";
      g.textBaseline = "alphabetic";
      cols.forEach((c, i) =>
        g.fillText(c.label.toUpperCase(), xs[i] + 12, y + 32),
      );
    },
  };
  const titleOp = {
    h: 92,
    keepNext: true,
    draw: (g, y) => {
      g.textAlign = "left";
      g.textBaseline = "alphabetic";
      g.fillStyle = C.navy;
      g.font = `700 36px ${SERIF}`;
      g.fillText(title, M, y + 48);
      g.fillStyle = C.muted;
      g.font = `400 18px ${SANS}`;
      g.fillText(note, M, y + 78);
    },
  };
  mg.font = `400 17px ${SANS}`;
  const items = rows.map((r, k) => {
    const cells = cols.map((c, i) => {
      const l = wrap(mg, c.get(r) ?? "", widths[i] - 24);
      return l.length > 3 ? [...l.slice(0, 2), l[2] + "…"] : l;
    });
    const h = Math.max(...cells.map((l) => l.length)) * 24 + 20;
    return {
      h,
      head,
      draw: (g, y) => {
        if (k % 2) {
          g.fillStyle = C.faint;
          g.fillRect(M, y, CW, h);
        }
        g.fillStyle = C.ink;
        g.font = `400 17px ${SANS}`;
        g.textAlign = "left";
        g.textBaseline = "alphabetic";
        cells.forEach((lines, i) =>
          lines.forEach((l, li) => g.fillText(l, xs[i] + 12, y + 30 + li * 24)),
        );
        g.fillStyle = C.line;
        g.fillRect(M, y + h - 1, CW, 1);
      },
    };
  });
  return [titleOp, { ...head, keepNext: true }, ...items];
}
const deptOp = (dep) => ({
  h: 150,
  keepNext: true,
  pageBreak: true,
  draw: (g, y) => {
    const gr = g.createLinearGradient(M, 0, W - M, 0);
    gr.addColorStop(0, C.navy);
    gr.addColorStop(1, C.blue);
    rr(g, M, y + 10, CW, 120, 24);
    g.fillStyle = gr;
    g.fill();
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillStyle = "#fff";
    g.font = `700 48px ${SERIF}`;
    g.fillText(dep.code, M + 32, y + 72);
    g.fillStyle = C.ice;
    g.font = `500 20px ${SANS}`;
    g.fillText(fit(g, dep.name, 520), M + 32, y + 104);
    const stats = [
      ["Sections", dep.sections],
      ["Exam hours", dep.scheduled],
      ["Unscheduled", dep.unscheduled],
    ];
    stats.forEach(([label, v], i) => {
      const x = W - M - 32 - (2 - i) * 150;
      g.textAlign = "right";
      g.fillStyle = "#fff";
      g.font = `700 42px ${SERIF}`;
      g.fillText(String(v), x, y + 72);
      g.fillStyle = C.ice;
      g.font = `500 16px ${SANS}`;
      g.fillText(label, x, y + 100);
    });
    g.textAlign = "left";
  },
});
function paginate(ops, limit) {
  const pages = [[]];
  const ends = [];
  let y = 0;
  const bottom = limit - FOOT;
  for (let i = 0; i < ops.length; i++) {
    let need = ops[i].h,
      j = i;
    while (ops[j].keepNext && ops[j + 1]) {
      need += ops[j + 1].h;
      j++;
    }
    if (
      (y + need > bottom || ops[i].pageBreak) &&
      pages[pages.length - 1].length
    ) {
      ends.push(y);
      pages.push([]);
      y = CONT;
      if (ops[i].head) {
        pages[pages.length - 1].push({ op: ops[i].head, y });
        y += ops[i].head.h;
      }
    }
    pages[pages.length - 1].push({ op: ops[i], y });
    y += ops[i].h;
  }
  ends.push(y);
  return { pages, ends };
}
function render(items, idx, total, height, period) {
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
    g.fillText(`Accord · Exam report · ${period}`, M, 49);
  }
  g.fillStyle = C.line;
  g.fillRect(M, height - FOOT + 18, W - 2 * M, 2);
  g.fillStyle = C.muted;
  g.font = `400 18px ${SANS}`;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText(
    `Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} with Accord`,
    M,
    height - FOOT + 54,
  );
  if (total > 1) {
    g.textAlign = "right";
    g.fillText(`Page ${idx + 1} of ${total}`, W - M, height - FOOT + 54);
    g.textAlign = "left";
  }
  return c;
}
const SCHED_COLS = [
  { label: "Date", weight: 1.4, get: (x) => x.exam_date },
  {
    label: "Time",
    weight: 1.5,
    get: (x) => `${hm(x.start_time)}-${hm(x.end_time)}`,
  },
  {
    label: "Section",
    weight: 1.6,
    get: (x) => `${x.program?.code} ${x.section?.year_level}${x.section?.name}`,
  },
  {
    label: "Subject",
    weight: 4,
    get: (x) => `${x.subject?.code} - ${x.subject?.title}`,
  },
  { label: "Room", weight: 1.2, get: (x) => x.room?.name || "" },
  {
    label: "Proctor",
    weight: 2,
    get: (x) => x.proctor?.full_name || "To be announced",
  },
];
const BAD_COLS = [
  { label: "Program", weight: 1.2, get: (x) => x.program?.code || "" },
  {
    label: "Section",
    weight: 1.5,
    get: (x) => `Y${x.section?.year_level} ${x.section?.name}`,
  },
  { label: "Subject", weight: 1.6, get: (x) => x.subject?.code || "" },
  { label: "Reason", weight: 5, get: (x) => x.reason || "" },
];
export async function exportReport(d, format, filename) {
  if (!d.rows.length) throw new Error("There is nothing to export yet.");
  await Promise.all([
    document.fonts.load("400 18px Poppins"),
    document.fonts.load("600 18px Poppins"),
    document.fonts.load('700 40px "EB Garamond"'),
  ]).catch(() => {});
  const logo = await loadLogo();
  const mg = document.createElement("canvas").getContext("2d");
  const ops = [
    headerOp(d, logo),
    kpiOp(d),
    card(
      mg,
      "Placement rate",
      240,
      donutBody(d),
      `${d.scheduled} of ${d.scheduled + d.unscheduled} exam hours were placed (${d.rate}%).` +
        (d.tba ? ` ${d.tba} of them still have no proctor.` : ""),
    ),
    card(mg, "Exams per day", 280, areaBody(d), d.insights.day),
    barsCard(
      mg,
      "Proctor workload (top 12)",
      d.perProctor,
      12,
      d.insights.proctor,
    ),
    barsCard(mg, "Room usage (top 12)", d.perRoom, 12, d.insights.room),
    barsCard(
      mg,
      "Exams per program (top 15)",
      d.perProgram,
      15,
      d.insights.program,
    ),
  ];
  for (const dep of d.depts) {
    ops.push(deptOp(dep));
    if (dep.perProgram.length > 1)
      ops.push(
        barsCard(mg, `${dep.code}: exams per program`, dep.perProgram, 12, ""),
      );
    if (dep.rows.length)
      ops.push(
        ...tableOps(
          mg,
          `${dep.code} · Exam schedule`,
          `${dep.rows.length} exam hours`,
          SCHED_COLS,
          dep.rows,
        ),
      );
    if (dep.bad.length)
      ops.push(
        ...tableOps(
          mg,
          `${dep.code} · Not placed (${dep.bad.length})`,
          "These could not be placed. Fix the reason, then regenerate.",
          BAD_COLS,
          dep.bad,
        ),
      );
  }
  if (format === "png") {
    const { pages, ends } = paginate(ops, MAX_PNG);
    const files = [];
    for (let i = 0; i < pages.length; i++) {
      const blob = await toBlob(
        render(pages[i], i, pages.length, Math.ceil(ends[i] + FOOT), d.period),
      );
      files.push({
        name: `${filename}_part${i + 1}.png`,
        data: new Uint8Array(await blob.arrayBuffer()),
      });
    }
    if (files.length === 1)
      save(new Blob([files[0].data], { type: "image/png" }), `${filename}.png`);
    else save(makeZip(files), `${filename}.zip`);
    return;
  }
  const { pages } = paginate(ops, H);
  const out = pages.map((items, i) => {
    const c = render(items, i, pages.length, H, d.period);
    const bin = atob(c.toDataURL("image/jpeg", 0.92).split(",")[1]);
    const jpeg = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) jpeg[k] = bin.charCodeAt(k);
    return { jpeg, w: W, h: H };
  });
  save(makePdf(out), `${filename}.pdf`);
}
