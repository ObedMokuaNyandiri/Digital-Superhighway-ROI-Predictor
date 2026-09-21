"""
Digital Superhighway ROI Predictor — Data Processing Pipeline
=============================================================
Reads Kenya ward boundaries shapefile, generates realistic synthetic
demographic data anchored in official county-level statistics, computes
initial ROI scores, and exports an optimized GeoJSON for the web app.
"""

import geopandas as gpd
import numpy as np
import json
import os
import sys

# Reproducible random generation
np.random.seed(42)

# ─── Paths ───────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
SHP_PATH = os.path.join(PROJECT_DIR, "Data", "clean_keya_wards.shp")
OUT_DIR = os.path.join(PROJECT_DIR, "data")
OUT_PATH = os.path.join(OUT_DIR, "kenya_wards_roi.geojson")

os.makedirs(OUT_DIR, exist_ok=True)

# ─── County-Level Anchor Data ───────────────────────────────────────
# Growth multipliers: 2009 → 2024 (derived from KNBS projections)
# National average ~1.26x over 15 years (2.6% avg annual growth for some, lower for others)
COUNTY_GROWTH = {
    "BARINGO": 1.28, "Bomet": 1.25, "Bungoma": 1.22, "Busia": 1.18,
    "ELGEYO-MARAKWET": 1.20, "EMBU": 1.15, "GARISSA": 1.45,
    "Homa Bay": 1.18, "ISIOLO": 1.40, "KAJIADO": 1.65,
    "KERICHO": 1.22, "KIRINYAGA": 1.10, "KITUI": 1.15,
    "Kakamega": 1.18, "Kiambu": 1.35, "Kilifi": 1.30,
    "Kisii": 1.15, "Kisumu": 1.20, "Kwale": 1.28,
    "LAIKIPIA": 1.32, "LAMU": 1.25, "MAKUENI": 1.12,
    "MANDERA": 1.50, "MARSABIT": 1.42, "MERU": 1.15,
    "Machakos": 1.25, "Migori": 1.20, "Mombasa": 1.30,
    "Muranga": 1.08, "NANDI": 1.22, "NYANDARUA": 1.12,
    "NYERI": 1.05, "Nairobi": 1.40, "Nakuru": 1.35,
    "Narok": 1.45, "Nyamira": 1.12, "SAMBURU": 1.38,
    "Siaya": 1.10, "TAITA TAVETA": 1.18, "TANA RIVER": 1.30,
    "THARAKA-NITHI": 1.12, "TRANS NZOIA": 1.25, "TURKANA": 1.48,
    "Uasin Gishu": 1.30, "Vihiga": 1.10, "WAJIR": 1.52,
    "WEST POKOT": 1.35
}

# Youth unemployment rates by county (% 18-34, grounded in KIPPRA/KNBS)
# National average ~39%. ASAL counties higher, urban counties mixed.
COUNTY_YOUTH_UNEMPLOYMENT = {
    "BARINGO": 42, "Bomet": 38, "Bungoma": 45, "Busia": 48,
    "ELGEYO-MARAKWET": 35, "EMBU": 32, "GARISSA": 62,
    "Homa Bay": 50, "ISIOLO": 55, "KAJIADO": 30,
    "KERICHO": 33, "KIRINYAGA": 28, "KITUI": 48,
    "Kakamega": 44, "Kiambu": 22, "Kilifi": 52,
    "Kisii": 42, "Kisumu": 38, "Kwale": 55,
    "LAIKIPIA": 36, "LAMU": 50, "MAKUENI": 45,
    "MANDERA": 65, "MARSABIT": 60, "MERU": 35,
    "Machakos": 30, "Migori": 48, "Mombasa": 35,
    "Muranga": 30, "NANDI": 36, "NYANDARUA": 40,
    "NYERI": 28, "Nairobi": 25, "Nakuru": 32,
    "Narok": 45, "Nyamira": 40, "SAMBURU": 58,
    "Siaya": 46, "TAITA TAVETA": 42, "TANA RIVER": 58,
    "THARAKA-NITHI": 38, "TRANS NZOIA": 40, "TURKANA": 68,
    "Uasin Gishu": 30, "Vihiga": 46, "WAJIR": 64,
    "WEST POKOT": 55
}

