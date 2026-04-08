"""
Download samples from all PGC psychiatric disorders and compute:
1. Cross-disorder overlap matrix (pairwise -log10(p) correlation)
2. Significant SNP lookup table for cross-disorder comparison
"""

import json
import math
import sys
from pathlib import Path

import polars as pl
from huggingface_hub import hf_hub_download

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "public" / "data"

# One representative config per disorder (most recent, standard columns)
DISORDERS = {
    "Schizophrenia":      {"repo": "OpenMed/pgc-schizophrenia", "config": "scz2014",   "shards": 1018},
    "Bipolar":            {"repo": "OpenMed/pgc-bipolar",       "config": "bip2019",    "shards": 1342},
    "MDD":                {"repo": "OpenMed/pgc-mdd",           "config": "mdd2018",    "shards": 2345},
    "ADHD":               {"repo": "OpenMed/pgc-adhd",          "config": "adhd2022",   "shards": 678},
    "Autism":             {"repo": "OpenMed/pgc-autism",         "config": "asd2019",    "shards": 912},
    "PTSD":               {"repo": "OpenMed/pgc-ptsd",          "config": "ptsd2019",   "shards": 926},
    "Anxiety":            {"repo": "OpenMed/pgc-anxiety",       "config": "anx2026",    "shards": 724},
    "Eating Disorders":   {"repo": "OpenMed/pgc-eating-disorders", "config": "an2017",   "shards": 1065},
    "OCD":                {"repo": "OpenMed/pgc-ocd-tourette",  "config": "ocd2025",    "shards": 1357},
    "Substance Use":      {"repo": "OpenMed/pgc-substance-use", "config": "SUD2023",    "shards": 575},
}

SHARDS_PER_DISORDER = 20  # ~200K rows per disorder
SIGNIFICANCE_THRESHOLD = 5e-8
SUGGESTIVE_THRESHOLD = 1e-5

# Column name mappings for harmonization
COL_MAPS = {
    "SNP": "snpid", "snpid": "snpid", "SNPID": "snpid", "MarkerName": "snpid",
    "CHR": "chr", "chr": "chr", "Chromosome": "chr",
    "BP": "bp", "bp": "bp", "base_pair_location": "bp",
    "P": "pvalue", "p": "pvalue", "Pval": "pvalue", "pval": "pvalue",
    "P-value": "pvalue", "p_value": "pvalue",
}


def harmonize_columns(df):
    """Standardize column names across datasets."""
    renames = {}
    for col in df.columns:
        if col in COL_MAPS:
            renames[col] = COL_MAPS[col]
    if renames:
        df = df.rename(renames)
    return df


