#!/usr/bin/env python3
"""
Create a simple test image for image input testing
"""

import base64
import io

from PIL import Image, ImageDraw

# Create a simple colorful test image
img = Image.new("RGB", (200, 200), color="white")
draw = ImageDraw.Draw(img)

# Draw a simple smiley face
draw.ellipse([50, 50, 150, 150], fill="yellow", outline="black", width=3)
draw.ellipse([70, 80, 80, 90], fill="black")  # left eye
draw.ellipse([120, 80, 130, 90], fill="black")  # right eye
draw.arc([75, 100, 125, 130], start=0, end=180, fill="black", width=3)  # smile

# Convert to base64
buffer = io.BytesIO()
img.save(buffer, format="PNG")
buffer.seek(0)
base64_data = base64.b64encode(buffer.read()).decode("utf-8")

print(base64_data)