# Electrification rate by county (%, grounded in KPLC/KNBS data)
# National ~76%. Urban counties >85%, ASAL counties 20-40%.
COUNTY_ELECTRIFICATION = {
    "BARINGO": 45, "Bomet": 55, "Bungoma": 50, "Busia": 48,
    "ELGEYO-MARAKWET": 52, "EMBU": 70, "GARISSA": 25,
    "Homa Bay": 42, "ISIOLO": 35, "KAJIADO": 65,
    "KERICHO": 60, "KIRINYAGA": 75, "KITUI": 40,
    "Kakamega": 48, "Kiambu": 88, "Kilifi": 38,
    "Kisii": 55, "Kisumu": 62, "Kwale": 35,
    "LAIKIPIA": 55, "LAMU": 40, "MAKUENI": 42,
    "MANDERA": 15, "MARSABIT": 20, "MERU": 58,
    "Machakos": 65, "Migori": 40, "Mombasa": 82,
    "Muranga": 68, "NANDI": 55, "NYANDARUA": 52,
    "NYERI": 72, "Nairobi": 92, "Nakuru": 70,
    "Narok": 35, "Nyamira": 50, "SAMBURU": 22,
    "Siaya": 40, "TAITA TAVETA": 45, "TANA RIVER": 25,
    "THARAKA-NITHI": 55, "TRANS NZOIA": 52, "TURKANA": 12,
    "Uasin Gishu": 68, "Vihiga": 52, "WAJIR": 18,
    "WEST POKOT": 25
}

# Youth ratio (% of population aged 15-34)
COUNTY_YOUTH_RATIO = {
    "BARINGO": 33, "Bomet": 35, "Bungoma": 36, "Busia": 34,
    "ELGEYO-MARAKWET": 34, "EMBU": 30, "GARISSA": 32,
    "Homa Bay": 33, "ISIOLO": 31, "KAJIADO": 38,
    "KERICHO": 34, "KIRINYAGA": 28, "KITUI": 30,
    "Kakamega": 35, "Kiambu": 36, "Kilifi": 33,
    "Kisii": 34, "Kisumu": 35, "Kwale": 32,
    "LAIKIPIA": 34, "LAMU": 30, "MAKUENI": 29,
    "MANDERA": 31, "MARSABIT": 30, "MERU": 31,
    "Machakos": 33, "Migori": 34, "Mombasa": 40,
    "Muranga": 28, "NANDI": 34, "NYANDARUA": 30,
    "NYERI": 27, "Nairobi": 42, "Nakuru": 36,
    "Narok": 34, "Nyamira": 33, "SAMBURU": 31,
    "Siaya": 31, "TAITA TAVETA": 30, "TANA RIVER": 31,
    "THARAKA-NITHI": 29, "TRANS NZOIA": 36, "TURKANA": 30,
    "Uasin Gishu": 37, "Vihiga": 34, "WAJIR": 31,
    "WEST POKOT": 33
}

# Known existing digital hub locations (ward names, approximate)
EXISTING_HUB_WARDS = [
    # Nyandarua (recently commissioned)
    "Wiyumiririe", "Mirangine",
    # Nairobi (multiple Ajira centers)
    "Westlands", "Embakasi", "Kibra", "Mathare", "Kasarani",
    "Ruaraka", "Langata", "Dagoretti",
    # Mombasa
    "Nyali", "Likoni", "Changamwe",
    # Kisumu
    "Kondele", "Nyalenda",
    # Other major towns with known hubs
    "Eldoret", "Municipality", "Central",
]


def load_shapefile():
    """Load and prepare ward shapefile."""
    print("📂 Loading shapefile...")
    gdf = gpd.read_file(SHP_PATH, engine="pyogrio")
    print(f"   ✓ Loaded {len(gdf)} wards across {gdf['county'].nunique()} counties")
    print(f"   ✓ CRS: {gdf.crs}")
    return gdf


