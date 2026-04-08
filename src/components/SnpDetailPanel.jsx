import { useEffect, useRef, useState } from "react";

const THRESHOLD = 7.3; // -log10(5e-8)
const BAR_HEIGHT = 28;
const BAR_GAP = 6;
const MARGIN = { top: 10, right: 20, bottom: 30, left: 120 };

export default function SnpDetailPanel({ snp, crossData, onClose }) {
  const canvasRef = useRef(null);

  if (!snp) return null;

  // Look up this SNP across disorders
  const lookup = crossData?.snpLookup?.[snp.snpid];
  const disorders = crossData?.disorders || [];

  // Build bar data: for each disorder, get -log10(p) if available
  const bars = disorders
    .map((d) => ({
      disorder: d,
      nlp: lookup?.[d]?.nlp ?? null,
      p: lookup?.[d]?.p ?? null,
    }))
    .filter((b) => b.nlp !== null)
    .sort((a, b) => b.nlp - a.nlp);

  // Also include the current disorder's value if not in cross-data
  const currentInBars = bars.find((b) => b.nlp === snp.negLogP);
  if (!currentInBars && snp.negLogP) {
    bars.push({
      disorder: "Current",
      nlp: snp.negLogP,
      p: snp.pvalue,
    });
    bars.sort((a, b) => b.nlp - a.nlp);
  }

  const maxNlp = Math.max(THRESHOLD + 2, ...bars.map((b) => b.nlp));

  // Draw bar chart
  useEffect(() => {
    if (!canvasRef.current || bars.length === 0) return;

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const chartWidth = 380;
    const chartHeight = MARGIN.top + bars.length * (BAR_HEIGHT + BAR_GAP) + MARGIN.bottom;

    canvas.width = chartWidth * dpr;
    canvas.height = chartHeight * dpr;
    canvas.style.width = `${chartWidth}px`;
    canvas.style.height = `${chartHeight}px`;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const plotWidth = chartWidth - MARGIN.left - MARGIN.right;

    ctx.clearRect(0, 0, chartWidth, chartHeight);

    ctx.save();
    ctx.translate(MARGIN.left, MARGIN.top);

    // Draw bars
    bars.forEach((bar, i) => {
      const y = i * (BAR_HEIGHT + BAR_GAP);
      const w = (bar.nlp / maxNlp) * plotWidth;
      const isSignificant = bar.nlp >= THRESHOLD;

      // Bar
      ctx.fillStyle = isSignificant ? "#ef4444" : "#93c5fd";
      ctx.beginPath();
      ctx.roundRect(0, y, w, BAR_HEIGHT, [0, 4, 4, 0]);
      ctx.fill();

      // Label (disorder name)
      ctx.fillStyle = "#1e293b";
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(bar.disorder, -8, y + BAR_HEIGHT / 2);

      // Value on bar
      ctx.fillStyle = isSignificant ? "#ffffff" : "#1e293b";
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(bar.nlp.toFixed(1), w + 4, y + BAR_HEIGHT / 2);
    });

    // Threshold line
    const threshX = (THRESHOLD / maxNlp) * plotWidth;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(threshX, -5);
    ctx.lineTo(threshX, bars.length * (BAR_HEIGHT + BAR_GAP));
    ctx.stroke();
    ctx.setLineDash([]);

    // Threshold label
    ctx.fillStyle = "#ef4444";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("p=5\u00d710\u207b\u2078", threshX, bars.length * (BAR_HEIGHT + BAR_GAP) + 14);

    ctx.restore();
  }, [bars, maxNlp]);

  const pFormatted =
    snp.pvalue < 1e-10
      ? snp.pvalue.toExponential(2)
      : snp.pvalue.toFixed(6);

  return (
    <div className="snp-panel">
      <div className="snp-panel-header">
        <h3>{snp.snpid}</h3>
        <button className="snp-close" onClick={onClose}>
          &times;
        </button>
      </div>

      <div className="snp-info-grid">
        <div className="snp-info-item">
          <span className="snp-info-label">Position</span>
          <span className="snp-info-value">
            Chr {snp.chr}:{snp.bp.toLocaleString()}
          </span>
        </div>
        <div className="snp-info-item">
          <span className="snp-info-label">P-value</span>
          <span className="snp-info-value">{pFormatted}</span>
        </div>
        {snp.or != null && (
          <div className="snp-info-item">
            <span className="snp-info-label">Odds Ratio</span>
            <span className="snp-info-value">{snp.or}</span>
          </div>
        )}
        {snp.a1 && snp.a2 && (
          <div className="snp-info-item">
            <span className="snp-info-label">Alleles</span>
            <span className="snp-info-value">
              {snp.a1}/{snp.a2}
            </span>
          </div>
        )}
      </div>

      {/* External links */}
      <div className="snp-links">
        <a
          href={`https://www.ncbi.nlm.nih.gov/snp/${snp.snpid}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          dbSNP
        </a>
        <a
          href={`https://ensembl.org/Homo_sapiens/Variation/Explore?v=${snp.snpid}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ensembl
        </a>
        <a
          href={`https://genetics.opentargets.org/variant/${snp.chr}_${snp.bp}_${snp.a1}_${snp.a2}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Targets
        </a>
      </div>

      {/* Cross-disorder comparison */}
      <div className="snp-cross-header">
        <h4>Cross-Disorder Significance</h4>
        <p>
          How significant is this SNP across different psychiatric disorders?
          {bars.length === 0
            ? " No cross-disorder data available for this SNP."
            : " Red bars exceed genome-wide significance."}
        </p>
      </div>

      {bars.length > 0 ? (
        <canvas ref={canvasRef} />
      ) : (
        <div className="snp-no-cross">
          This SNP was not found in the cross-disorder dataset.
          Only SNPs with suggestive significance (p &lt; 10⁻⁵) in at least one disorder are indexed.
        </div>
      )}
    </div>
  );
}
