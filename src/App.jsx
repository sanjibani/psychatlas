import { useState, useEffect } from "react";
import ManhattanPlot from "./components/ManhattanPlot";
import InfoPanel from "./components/InfoPanel";
import CrossDisorderHeatmap from "./components/CrossDisorderHeatmap";
import SnpDetailPanel from "./components/SnpDetailPanel";
import "./App.css";

const TABS = [
  { id: "manhattan", label: "Manhattan Plot" },
  { id: "crossdisorder", label: "Cross-Disorder Overlap" },
];

export default function App() {
  const [data, setData] = useState(null);
  const [crossData, setCrossData] = useState(null);
  const [activeTab, setActiveTab] = useState("manhattan");
  const [selectedSnp, setSelectedSnp] = useState(null);

  useEffect(() => {
    fetch("/data/scz2014_manhattan.json")
      .then((r) => r.json())
      .then(setData);

    fetch("/data/cross_disorder.json")
      .then((r) => r.json())
      .then(setCrossData)
      .catch(() => setCrossData(null));
  }, []);

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="title-group">
            <h1 className="title">PsychAtlas</h1>
            <span className="subtitle">
              Interactive Psychiatric GWAS Explorer
            </span>
          </div>

          {/* Tabs */}
          <nav className="tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`tab ${activeTab === tab.id ? "tab-active" : ""}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedSnp(null);
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === "manhattan" && (
            <div className="controls">
              <label className="dropdown-label">
                Disorder
                <select className="dropdown" defaultValue="scz">
                  <option value="scz">Schizophrenia</option>
                </select>
              </label>
              <label className="dropdown-label">
                Study
                <select className="dropdown" defaultValue="scz2014">
                  <option value="scz2014">PGC SCZ 2014 (Nature)</option>
                </select>
              </label>
            </div>
          )}
        </div>
      </header>

      {activeTab === "manhattan" && <InfoPanel data={data} />}

      <main className="main">
        <div className="main-content">
          <div className={`plot-area ${selectedSnp ? "plot-area-with-panel" : ""}`}>
            {activeTab === "manhattan" && (
              <ManhattanPlot
                data={data}
                onSnpClick={(snp) => setSelectedSnp(snp)}
              />
            )}
            {activeTab === "crossdisorder" && <CrossDisorderHeatmap />}
          </div>

          {selectedSnp && (
            <SnpDetailPanel
              snp={selectedSnp}
              crossData={crossData}
              onClose={() => setSelectedSnp(null)}
            />
          )}
        </div>
      </main>

      <footer className="footer">
        <span>
          Data:{" "}
          <a
            href="https://huggingface.co/collections/OpenMed/pgc-psychiatric-gwas-summary-statistics"
            target="_blank"
            rel="noopener noreferrer"
          >
            PGC Summary Statistics
          </a>{" "}
          via HuggingFace
          {activeTab === "manhattan" && " \u00b7 Sample of ~210K SNPs"}
          {activeTab === "crossdisorder" && " \u00b7 10 disorders, ~200K SNPs each"}
        </span>
      </footer>
    </div>
  );
}
