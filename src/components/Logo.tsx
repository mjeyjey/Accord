export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <span className="logomark" style={{ width: size, height: size }}>
      <img src="/logo.png" alt="" />
    </span>
  );
}

export default function Logo({ light = false, size = 40 }: { light?: boolean; size?: number }) {
  return (
    <div className={`logo ${light ? 'light' : ''}`}>
      <LogoMark size={size} />
      <div>
        <div className="logo-name">Accord</div>
        <small>La Concepcion College</small>
      </div>
    </div>
  );
}
