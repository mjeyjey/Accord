export const slicePage = (rows, page, size) => {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  return rows.slice((cur - 1) * size, cur * size);
};
export default function Pager({ total, page, size, onPage, onSize }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = Math.min(page, pages);
  const from = total ? (cur - 1) * size + 1 : 0;
  const to = Math.min(total, cur * size);
  return (
    <div className="pager">
      <span className="muted">
        {from}-{to} of {total}
      </span>
      <span style={{ flex: 1 }} />
      <select
        value={size}
        onChange={(e) => {
          onSize(Number(e.target.value));
          onPage(1);
        }}
      >
        {[10, 25, 50, 100].map((n) => (
          <option key={n} value={n}>
            {n} per page
          </option>
        ))}
      </select>
      <button
        className="ghost sm"
        disabled={cur <= 1}
        onClick={() => onPage(cur - 1)}
      >
        ‹ Prev
      </button>
      <span className="muted">
        Page {cur} of {pages}
      </span>
      <button
        className="ghost sm"
        disabled={cur >= pages}
        onClick={() => onPage(cur + 1)}
      >
        Next ›
      </button>
    </div>
  );
}
