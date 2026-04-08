import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as d3 from "d3";
import Tooltip from "./Tooltip";

// Alternating chromosome colors
const CHR_COLORS = [
  "#4f86c6", // steel blue
  "#2c4a7c", // navy
];
const SIGNIFICANT_COLOR = "#ef4444"; // red for hits above threshold
const THRESHOLD = 7.3; // -log10(5e-8)

const MARGIN = { top: 30, right: 80, bottom: 60, left: 65 };
const HOVER_RADIUS = 8; // pixel distance for tooltip trigger
const GRID_CELL = 20; // spatial index cell size in pixels

export default function ManhattanPlot({ data }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const scalesRef = useRef(null);
  const gridRef = useRef(null);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Draw plot and build spatial index
  useEffect(() => {
    if (!data || !dimensions.width || !dimensions.height) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = dimensions;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = height - MARGIN.top - MARGIN.bottom;

    // Scales
    const xScale = d3
      .scaleLinear()
      .domain([0, data.totalGenomeLength])
      .range([0, plotWidth]);

    const maxY = Math.ceil(d3.max(data.negLogP) || 10);
    const yScale = d3
      .scaleLinear()
      .domain([0, maxY + 1])
      .range([plotHeight, 0]);

    scalesRef.current = { xScale, yScale, plotWidth, plotHeight };

    // Build spatial grid index for hover lookups
    const gridCols = Math.ceil(plotWidth / GRID_CELL);
    const gridRows = Math.ceil(plotHeight / GRID_CELL);
    const grid = new Map();

    // Clear
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fafbfc";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(MARGIN.left, MARGIN.top);

    // Chromosome background bands
    for (let chr = 1; chr <= 22; chr++) {
      const offset = data.chrOffsets[String(chr)];
      const len = data.chrLengths[String(chr)];
      if (offset == null || len == null) continue;

      const x0 = xScale(offset);
      const x1 = xScale(offset + len);

      if (chr % 2 === 0) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
        ctx.fillRect(x0, 0, x1 - x0, plotHeight);
      }
    }

    // Draw points and populate grid
    const n = data.count;
    for (let i = 0; i < n; i++) {
      const px = xScale(data.cumBp[i]);
      const py = yScale(data.negLogP[i]);
      const chr = data.chr[i];
      const isSignificant = data.negLogP[i] >= THRESHOLD;

      ctx.fillStyle = isSignificant ? SIGNIFICANT_COLOR : CHR_COLORS[chr % 2];
      ctx.globalAlpha = isSignificant ? 0.9 : 0.5;

      const r = isSignificant ? 3.5 : 1.8;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();

      // Insert into grid
      const gc = Math.floor(px / GRID_CELL);
      const gr = Math.floor(py / GRID_CELL);
      const key = gr * gridCols + gc;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
    ctx.globalAlpha = 1;
    gridRef.current = { grid, gridCols, gridRows };

    // Significance threshold line
    const threshY = yScale(THRESHOLD);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(plotWidth, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Threshold label
    ctx.fillStyle = "#ef4444";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("p = 5\u00d710\u207b\u2078", plotWidth + 6, threshY + 4);

    // X-axis: chromosome labels
    ctx.fillStyle = "#475569";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (let chr = 1; chr <= 22; chr++) {
      const offset = data.chrOffsets[String(chr)];
      const len = data.chrLengths[String(chr)];
      if (offset == null || len == null) continue;

      const midX = xScale(offset + len / 2);
      ctx.fillText(String(chr), midX, plotHeight + 20);
    }

    // X-axis label
    ctx.fillStyle = "#334155";
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Chromosome", plotWidth / 2, plotHeight + 45);

    // Y-axis ticks and gridlines
    const yTicks = yScale.ticks(8);
    ctx.fillStyle = "#475569";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 0.5;
    for (const tick of yTicks) {
      const y = yScale(tick);
      ctx.fillText(String(tick), -8, y + 4);
      if (tick > 0) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(plotWidth, y);
        ctx.stroke();
      }
    }

    // Y-axis label (rotated)
    ctx.save();
    ctx.translate(-50, plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#334155";
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("-log\u2081\u2080(p-value)", 0, 0);
    ctx.restore();

    // Plot border
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, plotWidth, plotHeight);

    ctx.restore();
  }, [data, dimensions]);

  // Hover handler with grid-based spatial lookup
  const handleMouseMove = useCallback(
    (e) => {
      if (!data || !scalesRef.current || !gridRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left - MARGIN.left;
      const my = e.clientY - rect.top - MARGIN.top;

      setMousePos({ x: e.clientX, y: e.clientY });

      const { xScale, yScale, plotWidth, plotHeight } = scalesRef.current;

      if (mx < 0 || mx > plotWidth || my < 0 || my > plotHeight) {
        setTooltip(null);
        return;
      }

      // Search nearby grid cells
      const { grid, gridCols } = gridRef.current;
      const cellsToCheck = Math.ceil(HOVER_RADIUS / GRID_CELL);
      const gc = Math.floor(mx / GRID_CELL);
      const gr = Math.floor(my / GRID_CELL);

      let bestIdx = -1;
      let bestDist = Infinity;

      for (let dr = -cellsToCheck; dr <= cellsToCheck; dr++) {
        for (let dc = -cellsToCheck; dc <= cellsToCheck; dc++) {
          const key = (gr + dr) * gridCols + (gc + dc);
          const cell = grid.get(key);
          if (!cell) continue;

          for (const i of cell) {
            const px = xScale(data.cumBp[i]);
            const py = yScale(data.negLogP[i]);
            const dx = px - mx;
            const dy = py - my;
            const dist = dx * dx + dy * dy; // skip sqrt for perf
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          }
        }
      }

      if (bestIdx >= 0 && bestDist < HOVER_RADIUS * HOVER_RADIUS) {
        setTooltip({
          snpid: data.snpid[bestIdx],
          chr: data.chr[bestIdx],
          bp: data.bp[bestIdx],
          pvalue: data.pvalue[bestIdx],
          negLogP: data.negLogP[bestIdx],
          or: data.or ? data.or[bestIdx] : null,
          a1: data.a1?.[bestIdx] ?? null,
          a2: data.a2?.[bestIdx] ?? null,
        });
      } else {
        setTooltip(null);
      }
    },
    [data]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      {!data ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#94a3b8",
            fontSize: 16,
          }}
        >
          Loading GWAS data...
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            style={{ display: "block", cursor: tooltip ? "crosshair" : "default" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />
          <Tooltip data={tooltip} x={mousePos.x} y={mousePos.y} />
        </>
      )}
    </div>
  );
}
