import { useState } from "react";
import Icon from "./icons";
const LABEL = {
  csv: "CSV (spreadsheet)",
  pdf: "PDF (printing)",
  png: "PNG (image)",
};
export default function ExportMenu({
  onExport,
  disabled,
  formats = ["csv", "pdf", "png"],
  label = "Export",
  small = false,
  alt = false,
  up = false,
  iconOnly = false,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async (f) => {
    setOpen(false);
    setBusy(true);
    try {
      await onExport(f);
    } finally {
      setBusy(false);
    }
  };
  return (
    // stopPropagation/preventDefault so the menu also works inside a <summary>
    <div
      className="menu"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        className={`${small ? "sm" : ""} ${alt ? "alt" : ""} ${iconOnly ? "iconbtn" : ""}`}
        disabled={disabled || busy}
        onClick={() => setOpen(!open)}
        title={iconOnly ? label : undefined}
        aria-label={iconOnly ? label : undefined}
      >
        <Icon name="download" size={small ? 14 : 16} />
        {!iconOnly && <>{busy ? "Preparing…" : label} ▾</>}
      </button>
      {open && <div className="menu-back" onClick={() => setOpen(false)} />}
      {open && (
        <div className={`menu-list ${up ? "up" : ""}`}>
          {formats.map((f) => (
            <button key={f} className="ghost sm" onClick={() => go(f)}>
              {LABEL[f]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
