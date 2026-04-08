import { useState } from "react";

export default function InfoPanel({ data }) {
  const [expanded, setExpanded] = useState(true);

  if (!data) return null;

  let significantCount = 0;
  let maxNegLogP = 0;
  let topIdx = 0;
  for (let i = 0; i < data.negLogP.length; i++) {
    if (data.negLogP[i] >= 7.3) significantCount++;
    if (data.negLogP[i] > maxNegLogP) {
      maxNegLogP = data.negLogP[i];
      topIdx = i;
    }
  }
  const topSnp = data.snpid[topIdx];
  const topChr = data.chr[topIdx];

  return (
    <div className="info-panel">
      {/* Summary stats bar */}
      <div className="stats-bar">
        <div className="stat">
          <span className="stat-value">{data.count.toLocaleString()}</span>
          <span className="stat-label">SNPs tested</span>
        </div>
        <div className="stat-divider" />
        <div className="stat">
          <span className="stat-value stat-significant">{significantCount}</span>
          <span className="stat-label">genome-wide significant</span>
        </div>
        <div className="stat-divider" />
        <div className="stat">
          <span className="stat-value">{topSnp}</span>
          <span className="stat-label">top hit (chr {topChr})</span>
        </div>
        <div className="stat-divider" />
        <button
          className="info-toggle"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? "Hide guide" : "Show guide"}
        >
          {expanded ? "Hide guide" : "What am I looking at?"}
        </button>
      </div>

      {/* Explainer */}
      {expanded && (
        <div className="explainer">
          <div className="explainer-content">
            <div className="explainer-section">
              <strong>What is this plot?</strong>
              <p>
                This is a <em>Manhattan plot</em> — the standard way to visualize
                results from a genome-wide association study (GWAS). Scientists
                tested ~210K genetic variants (SNPs) across the genome to find
                which ones are statistically associated with schizophrenia risk.
              </p>
            </div>
            <div className="explainer-section">
              <strong>How to read it</strong>
              <p>
                Each dot is one genetic variant. The x-axis shows its position
                across chromosomes 1-22. The y-axis shows how statistically
                significant the association is — <em>higher = stronger evidence</em>.
              </p>
            </div>
            <div className="explainer-section">
              <strong>What matters</strong>
              <p>
                The <span className="legend-line">dashed red line</span> is the
                significance threshold (p &lt; 5&times;10&#8315;&#8312;). Dots{" "}
                <em>above</em> this line are considered genuine genetic associations.
                The tall <span className="legend-red">red peaks</span> are the
                strongest signals — regions where DNA variation clearly affects
                schizophrenia risk. Hover over any dot for details.
              </p>
            </div>
          </div>

          {/* Legend */}
          <div className="legend">
            <div className="legend-item">
              <span className="legend-dot" style={{ background: "#4f86c6" }} />
              <span className="legend-dot" style={{ background: "#2c4a7c" }} />
              <span>SNPs (alternating by chromosome)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot" style={{ background: "#ef4444" }} />
              <span>Genome-wide significant (p &lt; 5&times;10&#8315;&#8312;)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dash" />
              <span>Significance threshold</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
