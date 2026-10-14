export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading…</span>
      <div className="glass card" style={{ height: 72, opacity: 0.6 }} />
      <div className="grid-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass card" style={{ height: 96, opacity: 0.5 }} />
        ))}
      </div>
      <div className="glass card" style={{ height: 260, opacity: 0.4 }} />
    </div>
  );
}
