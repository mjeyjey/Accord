import { useState } from "react";
export default function RowMenu({ items, disabled = false }) {
  const [pos, setPos] = useState(null);
  const open = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    setPos(
      r.bottom + 100 > window.innerHeight
        ? { bottom: window.innerHeight - r.top + 4, right }
        : { top: r.bottom + 4, right },
    );
  };
  return (
    <>
      <button
        type="button"
        className="ghost sm dots"
        aria-label="Row actions"
        disabled={disabled}
        onClick={open}
      >
        ⋮
      </button>
      {pos && (
        <>
          <div className="menu-back" onClick={() => setPos(null)} />
          <div className="menu-list fixed" style={pos}>
            {items.map((i) => (
              <button
                type="button"
                key={i.label}
                className={`ghost sm ${i.danger ? "red" : ""}`}
                disabled={disabled}
                onClick={() => {
                  setPos(null);
                  i.onClick();
                }}
              >
                {i.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
