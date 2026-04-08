import { useState, useEffect } from "react";
import ManhattanPlot from "./components/ManhattanPlot";
import InfoPanel from "./components/InfoPanel";
import "./App.css";

export default function App() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/data/scz2014_manhattan.json")
      .then((r) => r.json())
      .then(setData);
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
        </div>
      </header>

      <InfoPanel data={data} />

      <main className="main">
        <ManhattanPlot data={data} />
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
          via HuggingFace &middot; Sample of ~210K SNPs
        </span>
      </footer>
    </div>
  );
}
