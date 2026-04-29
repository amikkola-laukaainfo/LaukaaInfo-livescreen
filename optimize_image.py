from PIL import Image
import os

input_file = 'hero-kuva.jpg'
output_file = 'hero-kuva-optimized.jpg'

try:
    img = Image.open(input_file)
    # Resize if too large (e.g. max width 1920)
    if img.width > 1920:
        ratio = 1920 / img.width
        new_height = int(img.height * ratio)
        img = img.resize((1920, new_height), Image.Resampling.LANCZOS)
    
    img.save(output_file, 'JPEG', quality=75, optimize=True)
    
    original_size = os.path.getsize(input_file)
    optimized_size = os.path.getsize(output_file)
    
    print(f"Original: {original_size} bytes")
    print(f"Optimized: {optimized_size} bytes")
    print(f"Reduction: {(1 - optimized_size/original_size)*100:.1f}%")
except Exception as e:
    print(f"Error: {e}")