def generate_synthetic_data(gdf):
    """Generate realistic synthetic demographic data for each ward."""
    print("🧮 Generating synthetic demographic data...")

    # 1. Population 2024 estimate
    gdf["pop2024"] = gdf.apply(
        lambda r: int(r["pop2009"] * COUNTY_GROWTH.get(r["county"], 1.25)
                      * np.random.uniform(0.90, 1.10)),
        axis=1
    )

    # 2. Ward area in km² (from geometry)
    gdf_projected = gdf.to_crs(epsg=32637)  # UTM Zone 37N for Kenya
    gdf["area_km2"] = gdf_projected.geometry.area / 1e6
    gdf["pop_density"] = gdf["pop2024"] / gdf["area_km2"]

    # 3. Ward centroid (for distance calculations and map markers)
    centroids = gdf.geometry.centroid
    gdf["centroid_lat"] = centroids.y
    gdf["centroid_lng"] = centroids.x

    # 4. Youth unemployment (county base + ward-level noise)
    gdf["youth_unemployment"] = gdf.apply(
        lambda r: np.clip(
            COUNTY_YOUTH_UNEMPLOYMENT.get(r["county"], 39)
            + np.random.normal(0, 5),
            8, 85
        ),
        axis=1
    ).round(1)

    # 5. Electrification rate (county base + ward-level noise)
    # Urban wards (higher pop density) get higher electrification
    gdf["electrification"] = gdf.apply(
        lambda r: np.clip(
            COUNTY_ELECTRIFICATION.get(r["county"], 50)
            + (10 if r["pop_density"] > 500 else 0)
            + (-8 if r["pop_density"] < 50 else 0)
            + np.random.normal(0, 6),
            5, 98
        ),
        axis=1
    ).round(1)

    # 6. Youth population ratio
    gdf["youth_ratio"] = gdf.apply(
        lambda r: np.clip(
            COUNTY_YOUTH_RATIO.get(r["county"], 33)
            + np.random.normal(0, 3),
            18, 55
        ),
        axis=1
    ).round(1)

    # 7. Connectivity gap (inverse of distance to nearest major urban center)
    # Use a proxy: wards far from Nairobi/Mombasa/Kisumu have higher connectivity gap
    major_cities = {
        "Nairobi": (-1.2921, 36.8219),
        "Mombasa": (-4.0435, 39.6682),
        "Kisumu": (-0.1022, 34.7617),
        "Nakuru": (-0.3031, 36.0800),
        "Eldoret": (0.5143, 35.2698),
    }

    def min_distance_to_city(row):
        lat, lng = row["centroid_lat"], row["centroid_lng"]
        dists = [
            np.sqrt((lat - clat)**2 + (lng - clng)**2) * 111  # Approx km
            for clat, clng in major_cities.values()
        ]
        return min(dists)

    gdf["dist_to_city_km"] = gdf.apply(min_distance_to_city, axis=1).round(1)
    gdf["connectivity_gap"] = np.clip(gdf["dist_to_city_km"] / gdf["dist_to_city_km"].max() * 100, 0, 100).round(1)

    # 8. Existing hub flag
    gdf["has_existing_hub"] = gdf["ward"].str.lower().apply(
        lambda w: any(hub.lower() in w for hub in EXISTING_HUB_WARDS)
    ).astype(int)

    print(f"   ✓ Population 2024: {gdf['pop2024'].sum():,.0f} (national estimate)")
    print(f"   ✓ Youth unemployment range: {gdf['youth_unemployment'].min():.1f}% — {gdf['youth_unemployment'].max():.1f}%")
    print(f"   ✓ Electrification range: {gdf['electrification'].min():.1f}% — {gdf['electrification'].max():.1f}%")
    print(f"   ✓ Existing hubs marked: {gdf['has_existing_hub'].sum()}")

    return gdf


