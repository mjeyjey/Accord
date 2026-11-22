import {
  C,
  W,
  H,
  M,
  FOOT,
  SANS,
  SERIF,
  wrap,
  makePdf,
  save,
  toBlob,
  loadLogo,
} from "./exportSchedule";
const HEAD = 230,
  TH = 54,
  CONT = 100;
const csvEsc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export async function exportTable(o) {
  if (!o.rows.length) throw new Error("There is nothing to export yet.");
  if (o.format === "csv") {
    const cols = o.csvColumns || o.columns;
    const text = [
      cols.map((c) => csvEsc(c.label)).join(","),
      ...o.rows.map((r) => cols.map((c) => csvEsc(c.get(r))).join(",")),
    ].join("\n");
    save(
      new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }),
      `${o.filename}.csv`,
    );
    return;
  }
  await Promise.all([
    document.fonts.load("400 18px Poppins"),
    document.fonts.load("600 18px Poppins"),
    document.fonts.load('700 40px "EB Garamond"'),
  ]).catch(() => {});
  const logo = await loadLogo();
  const mg = document.createElement("canvas").getContext("2d");
  mg.font = `400 18px ${SANS}`;
  const total = W - 2 * M;
  const sum = o.columns.reduce((s, c) => s + c.weight, 0);
  const widths = o.columns.map((c) => (c.weight / sum) * total);
  const xs = widths.map(
    (_, i) => M + widths.slice(0, i).reduce((a, b) => a + b, 0),
  );
  const items = o.rows.map((r) => {
    const cells = o.columns.map((c, i) => {
      const l = wrap(mg, c.get(r) ?? "", widths[i] - 24);
      return l.length > 4 ? [...l.slice(0, 3), l[3] + "…"] : l;
    });
    return { cells, h: Math.max(...cells.map((l) => l.length)) * 26 + 22 };
  });
  const layout = (limit) => {
    const pgs = [[]];
    let y = HEAD + TH;
    for (const it of items) {
      if (y + it.h > limit - FOOT && pgs[pgs.length - 1].length) {
        pgs.push([]);
        y = CONT + TH;
      }
      pgs[pgs.length - 1].push({ ...it, y });
      y += it.h;
    }
    return { pgs, end: y };
  };
  const draw = (list, idx, n, height) => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = height;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, W, height);
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    let top = CONT;
    if (idx === 0) {
      const gr = g.createLinearGradient(0, 0, W, HEAD);
      gr.addColorStop(0, C.navy);
      gr.addColorStop(1, C.blue);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, HEAD);
      g.fillStyle = C.ice;
      g.font = `600 18px ${SANS}`;
      if (logo) g.drawImage(logo, M - 6, 22, 64, 64);
      g.fillText("ACCORD · LA CONCEPCION COLLEGE", M + 66, 60);
      g.fillStyle = "#fff";
      g.font = `700 54px ${SERIF}`;
      g.fillText(o.title, M, 130);
      g.fillStyle = C.ice;
      g.font = `500 22px ${SANS}`;
      g.fillText(o.subtitle || "", M, 180);
      top = HEAD;
    } else {
      g.fillStyle = C.navy;
      g.fillRect(0, 0, W, 76);
      g.fillStyle = "#fff";
      g.font = `700 28px ${SERIF}`;
      g.fillText(`Accord · ${o.title}`, M, 49);
    }
    g.fillStyle = C.deep;
    g.fillRect(M, top, total, TH);
    g.fillStyle = "#fff";
    g.font = `600 16px ${SANS}`;
    o.columns.forEach((col, i) =>
      g.fillText(col.label.toUpperCase(), xs[i] + 12, top + 34),
    );
    list.forEach((it, k) => {
      if (k % 2) {
        g.fillStyle = C.faint;
        g.fillRect(M, it.y, total, it.h);
      }
      g.fillStyle = C.ink;
      g.font = `400 18px ${SANS}`;
      it.cells.forEach((lines, i) =>
        lines.forEach((l, li) =>
          g.fillText(l, xs[i] + 12, it.y + 32 + li * 26),
        ),
      );
      g.fillStyle = C.line;
      g.fillRect(M, it.y + it.h - 1, total, 1);
    });
    g.fillStyle = C.line;
    g.fillRect(M, height - FOOT + 18, total, 2);
    g.fillStyle = C.muted;
    g.font = `400 18px ${SANS}`;
    g.fillText(
      `Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} with Accord`,
      M,
      height - FOOT + 54,
    );
    if (n > 1) {
      g.textAlign = "right";
      g.fillText(`Page ${idx + 1} of ${n}`, W - M, height - FOOT + 54);
    }
    return c;
  };
  if (o.format === "png") {
    const { pgs, end } = layout(Infinity);
    const height = Math.ceil(end + FOOT);
    if (height > 15000)
      throw new Error("Too many rows for one image. Use PDF or CSV instead.");
    save(await toBlob(draw(pgs[0], 0, 1, height)), `${o.filename}.png`);
    return;
  }
  const { pgs } = layout(H);
  const pages = pgs.map((list, i) => {
    const c = draw(list, i, pgs.length, H);
    const bin = atob(c.toDataURL("image/jpeg", 0.92).split(",")[1]);
    const jpeg = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) jpeg[k] = bin.charCodeAt(k);
    return { jpeg, w: W, h: H };
  });
  save(makePdf(pages), `${o.filename}.pdf`);
}
