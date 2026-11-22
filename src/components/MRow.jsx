import { useRef } from "react";

// Compact phone row: tap = details, hold = quick action.
export default function MRow({ title, sub, meta, danger, onTap, onHold }) {
  const timer = useRef();
  const fired = useRef(false);
  const pos = useRef([0, 0]);
  const lp = {
    onTouchStart: (e) => {
      fired.current = false;
      pos.current = [e.touches[0].clientX, e.touches[0].clientY];
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(15);
        onHold?.();
      }, 450);
    },
    onTouchMove: (e) => {
      const [x, y] = pos.current;
      if (Math.abs(e.touches[0].clientX - x) > 8 || Math.abs(e.touches[0].clientY - y) > 8)
        clearTimeout(timer.current);
    },
    onTouchEnd: () => clearTimeout(timer.current),
    onTouchCancel: () => clearTimeout(timer.current),
    onClick: () => {
      if (fired.current) { fired.current = false; return; }
      onTap?.();
    },
    onContextMenu: (e) => e.preventDefault(),
  };
  return (
    <div className={`mrow ${danger ? "danger" : ""}`} {...lp}>
      <div className="mmain">
        <div className="mtitle">{title}</div>
        {sub && <small>{sub}</small>}
      </div>
      {meta && <span className="mmeta">{meta}</span>}
      <span className="mchev">›</span>
    </div>
  );
}