def download_disorder(name, info):
    """Download sample shards for one disorder."""
    repo = info["repo"]
    config = info["config"]
    total = info["shards"]
    step = max(1, total // SHARDS_PER_DISORDER)

    indices = list(range(0, total, step))[:SHARDS_PER_DISORDER]
    frames = []

    for idx, i in enumerate(indices):
        filename = f"data/{config}/train-{i:05d}-of-{total:05d}.parquet"
        sys.stdout.write(f"\r  [{idx+1}/{len(indices)}] shard {i}...")
        sys.stdout.flush()

        try:
            path = hf_hub_download(repo, filename, repo_type="dataset")
            df = pl.read_parquet(path)

            # Standardize FRQ columns (vary per shard)
            for prefix in ("FRQ_A", "FRQ_U"):
                cols = [c for c in df.columns if c.startswith(prefix) and c != prefix]
                if cols:
                    df = df.rename({cols[0]: prefix})

            df = harmonize_columns(df)
            frames.append(df)
        except Exception as e:
            sys.stdout.write(f" SKIP ({e})")

    print()

    if not frames:
        return None

    combined = pl.concat(frames, how="diagonal_relaxed")

    # Ensure required columns exist
    if "snpid" not in combined.columns or "pvalue" not in combined.columns:
        print(f"  WARNING: Missing snpid or pvalue columns. Available: {combined.columns}")
        return None

    # Filter valid rows
    combined = combined.filter(
        pl.col("snpid").is_not_null()
        & pl.col("pvalue").is_not_null()
        & (pl.col("pvalue") > 0)
    )

    # Compute -log10(p)
    combined = combined.with_columns(
        (-pl.col("pvalue").cast(pl.Float64).log(base=10)).alias("negLogP")
    )
    combined = combined.filter(pl.col("negLogP").is_finite())

    n_sig = combined.filter(pl.col("pvalue") < SIGNIFICANCE_THRESHOLD).height
    print(f"  {name}: {len(combined)} SNPs, {n_sig} genome-wide significant")

    return combined.select(["snpid", "pvalue", "negLogP"])


def compute_overlap_matrix(disorder_data):
    """Compute pairwise -log10(p) correlation between disorders."""
    names = list(disorder_data.keys())
    n = len(names)
    matrix = [[0.0] * n for _ in range(n)]

    for i in range(n):
        for j in range(i, n):
            if i == j:
                matrix[i][j] = 1.0
                continue

            df_a = disorder_data[names[i]]
            df_b = disorder_data[names[j]]

            # Join on SNP ID
            joined = df_a.join(df_b, on="snpid", suffix="_b")

            if len(joined) < 100:
                matrix[i][j] = 0.0
                matrix[j][i] = 0.0
                continue

            # Pearson correlation of -log10(p) values
            col_a = joined["negLogP"].to_numpy()
            col_b = joined["negLogP_b"].to_numpy()

            mean_a = col_a.mean()
            mean_b = col_b.mean()
            da = col_a - mean_a
            db = col_b - mean_b
            num = (da * db).sum()
            den = (da**2).sum() ** 0.5 * (db**2).sum() ** 0.5
            r = float(num / den) if den > 0 else 0.0

            matrix[i][j] = round(r, 4)
            matrix[j][i] = round(r, 4)

            shared_sig = joined.filter(
                (pl.col("pvalue") < SIGNIFICANCE_THRESHOLD)
                & (pl.col("pvalue_b") < SIGNIFICANCE_THRESHOLD)
            ).height

            print(f"  {names[i]} x {names[j]}: r={r:.3f}, shared SNPs={len(joined)}, shared sig={shared_sig}")

    return names, matrix


def build_snp_lookup(disorder_data):
    """Build lookup: for each significant SNP in any disorder, store its p-value in all disorders."""
    # Collect all significant/suggestive SNPs across disorders
    sig_snps = set()
    for name, df in disorder_data.items():
        snps = df.filter(pl.col("pvalue") < SUGGESTIVE_THRESHOLD)["snpid"].to_list()
        sig_snps.update(snps)

    print(f"\nTotal unique suggestive SNPs across all disorders: {len(sig_snps)}")

    # For each such SNP, look up p-value in every disorder
    lookup = {}
    disorder_names = list(disorder_data.keys())

    for snp in sig_snps:
        entry = {}
        for name, df in disorder_data.items():
            match = df.filter(pl.col("snpid") == snp)
            if len(match) > 0:
                p = match["pvalue"][0]
                nlp = match["negLogP"][0]
                entry[name] = {"p": p, "nlp": round(nlp, 4)}
        if len(entry) >= 2:  # only keep if found in 2+ disorders
            lookup[snp] = entry

    print(f"SNPs found in 2+ disorders: {len(lookup)}")
    return lookup


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Download all disorders
    disorder_data = {}
    for name, info in DISORDERS.items():
        print(f"\nDownloading {name} ({info['config']})...")
        df = download_disorder(name, info)
        if df is not None:
            disorder_data[name] = df

    print(f"\n{'='*60}")
    print(f"Successfully loaded {len(disorder_data)} disorders")

    # Compute overlap matrix
    print("\nComputing cross-disorder correlation matrix...")
    names, matrix = compute_overlap_matrix(disorder_data)

    # Build SNP lookup
    print("\nBuilding cross-disorder SNP lookup...")
    snp_lookup = build_snp_lookup(disorder_data)

    # Disorder stats
    disorder_stats = {}
    for name, df in disorder_data.items():
        n_sig = df.filter(pl.col("pvalue") < SIGNIFICANCE_THRESHOLD).height
        n_sug = df.filter(pl.col("pvalue") < SUGGESTIVE_THRESHOLD).height
        disorder_stats[name] = {
            "totalSnps": len(df),
            "significantSnps": n_sig,
            "suggestiveSnps": n_sug,
        }

    # Save
    result = {
        "disorders": names,
        "matrix": matrix,
        "stats": disorder_stats,
        "snpLookup": snp_lookup,
    }

    out_path = OUTPUT_DIR / "cross_disorder.json"
    with open(out_path, "w") as f:
        json.dump(result, f)

    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"\nOutput: {out_path}")
    print(f"File size: {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
