import json
import base64
import os

def process_geojson():
    input_file = "karttakohteet_raw.json"
    output_file = "karttakohteet_data.js"

    # Define property mapping rules to categorize features
    def determine_category(props):
        amenity = props.get("amenity")
        leisure = props.get("leisure")
        sport = props.get("sport")
        building = props.get("building")
        
        if amenity == "school":
            return "Koulut"
        elif amenity == "shelter":
            return "Laavut"
        elif amenity == "library":
            return "Kirjastot"
        elif amenity in ("place_of_worship", "church") or building in ("church", "chapel"):
            return "Kirkot ja kappelit"
        elif amenity == "kindergarten":
            return "Päiväkodit"
        elif amenity == "clinic":
            return "Terveyskeskukset"
        elif amenity == "fire_station":
            return "Paloasemat"
        elif leisure in ("pitch", "sports_centre") or sport:
            if "equestrian" in str(sport):
                return "Hevosurheilu"
            elif "soccer" in str(sport):
                return "Jalkapallokentät"
            elif "tennis" in str(sport):
                return "Tenniskentät"
            elif "ice_hockey" in str(sport) or "ice_skating" in str(sport):
                return "Jääurheilu"
            elif "beachvolleyball" in str(sport) or "volleyball" in str(sport):
                return "Lentopallokentät"
            elif "skateboard" in str(sport):
                return "Skeittiparkit"
            elif "padel" in str(sport):
                return "Padelkentät"
            elif "athletics" in str(sport):
                return "Yleisurheilu"
            elif "disc_golf" in str(sport):
                return "Frisbeegolf"
            else:
                return "Urheilupaikat"
        elif amenity == "townhall":
            return "Kunnantalo"
        elif amenity == "bus_station":
            return "Linja-autoasemat"
        else:
            return "Muut"

    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found.")
        return

    with open(input_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    # Process features
    filtered_features = []
    
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        
        # Determine category and assign it
        cat = determine_category(props)
        if cat:
            props["category"] = cat
            
            # Keep name, and some specific properties to avoid bloated data
            clean_props = {
                "category": cat,
                "name": props.get("name") or props.get("name:fi") or props.get("alt_name") or f"{cat} (Nimetön)",
                "address": props.get("addr:street", "") + " " + props.get("addr:housenumber", "") + ", " + props.get("addr:city", ""),
                "website": props.get("website", ""),
                "image": props.get("image", ""),
                "sport": props.get("sport", ""),
                "email": props.get("email", ""),
                "phone": props.get("phone", "")
            }
            
            # Clean up empty values
            clean_props = {k: v for k, v in clean_props.items() if v and str(v).strip() != ","}
            
            feature["properties"] = clean_props
            filtered_features.append(feature)
            
    data["features"] = filtered_features
    
    # Minify JSON
    compact_json = json.dumps(data, separators=(',', ':'))
    
    # Base64 Encode to obfuscate
    encoded_bytes = base64.b64encode(compact_json.encode("utf-8"))
    encoded_str = encoded_bytes.decode("utf-8")
    
    # Write to JS file with self-extraction
    js_content = f"""// Auto-generated data file. Do not edit.
window.getKarttaKohteet = function() {{
    const data = "{encoded_str}";
    try {{
        return JSON.parse(decodeURIComponent(escape(atob(data))));
    }} catch(e) {{
        console.error("Failed to decode data", e);
        return null;
    }}
}};
"""
    
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(js_content)
        
    print(f"Successfully processed {len(filtered_features)} features and generated {output_file}.")

if __name__ == "__main__":
    process_geojson()
