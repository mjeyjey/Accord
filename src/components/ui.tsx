import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Icon, { IconName } from "./icons";

type Kind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
}
interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  icon?: IconName;
}
interface PromptOpts {
  title: string;
  message?: string;
  label: string;
  placeholder?: string;
  confirmLabel?: string;
  required?: boolean;
}
interface Ui {
  toast: {
    success: (t: string) => void;
    error: (t: string) => void;
    info: (t: string) => void;
  };
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  prompt: (o: PromptOpts) => Promise<string | null>;
}

const Ctx = createContext<Ui>(null as unknown as Ui);
export const useUi = () => useContext(Ctx);

export function useLock() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const guard = useCallback(
    <A extends unknown[], R>(fn: (...args: A) => Promise<R> | R) =>
      async (...args: A): Promise<R | undefined> => {
        if (locked.current) return undefined;
        locked.current = true;
        setBusy(true);
        try {
          return await fn(...args);
        } finally {
          locked.current = false;
          setBusy(false);
        }
      },
    [],
  );
  return [busy, guard] as const;
}

export const initials = (n = "") =>
  n
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase() || "?";

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
  center,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  center?: boolean;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""} ${center ? "center" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h3>{title}</h3>
          <button
            type="button"
            className="x"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="mbody">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className={error ? "has-err" : ""}>
      <span>{label}</span>
      {children}
      {error && <small className="ferr">{error}</small>}
    </label>
  );
}

export const Skeleton = ({
  h = 14,
  w = "100%",
}: {
  h?: number;
  w?: number | string;
}) => <span className="skel" style={{ height: h, width: w }} />;

export function TableSkeleton({
  rows = 6,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="tskel">
      {Array.from({ length: rows }, (_, i) => (
        <div
          className="tskel-row"
          key={i}
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }, (_, j) => (
            <Skeleton key={j} h={14} w={j === 0 ? "70%" : "90%"} />
          ))}
        </div>
      ))}
    </div>
  );
}

export const Badge = ({
  tone = "blue",
  children,
}: {
  tone?: "blue" | "green" | "amber" | "red" | "gray";
  children: ReactNode;
}) => <span className={`badge ${tone}`}>{children}</span>;

// Small "?" circle that shows an explanation on hover or keyboard focus.
export const Help = ({ text, align = "left" }: { text: string; align?: "left" | "right" }) => (
  <span className={`help ${align}`} tabIndex={0} aria-label={text}>
    ?<span className="tip" role="tooltip">{text}</span>
  </span>
);

export const Avatar = ({ name, src }: { name?: string; src?: string | null }) =>
  src ? <img className="avatar" src={src} alt="" /> : <span className="avatar">{initials(name)}</span>;

type Dlg =
  | { kind: "confirm"; o: ConfirmOpts; done: (v: boolean) => void }
  | { kind: "prompt"; o: PromptOpts; done: (v: string | null) => void };

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [val, setVal] = useState("");
  const [verr, setVerr] = useState("");
  const n = useRef(0);

  const push = useCallback((kind: Kind, text: string) => {
    const id = ++n.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const ui = useMemo<Ui>(
    () => ({
      toast: {
        success: (t) => push("success", t),
        error: (t) => push("error", t),
        info: (t) => push("info", t),
      },
      confirm: (o) =>
        new Promise<boolean>((done) => setDlg({ kind: "confirm", o, done })),
      prompt: (o) =>
        new Promise<string | null>((done) => {
          setVal("");
          setVerr("");
          setDlg({ kind: "prompt", o, done });
        }),
    }),
    [push],
  );

  const closeConfirm = (v: boolean) => {
    if (dlg?.kind === "confirm") dlg.done(v);
    setDlg(null);
  };
  const closePrompt = (v: string | null) => {
    if (dlg?.kind === "prompt") dlg.done(v);
    setDlg(null);
  };
  const submitPrompt = () => {
    if (dlg?.kind !== "prompt") return;
    if (dlg.o.required && !val.trim()) {
      setVerr("This field is required");
      return;
    }
    closePrompt(val.trim());
  };

  return (
    <Ctx.Provider value={ui}>
      {children}

      {dlg?.kind === "confirm" && (
        <Modal
          center={!!dlg.o.icon}
          title={dlg.o.title}
          onClose={() => closeConfirm(false)}
          footer={
            <>
              <button className="ghost" onClick={() => closeConfirm(false)}>
                Cancel
              </button>
              <button
                className={dlg.o.danger ? "danger" : ""}
                autoFocus
                onClick={() => closeConfirm(true)}
              >
                {dlg.o.confirmLabel || "Confirm"}
              </button>
            </>
          }
        >
          {dlg.o.icon && <span className={`dlgicon ${dlg.o.danger ? "bad" : ""}`}><Icon name={dlg.o.icon} size={30} /></span>}
          {dlg.o.message && <p className="dlgtext">{dlg.o.message}</p>}
        </Modal>
      )}

      {dlg?.kind === "prompt" && (
        <Modal
          title={dlg.o.title}
          onClose={() => closePrompt(null)}
          footer={
            <>
              <button className="ghost" onClick={() => closePrompt(null)}>
                Cancel
              </button>
              <button onClick={submitPrompt}>
                {dlg.o.confirmLabel || "Submit"}
              </button>
            </>
          }
        >
          {dlg.o.message && <p className="dlgtext">{dlg.o.message}</p>}
          <Field label={dlg.o.label} error={verr}>
            <textarea
              rows={3}
              autoFocus
              placeholder={dlg.o.placeholder}
              value={val}
              onChange={(e) => {
                setVal(e.target.value);
                setVerr("");
              }}
            />
          </Field>
        </Modal>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.text}</span>
            <button
              type="button"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
