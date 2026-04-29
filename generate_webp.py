from PIL import Image
import os

input_file = 'hero-kuva.jpg'
output_webp = 'hero-kuva.webp'

try:
    img = Image.open(input_file)
    if img.width > 1920:
        ratio = 1920 / img.width
        new_height = int(img.height * ratio)
        img = img.resize((1920, new_height), Image.Resampling.LANCZOS)
    
    img.save(output_webp, 'WEBP', quality=75, method=6)
    
    print(f"WebP size: {os.path.getsize(output_webp)} bytes")
except Exception as e:
    print(f"Error: {e}")
