export default function PeriodTabs({ groups, value, onChange }) {
  if (groups.length < 2) return null;
  return (
    <div className="tabs">
      <button className={!value ? "on" : ""} onClick={() => onChange("")}>
        All periods
      </button>
      {groups.map((g) => (
        <button
          key={g.key}
          className={value === g.key ? "on" : ""}
          onClick={() => onChange(g.key)}
        >
          {g.period?.name || "Other"}
        </button>
      ))}
    </div>
  );
}
