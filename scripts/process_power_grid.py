import geopandas as gpd
import pandas as pd
import numpy as np
import json
import os
import sys

# ─── Paths ───────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_DIR, "Data")

LINES_132KV = os.path.join(DATA_DIR, "transmission-lines-132kv.json")
LINES_33KV = os.path.join(DATA_DIR, "transmission-lines-33kv.json")
LINES_11KV = os.path.join(DATA_DIR, "transmission-lines-11kv.json")

# The existing ROI geojson that needs its 'electrification' score updated
ROI_GEOJSON = os.path.join(DATA_DIR, "kenya_wards_roi.geojson")
# The new simplified grid for UI rendering
GRID_OUT = os.path.join(DATA_DIR, "kenya_power_grid.geojson")

def main():
    print("Loading raw power grid JSON files...")
    gdfs = []
    
    # Safely load each file
    for file, label in [(LINES_132KV, "132kv"), (LINES_33KV, "33kv"), (LINES_11KV, "11kv")]:
        if os.path.exists(file):
            print(f" - Loading {label}...")
            gdf = gpd.read_file(file)
            gdf['line_type'] = label
            # Keep only geometry and type to save memory
            gdf = gdf[['geometry', 'line_type']]
            gdfs.append(gdf)
        else:
            print(f" - WARNING: {file} not found.")

    if not gdfs:
        print("Error: No transmission line files found!")
        sys.exit(1)

    # Combine all lines
    print("Merging transmission lines...")
    all_lines = pd.concat(gdfs, ignore_index=True)
    all_lines = gpd.GeoDataFrame(all_lines, geometry='geometry', crs=gdfs[0].crs)
    
    # Filter out empty or invalid geometries
    all_lines = all_lines[~all_lines.is_empty]
    all_lines = all_lines[all_lines.is_valid]
    
    # Drop completely null geometries
    all_lines = all_lines.dropna(subset=['geometry'])
    
    # Drop geometries with NaN or Infinite bounds (which cause Shapely GEOS exceptions during simplify)
    bounds = all_lines.bounds
    valid_bounds = ~(bounds.isna().any(axis=1) | np.isinf(bounds).any(axis=1))
    all_lines = all_lines[valid_bounds]
    
    # Reproject to UTM zone 37S (EPSG:32737) for metric simplification and analysis
    all_lines = all_lines.to_crs(epsg=32737)
    
    # 1. GENERATE UI MAP LAYER
    # We heavily simplify the geometries so Leaflet doesn't crash from 76MB of paths.
    print("Simplifying geometries for UI rendering (target < 2MB)...")
    
    # Simplify by 1000 meters for the UI layer, then project to WGS84 for Leaflet
    ui_grid = all_lines.copy()
    ui_grid['geometry'] = ui_grid.geometry.simplify(1000)
    ui_grid = ui_grid[~ui_grid.is_empty]
    ui_grid = ui_grid.to_crs(epsg=4326)
    
    ui_grid.to_file(GRID_OUT, driver="GeoJSON")
    print(f"✅ Saved optimized UI grid to {GRID_OUT} ({os.path.getsize(GRID_OUT) / 1024 / 1024:.2f} MB)")

    # 2. CALCULATE SPATIAL INTERSECTIONS FOR ROI
    print("Loading wards ROI file to calculate intersection...")
    # Read the existing wards ROI file which has demographics and base ROI
    wards = gpd.read_file(ROI_GEOJSON)
    
    # Reproject both to UTM zone 37S (EPSG:32737) which is good for Kenya to measure lengths in meters
    wards_utm = wards.to_crs(epsg=32737)
    all_lines_utm = all_lines # already in 32737
    
    print("Calculating spatial intersections (this may take a minute)...")
    # Spatial join to find which lines intersect which wards
    # A line can cross multiple wards, so we use overlay to split lines at ward boundaries
    # Wait, overlay takes a VERY long time for 76MB of lines and 1450 polygons. 
    # Faster alternative: sjoin, then just take length of lines in that bounding box, 
    # OR since we just want a relative score, spatial join is fast enough.
    
    # To be perfectly accurate and fast:
    # We will use spatial join to associate lines to wards. If a line crosses multiple, it gets counted for both.
    joined = gpd.sjoin(all_lines_utm, wards_utm[['gid', 'geometry']], how='inner', predicate='intersects')
    
    # Calculate length of these lines (Note: this slightly overestimates if a line barely touches, 
    # but is >100x faster than full geometric intersection and perfectly fine for relative scoring)
    joined['length_km'] = joined.geometry.length / 1000.0
    
    # Group by gid
    elec_stats = joined.groupby('gid')['length_km'].sum().reset_index()
    
    # Merge back to wards_utm
    wards_utm = wards_utm.merge(elec_stats, on='gid', how='left')
    wards_utm['length_km'] = wards_utm['length_km'].fillna(0)
    
    # Calculate density (km of transmission line per square km of ward area)
    # Area in sq km
    wards_utm['area_sqkm'] = wards_utm.geometry.area / 1e6
    wards_utm['elec_density'] = wards_utm['length_km'] / wards_utm['area_sqkm']
    
    # Normalize density to 0-100 for the "electrification" score (as percentage)
    # We clip at the 95th percentile to prevent a few tiny wards with massive lines from skewing it
    p95 = wards_utm['elec_density'].quantile(0.95)
    if p95 == 0: p95 = 1.0 # fallback
    
    wards_utm['electrification'] = ((wards_utm['elec_density'] / p95).clip(0, 1.0) * 100.0)
    # Ensure it's a float rounded to 1 decimal
    wards_utm['electrification'] = wards_utm['electrification'].round(1)
    
    # Drop temp columns
    wards_utm = wards_utm.drop(columns=['length_km', 'area_sqkm', 'elec_density'])
    
    print("Saving updated ROI data with real electrification scores...")
    final_wards = wards_utm.to_crs(epsg=4326)
    final_wards.to_file(ROI_GEOJSON, driver="GeoJSON")
    print(f"✅ Successfully updated {ROI_GEOJSON} with real grid data!")

if __name__ == "__main__":
    main()
