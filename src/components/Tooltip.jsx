export default function Tooltip({ data, x, y }) {
  if (!data) return null;

  const style = {
    position: "fixed",
    left: x + 16,
    top: y - 10,
    background: "rgba(15, 23, 42, 0.95)",
    color: "#e2e8f0",
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.6,
    pointerEvents: "none",
    zIndex: 1000,
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.1)",
    maxWidth: 320,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  };

  const pFormatted =
    data.pvalue < 1e-10
      ? data.pvalue.toExponential(2)
      : data.pvalue < 0.001
        ? data.pvalue.toExponential(2)
        : data.pvalue.toFixed(4);

  return (
    <div style={style}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: "#93c5fd" }}>
        {data.snpid}
      </div>
      <div>
        <span style={{ color: "#94a3b8" }}>Chr:</span> {data.chr} &nbsp;
        <span style={{ color: "#94a3b8" }}>Pos:</span>{" "}
        {data.bp.toLocaleString()}
      </div>
      <div>
        <span style={{ color: "#94a3b8" }}>P-value:</span> {pFormatted}
      </div>
      <div>
        <span style={{ color: "#94a3b8" }}>-log10(p):</span>{" "}
        {data.negLogP.toFixed(2)}
      </div>
      {data.or != null && (
        <div>
          <span style={{ color: "#94a3b8" }}>OR:</span> {data.or}
        </div>
      )}
      {data.a1 && data.a2 && (
        <div>
          <span style={{ color: "#94a3b8" }}>Alleles:</span> {data.a1}/{data.a2}
        </div>
      )}
    </div>
  );
}
