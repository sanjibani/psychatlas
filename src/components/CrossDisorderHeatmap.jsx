import { useEffect, useRef, useState, useCallback } from "react";

const CELL_SIZE = 56;
const LABEL_WIDTH = 130;
const MARGIN = { top: 140, right: 20, bottom: 20, left: LABEL_WIDTH };

// Color scale: white (0) → orange → deep red (1)
function correlationColor(r) {
  if (r <= 0) return "#f8fafc";
  if (r >= 1) return "#7c2d12";
  // Interpolate through: white → amber → orange → red → dark red
  const t = Math.pow(r, 0.7); // compress low values
  const rr = Math.round(255 - t * 131);
  const g = Math.round(250 - t * 220);
  const b = Math.round(252 - t * 240);
  return `rgb(${rr},${g},${b})`;
}

export default function CrossDisorderHeatmap({ onSnpSelect }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [data, setData] = useState(null);
  const [hover, setHover] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    fetch("/data/cross_disorder.json")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  // Draw heatmap
  useEffect(() => {
    if (!data) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const n = data.disorders.length;
    const width = MARGIN.left + n * CELL_SIZE + MARGIN.right;
    const height = MARGIN.top + n * CELL_SIZE + MARGIN.bottom;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Draw cells
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const r = data.matrix[i][j];
        const x = MARGIN.left + j * CELL_SIZE;
        const y = MARGIN.top + i * CELL_SIZE;

        // Cell fill
        ctx.fillStyle = correlationColor(r);
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

        // Cell border
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);

        // Value text
        if (i !== j) {
          ctx.fillStyle = r > 0.4 ? "#ffffff" : "#334155";
          ctx.font = "12px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(r.toFixed(2), x + CELL_SIZE / 2, y + CELL_SIZE / 2);
        } else {
          // Diagonal — show "1.00" or a dash
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 12px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("—", x + CELL_SIZE / 2, y + CELL_SIZE / 2);
        }
      }
    }

    // Row labels (left side)
    ctx.fillStyle = "#1e293b";
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      const y = MARGIN.top + i * CELL_SIZE + CELL_SIZE / 2;
      const label = data.disorders[i];
      const stats = data.stats[label];
      ctx.fillStyle = "#1e293b";
      ctx.fillText(label, MARGIN.left - 10, y - 7);
      if (stats) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillText(`${stats.significantSnps} sig`, MARGIN.left - 10, y + 8);
        ctx.font = "13px system-ui, sans-serif";
      }
    }

    // Column labels (top, rotated)
    ctx.fillStyle = "#1e293b";
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "left";
    for (let j = 0; j < n; j++) {
      const x = MARGIN.left + j * CELL_SIZE + CELL_SIZE / 2;
      ctx.save();
      ctx.translate(x, MARGIN.top - 10);
      ctx.rotate(-Math.PI / 3);
      ctx.fillText(data.disorders[j], 0, 0);
      ctx.restore();
    }
  }, [data]);

  // Hover handler
  const handleMouseMove = useCallback(
    (e) => {
      if (!data) return;
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      setMousePos({ x: e.clientX, y: e.clientY });

      const col = Math.floor((mx - MARGIN.left) / CELL_SIZE);
      const row = Math.floor((my - MARGIN.top) / CELL_SIZE);
      const n = data.disorders.length;

      if (col >= 0 && col < n && row >= 0 && row < n && row !== col) {
        setHover({
          d1: data.disorders[row],
          d2: data.disorders[col],
          r: data.matrix[row][col],
        });
      } else {
        setHover(null);
      }
    },
    [data]
  );

  if (!data) {
    return (
      <div className="heatmap-loading">
        <p>Loading cross-disorder data...</p>
        <p style={{ fontSize: 13, color: "#94a3b8" }}>
          If this is your first time, run:{" "}
          <code>python3 scripts/preprocess_crossdisorder.py</code>
        </p>
      </div>
    );
  }

  const n = data.disorders.length;
  const canvasWidth = MARGIN.left + n * CELL_SIZE + MARGIN.right;
  const canvasHeight = MARGIN.top + n * CELL_SIZE + MARGIN.bottom;

  return (
    <div ref={containerRef} className="heatmap-container">
      <div className="heatmap-header">
        <h2>Cross-Disorder Genetic Overlap</h2>
        <p>
          How much genetic signal is shared between psychiatric disorders?
          Each cell shows the correlation of association strength (-log₁₀ p-values)
          across shared SNPs. Higher values (darker red) = more shared genetic architecture.
        </p>
      </div>

      <div className="heatmap-scroll">
        <canvas
          ref={canvasRef}
          style={{ cursor: hover ? "pointer" : "default" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
        />
      </div>

      {/* Color scale legend */}
      <div className="heatmap-legend">
        <span className="heatmap-legend-label">Low overlap</span>
        <div className="heatmap-gradient" />
        <span className="heatmap-legend-label">High overlap</span>
      </div>

      {/* Hover tooltip */}
      {hover && (
        <div
          className="heatmap-tooltip"
          style={{ left: mousePos.x + 16, top: mousePos.y - 10 }}
        >
          <strong>
            {hover.d1} × {hover.d2}
          </strong>
          <div>Correlation: {hover.r.toFixed(3)}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
            {hover.r > 0.3
              ? "Substantial shared genetic architecture"
              : hover.r > 0.1
                ? "Moderate genetic overlap"
                : "Limited genetic overlap"}
          </div>
        </div>
      )}
    </div>
  );
}
