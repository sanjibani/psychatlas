"""
Download a sample of PGC schizophrenia GWAS data from HuggingFace
and preprocess it into Manhattan-plot-ready JSON.

Uses scz2014 config (10.2M rows, autosomes) — the landmark Nature 2014 study.
"""

import json
import math
from pathlib import Path

import polars as pl
from huggingface_hub import hf_hub_download

# Standard GRCh37 (hg19) chromosome lengths
CHR_LENGTHS = {
    1: 249250621, 2: 243199373, 3: 198022430, 4: 191154276,
    5: 180915260, 6: 171115067, 7: 159138663, 8: 146364022,
    9: 141213431, 10: 135534747, 11: 135006516, 12: 133851895,
    13: 115169878, 14: 107349540, 15: 102531392, 16: 90354753,
    17: 81195210, 18: 78077248, 19: 59128983, 20: 63025520,
    21: 48129895, 22: 51304566,
}

# Cumulative offsets
CHR_OFFSETS = {}
cumulative = 0
for c in range(1, 23):
    CHR_OFFSETS[c] = cumulative
    cumulative += CHR_LENGTHS[c]

TOTAL_GENOME_LENGTH = cumulative

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "public" / "data"

# scz2014 has 1018 shards. Sample every ~100th shard to cover all chromosomes.
CONFIG = "scz2014"
TOTAL_SHARDS = 1018
SHARD_STEP = 50  # grab every 50th shard → ~20 shards → ~200K rows


def download_shards():
    """Download evenly-spaced parquet shards from HuggingFace."""
    print(f"Downloading {CONFIG} shards from HuggingFace...")
    frames = []

    shard_indices = list(range(0, TOTAL_SHARDS, SHARD_STEP))
    print(f"  Sampling {len(shard_indices)} shards: {shard_indices}")

    for idx, i in enumerate(shard_indices):
        filename = f"data/{CONFIG}/train-{i:05d}-of-{TOTAL_SHARDS:05d}.parquet"
        print(f"  [{idx + 1}/{len(shard_indices)}] Downloading shard {i}...")

        local_path = hf_hub_download(
            repo_id="OpenMed/pgc-schizophrenia",
            filename=filename,
            repo_type="dataset",
        )

        df = pl.read_parquet(local_path)

        # Standardize FRQ columns (suffixes vary per shard)
        for prefix in ("FRQ_A", "FRQ_U"):
            cols = [c for c in df.columns if c.startswith(prefix)]
            if cols and cols[0] != prefix:
                df = df.rename({cols[0]: prefix})

        frames.append(df)
        print(f"    -> {len(df)} rows, chrs: {sorted(df['CHR'].unique().to_list())}")

    combined = pl.concat(frames, how="diagonal_relaxed")
    print(f"\nTotal rows downloaded: {len(combined)}")
    return combined


def process(df: pl.DataFrame) -> dict:
    """Process dataframe into Manhattan plot data."""
    rename_map = {
        "SNP": "snpid", "CHR": "chr", "BP": "bp", "P": "pvalue",
        "OR": "or_val", "A1": "a1", "A2": "a2", "SE": "se",
    }
    existing = {k: v for k, v in rename_map.items() if k in df.columns}
    df = df.rename(existing)

    # Filter to valid autosomal rows
    df = df.filter(
        pl.col("chr").is_not_null()
        & pl.col("bp").is_not_null()
        & pl.col("pvalue").is_not_null()
        & (pl.col("pvalue") > 0)
        & (pl.col("chr") >= 1)
        & (pl.col("chr") <= 22)
    )

    df = df.with_columns(
        pl.col("chr").cast(pl.Int32),
        pl.col("bp").cast(pl.Int64),
        pl.col("pvalue").cast(pl.Float64),
    )

    # Compute -log10(pvalue) and cumulative position
    df = df.with_columns(
        (-pl.col("pvalue").log(base=10)).alias("negLogP")
    )

    chr_offset_expr = pl.col("chr").replace_strict(
        {c: offset for c, offset in CHR_OFFSETS.items()},
        return_dtype=pl.Int64,
    )
    df = df.with_columns(
        (pl.col("bp") + chr_offset_expr).alias("cumBp")
    )

    # Remove infinite/null values
    df = df.filter(pl.col("negLogP").is_finite() & pl.col("negLogP").is_not_null())
    df = df.sort("cumBp")

    # Stats
    max_nlp = df["negLogP"].max()
    n_sig = df.filter(pl.col("pvalue") < 5e-8).height
    chr_counts = df.group_by("chr").len().sort("chr")
    print(f"Total SNPs: {len(df)}")
    print(f"Max -log10(p): {max_nlp}")
    print(f"Genome-wide significant (p < 5e-8): {n_sig}")
    print(f"Chromosomes represented: {sorted(df['chr'].unique().to_list())}")

    def safe_round(v, decimals=4):
        if v is None or (isinstance(v, float) and (math.isinf(v) or math.isnan(v))):
            return 0
        return round(v, decimals)

    result = {
        "snpid": df["snpid"].to_list(),
        "chr": df["chr"].to_list(),
        "bp": df["bp"].to_list(),
        "cumBp": df["cumBp"].to_list(),
        "negLogP": [safe_round(v) for v in df["negLogP"].to_list()],
        "pvalue": df["pvalue"].to_list(),
        "a1": df["a1"].to_list() if "a1" in df.columns else [],
        "a2": df["a2"].to_list() if "a2" in df.columns else [],
        "chrOffsets": {str(k): v for k, v in CHR_OFFSETS.items()},
        "chrLengths": {str(k): v for k, v in CHR_LENGTHS.items()},
        "totalGenomeLength": TOTAL_GENOME_LENGTH,
        "count": len(df),
    }

    if "or_val" in df.columns:
        result["or"] = [safe_round(v) for v in df["or_val"].to_list()]

    return result


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    df = download_shards()
    data = process(df)

    out_path = OUTPUT_DIR / "scz2014_manhattan.json"
    with open(out_path, "w") as f:
        json.dump(data, f)

    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"\nOutput: {out_path}")
    print(f"File size: {size_mb:.1f} MB")
    print(f"SNPs: {data['count']}")


if __name__ == "__main__":
    main()
