import { useEffect, useRef, useState } from "react";

const Chev = ({ flip }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
    style={flip ? { transform: "scaleX(-1)" } : undefined} aria-hidden="true">
    <path d="M9 5l7 7-7 7" />
  </svg>
);

// Tab bar that shows a soft "›" / "‹" when more tabs are hidden off-screen.
export default function TabScroller({ children }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const check = () => {
    const el = ref.current;
    if (!el) return;
    const l = el.scrollLeft > 4;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdge((p) => (p.l === l && p.r === r ? p : { l, r }));
  };
  useEffect(() => {
    const el = ref.current;
    const on = el.querySelector(".on");
    if (on) el.scrollLeft = Math.max(0, on.offsetLeft - 40);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => { ro.disconnect(); window.removeEventListener("resize", check); };
  }, []);
  useEffect(check);
  return (
    <div className="tabswrap">
      <div className="tabs" ref={ref} onScroll={check}>{children}</div>
      <span className={`tabedge l ${edge.l ? "show" : ""}`}><Chev flip /></span>
      <span className={`tabedge r ${edge.r ? "show" : ""}`}><Chev /></span>
    </div>
  );
}
