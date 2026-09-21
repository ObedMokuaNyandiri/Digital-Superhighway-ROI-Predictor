import json
import os

def generate_power_grid():
    print("Generating Kenya National Power Grid GeoJSON (Verifiable High-Voltage Backbone)...")
    
    # Known KETRACO / KPLC High Voltage Transmission Backbone
    # (Coordinates are approximate accurate paths for the 400kV and 220kV lines)
    
    lines = [
        # Mombasa - Nairobi 400kV line
        {
            "properties": {"name": "Mombasa-Nairobi", "voltage": "400kV", "operator": "KETRACO"},
            "coordinates": [
                [39.63, -4.05], # Mombasa
                [38.50, -2.98], # Voi
                [37.95, -2.25], # Mtito Andei
                [36.82, -1.29]  # Nairobi (Embakasi)
            ]
        },
        # Suswa - Isinya - Nairobi 400kV
        {
            "properties": {"name": "Suswa-Isinya-Nairobi", "voltage": "400kV", "operator": "KETRACO"},
            "coordinates": [
                [36.35, -1.05], # Suswa Substation
                [36.85, -1.67], # Isinya
                [36.82, -1.29]  # Nairobi
            ]
        },
        # Olkaria - Suswa
        {
            "properties": {"name": "Olkaria-Suswa", "voltage": "220kV", "operator": "KETRACO"},
            "coordinates": [
                [36.29, -0.89], # Olkaria Geothermal
                [36.35, -1.05]  # Suswa
            ]
        },
        # Suswa - Loyangalani (Lake Turkana Wind Power) 400kV
        {
            "properties": {"name": "LTWP-Suswa", "voltage": "400kV", "operator": "KETRACO"},
            "coordinates": [
                [36.78, 2.75],  # Loyangalani (Turkana)
                [36.81, 1.05],  # Baragoi
                [36.40, 0.05],  # Nyahururu
                [36.35, -1.05]  # Suswa
            ]
        },
        # Olkaria - Kisumu (Lessos - Kisumu 220kV/400kV)
        {
            "properties": {"name": "Olkaria-Lessos-Kisumu", "voltage": "220kV", "operator": "KETRACO"},
            "coordinates": [
                [36.29, -0.89], # Olkaria
                [36.08, -0.28], # Nakuru
                [35.28, 0.51],  # Eldoret / Lessos
                [34.76, -0.09]  # Kisumu
            ]
        },
        # Turkwel - Lessos 220kV
        {
            "properties": {"name": "Turkwel-Lessos", "voltage": "220kV", "operator": "KETRACO"},
            "coordinates": [
                [35.34, 1.90],  # Turkwel Gorge Dam
                [35.01, 1.02],  # Kitale
                [35.28, 0.51]   # Lessos
            ]
        },
        # Nairobi - Mount Kenya (Kindaruma/Seven Forks) 132kV/220kV
        {
            "properties": {"name": "Seven Forks-Nairobi", "voltage": "220kV", "operator": "KenGen/KETRACO"},
            "coordinates": [
                [37.81, -0.81], # Kindaruma Dam
                [37.26, -0.72], # Thika
                [36.82, -1.29]  # Nairobi
            ]
        },
        # Garissa - Kindaruma 220kV
        {
            "properties": {"name": "Garissa-Kindaruma", "voltage": "220kV", "operator": "KETRACO"},
            "coordinates": [
                [39.64, -0.45], # Garissa
                [38.50, -0.60], # Mwingi
                [37.81, -0.81]  # Kindaruma
            ]
        },
        # Rabai (Mombasa) - Malindi - Lamu 220kV
        {
            "properties": {"name": "Mombasa-Malindi-Lamu", "voltage": "220kV", "operator": "KETRACO"},
            "coordinates": [
                [39.55, -3.93], # Rabai
                [39.90, -3.51], # Kilifi
                [40.11, -3.21], # Malindi
                [40.90, -2.26]  # Lamu
            ]
        }
    ]
    
    features = []
    for line in lines:
        features.append({
            "type": "Feature",
            "properties": line["properties"],
            "geometry": {
                "type": "LineString",
                "coordinates": line["coordinates"]
            }
        })
        
    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    output_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'kenya_power_grid.geojson')
    with open(output_path, 'w') as f:
        json.dump(geojson, f, indent=2)
        
    print(f"Successfully generated {output_path} with {len(features)} major transmission lines.")

if __name__ == "__main__":
    generate_power_grid()
