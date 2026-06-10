import os
from PIL import Image, ImageDraw

def create_icon(size):
    # Create image with transparent background
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Scale coordinates based on size
    scale = size / 128.0
    
    # 1. Background circle (dark grey with orange border)
    # Only draw circle for larger sizes to keep 16x16 crisp
    if size >= 48:
        bg_margin = 4 * scale
        draw.ellipse(
            [bg_margin, bg_margin, size - bg_margin, size - bg_margin],
            fill=(25, 25, 25, 255),
            outline=(255, 87, 34, 255),
            width=int(max(1, 3 * scale))
        )
    
    # 2. Draw a stylized geometric fox face (orange, white, black details)
    # Center of drawing area
    cx = size / 2.0
    cy = size / 2.0 + (5 * scale if size >= 48 else 0)
    
    # Orange parts
    orange_color = (255, 87, 34, 255) # Boosty Orange
    # Left Ear
    draw.polygon([
        (cx - 35 * scale, cy - 30 * scale),
        (cx - 15 * scale, cy - 5 * scale),
        (cx - 30 * scale, cy + 5 * scale)
    ], fill=orange_color)
    
    # Right Ear
    draw.polygon([
        (cx + 35 * scale, cy - 30 * scale),
        (cx + 15 * scale, cy - 5 * scale),
        (cx + 30 * scale, cy + 5 * scale)
    ], fill=orange_color)
    
    # Face main shield
    draw.polygon([
        (cx, cy + 25 * scale),       # Nose tip
        (cx - 30 * scale, cy - 5 * scale), # Left cheek
        (cx, cy - 15 * scale),       # Forehead top
        (cx + 30 * scale, cy - 5 * scale)  # Right cheek
    ], fill=orange_color)
    
    # White cheek accents (inner face)
    white_color = (240, 240, 240, 255)
    draw.polygon([
        (cx, cy + 25 * scale),
        (cx - 20 * scale, cy),
        (cx, cy - 5 * scale)
    ], fill=white_color)
    
    draw.polygon([
        (cx, cy + 25 * scale),
        (cx + 20 * scale, cy),
        (cx, cy - 5 * scale)
    ], fill=white_color)
    
    # Nose (black)
    draw.polygon([
        (cx - 4 * scale, cy + 21 * scale),
        (cx + 4 * scale, cy + 21 * scale),
        (cx, cy + 25 * scale)
    ], fill=(30, 30, 30, 255))
    
    # Save the file
    filename = f"icon{size}.png"
    img.save(filename, "PNG")
    print(f"Generated {filename}")

if __name__ == "__main__":
    # Create directory for icons if not exists
    os.makedirs("icons", exist_ok=True)
    os.chdir("icons")
    
    # Generate 16, 48, 128
    create_icon(16)
    create_icon(48)
    create_icon(128)
    print("All icons generated successfully!")