def calculate_roi_scores(gdf, weights=None):
    """Calculate ROI scores using weighted MCDA."""
    print("📊 Calculating ROI scores...")

    if weights is None:
        weights = {
            "population": 0.25,
            "youth_unemployment": 0.30,
            "youth_ratio": 0.15,
            "electrification": 0.15,
            "connectivity_gap": 0.15,
        }

    # Min-max normalization
    def normalize(series):
        mn, mx = series.min(), series.max()
        if mx == mn:
            return series * 0
        return (series - mn) / (mx - mn) * 100

    gdf["norm_population"] = normalize(gdf["pop_density"])
    gdf["norm_youth_unemployment"] = normalize(gdf["youth_unemployment"])
    gdf["norm_youth_ratio"] = normalize(gdf["youth_ratio"])

    # Electrification: moderate is best (need power but not already saturated)
    # Transform: peak at 50%, drops off below 20% and above 80%
    gdf["norm_electrification"] = normalize(
        100 - np.abs(gdf["electrification"] - 55) * 2
    )

    gdf["norm_connectivity_gap"] = normalize(gdf["connectivity_gap"])

    # Composite score
    gdf["roi_score"] = (
        weights["population"] * gdf["norm_population"]
        + weights["youth_unemployment"] * gdf["norm_youth_unemployment"]
        + weights["youth_ratio"] * gdf["norm_youth_ratio"]
        + weights["electrification"] * gdf["norm_electrification"]
        + weights["connectivity_gap"] * gdf["norm_connectivity_gap"]
    )

    # Penalty for existing hubs
    gdf["roi_score"] = gdf["roi_score"] - (gdf["has_existing_hub"] * 15)
    gdf["roi_score"] = gdf["roi_score"].clip(0, 100).round(2)

    # Rank
    gdf["roi_rank"] = gdf["roi_score"].rank(ascending=False, method="min").astype(int)

    print(f"   ✓ ROI score range: {gdf['roi_score'].min():.1f} — {gdf['roi_score'].max():.1f}")
    print(f"   ✓ Top ward: {gdf.loc[gdf['roi_rank'] == 1, 'ward'].values[0]} "
          f"({gdf.loc[gdf['roi_rank'] == 1, 'county'].values[0]}) — "
          f"Score: {gdf['roi_score'].max():.1f}")

    # Print top 10
    top10 = gdf.nsmallest(10, "roi_rank")[
        ["ward", "county", "roi_score", "pop2024", "youth_unemployment", "electrification"]
    ]
    print("\n   🏆 Top 10 Wards:")
    for _, row in top10.iterrows():
        print(f"      {row['ward']:30s} | {row['county']:20s} | "
              f"ROI: {row['roi_score']:5.1f} | Pop: {row['pop2024']:>8,} | "
              f"YU: {row['youth_unemployment']:4.1f}% | Elec: {row['electrification']:4.1f}%")

    return gdf


def export_geojson(gdf):
    """Export optimized GeoJSON for web consumption."""
    print("\n💾 Exporting GeoJSON...")

    # Select columns for export
    export_cols = [
        "geometry", "gid", "county", "subcounty", "ward",
        "pop2009", "pop2024", "area_km2", "pop_density",
        "centroid_lat", "centroid_lng",
        "youth_unemployment", "electrification", "youth_ratio",
        "connectivity_gap", "dist_to_city_km", "has_existing_hub",
        "norm_population", "norm_youth_unemployment", "norm_youth_ratio",
        "norm_electrification", "norm_connectivity_gap",
        "roi_score", "roi_rank"
    ]

    export_gdf = gdf[export_cols].copy()

    # Round numeric columns
    for col in export_gdf.select_dtypes(include=[np.number]).columns:
        if col in ["gid", "pop2009", "pop2024", "roi_rank", "has_existing_hub"]:
            export_gdf[col] = export_gdf[col].astype(int)
        else:
            export_gdf[col] = export_gdf[col].round(2)

    # Simplify geometries for web performance (tolerance ~100m)
    export_gdf["geometry"] = export_gdf["geometry"].simplify(tolerance=0.001, preserve_topology=True)

    # Export
    export_gdf.to_file(OUT_PATH, driver="GeoJSON", engine="pyogrio")

    file_size_mb = os.path.getsize(OUT_PATH) / 1024 / 1024
    print(f"   ✓ Exported to {OUT_PATH}")
    print(f"   ✓ File size: {file_size_mb:.1f} MB")
    print(f"   ✓ Features: {len(export_gdf)}")

    return OUT_PATH


def main():
    print("=" * 60)
    print("  Digital Superhighway ROI Predictor — Data Pipeline")
    print("=" * 60)
    print()

    gdf = load_shapefile()
    gdf = generate_synthetic_data(gdf)
    gdf = calculate_roi_scores(gdf)
    path = export_geojson(gdf)

    print()
    print("=" * 60)
    print("  ✅ Pipeline complete!")
    print(f"  Output: {path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
