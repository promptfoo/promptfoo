#!/usr/bin/env python3
"""Test advanced segmentation with visualization and comparison."""

import os
import asyncio
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont
import cv2
import numpy as np
import io
from datetime import datetime

from agents.advanced_segmenter import AdvancedSegmenterAgent
from agents.segmenter import SegmenterAgent


async def test_advanced_segmentation(image_path: str = "./samples/sample_cards.jpg"):
    """Test advanced segmentation and compare with basic segmentation."""
    # Load environment variables
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
    
    if not os.getenv("GOOGLE_API_KEY"):
        print("❌ GOOGLE_API_KEY not found. Please set it in your .env file.")
        return
    
    print(f"🔍 Testing advanced segmentation on: {image_path}")
    print("="*60)
    
    # Initialize segmenters
    advanced_segmenter = AdvancedSegmenterAgent()
    basic_segmenter = SegmenterAgent()
    
    # Load original image
    original = Image.open(image_path)
    print(f"📐 Original image size: {original.size}")
    
    # Create output directory
    output_dir = f"./test_output/advanced_segmentation_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    os.makedirs(output_dir, exist_ok=True)
    
    # Save original
    original.save(f"{output_dir}/00_original.jpg")
    
    # Test 1: Basic Segmentation
    print("\n🔷 Testing Basic Segmentation...")
    try:
        basic_crops = await basic_segmenter(image_path=image_path)
        print(f"✅ Basic segmentation detected {len(basic_crops)} cards")
        
        # Save basic crops
        basic_dir = f"{output_dir}/basic_crops"
        os.makedirs(basic_dir, exist_ok=True)
        
        for idx, crop in enumerate(basic_crops):
            crop_image = Image.open(io.BytesIO(crop.image_rgb))
            crop_image.save(f"{basic_dir}/card_{idx+1}.png")
            print(f"   - Card {idx+1}: {crop_image.size}, perspective_corrected={crop.perspective_corrected}")
            
    except Exception as e:
        print(f"❌ Basic segmentation failed: {e}")
        basic_crops = []
    
    # Test 2: Advanced Segmentation
    print("\n🔶 Testing Advanced Segmentation...")
    try:
        advanced_crops = await advanced_segmenter(image_path=image_path)
        print(f"✅ Advanced segmentation detected {len(advanced_crops)} cards")
        
        # Save advanced crops
        advanced_dir = f"{output_dir}/advanced_crops"
        os.makedirs(advanced_dir, exist_ok=True)
        
        for idx, crop in enumerate(advanced_crops):
            crop_image = Image.open(io.BytesIO(crop.image_rgb))
            crop_image.save(f"{advanced_dir}/card_{idx+1}.png")
            print(f"   - Card {idx+1}: {crop_image.size}, perspective_corrected={crop.perspective_corrected}")
            if crop.corners:
                print(f"     Corners detected: Yes")
            
    except Exception as e:
        print(f"❌ Advanced segmentation failed: {e}")
        import traceback
        traceback.print_exc()
        advanced_crops = []
    
    # Create comparison visualization
    print("\n🎨 Creating comparison visualization...")
    
    # Create side-by-side comparison
    fig_width = original.width * 2 + 50
    fig_height = original.height + 100
    comparison = Image.new('RGB', (fig_width, fig_height), color='white')
    
    # Draw original with basic segmentation
    basic_viz = original.copy()
    draw_basic = ImageDraw.Draw(basic_viz)
    
    for idx, crop in enumerate(basic_crops):
        x, y = crop.box.x, crop.box.y
        w, h = crop.box.width, crop.box.height
        draw_basic.rectangle([x, y, x+w, y+h], outline='red', width=3)
        draw_basic.text((x+5, y+5), f"B{idx+1}", fill='red')
    
    # Draw original with advanced segmentation
    advanced_viz = original.copy()
    draw_advanced = ImageDraw.Draw(advanced_viz)
    
    for idx, crop in enumerate(advanced_crops):
        # Draw bounding box
        x, y = crop.box.x, crop.box.y
        w, h = crop.box.width, crop.box.height
        draw_advanced.rectangle([x, y, x+w, y+h], outline='green', width=3)
        draw_advanced.text((x+5, y+5), f"A{idx+1}", fill='green')
        
        # Draw corners if available
        if crop.corners and len(crop.corners) == 4:
            for corner in crop.corners:
                # Denormalize if needed
                if 0 <= corner[0] <= 1:
                    cx = int(corner[0] * original.width)
                    cy = int(corner[1] * original.height)
                else:
                    cx, cy = int(corner[0]), int(corner[1])
                
                draw_advanced.ellipse([cx-5, cy-5, cx+5, cy+5], fill='yellow', outline='green')
    
    # Paste images
    comparison.paste(basic_viz, (0, 50))
    comparison.paste(advanced_viz, (original.width + 50, 50))
    
    # Add labels
    draw = ImageDraw.Draw(comparison)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
    except:
        font = None
    
    draw.text((original.width//2 - 100, 10), "Basic Segmentation", fill='red', font=font)
    draw.text((original.width + 50 + original.width//2 - 120, 10), "Advanced Segmentation", fill='green', font=font)
    
    # Save comparison
    comparison.save(f"{output_dir}/01_comparison.jpg")
    print(f"✅ Saved comparison to: {output_dir}/01_comparison.jpg")
    
    # Create preprocessing visualization
    print("\n🔬 Creating preprocessing visualization...")
    
    # Load image for CV processing
    img_cv = cv2.imread(image_path)
    gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
    
    # Apply preprocessing steps
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)
    
    edges = cv2.Canny(enhanced, 50, 150)
    
    thresh = cv2.adaptiveThreshold(enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                 cv2.THRESH_BINARY_INV, 21, 10)
    
    # Create preprocessing grid
    prep_width = original.width // 2
    prep_height = original.height // 2
    
    prep_grid = Image.new('RGB', (prep_width * 2, prep_height * 2), color='white')
    
    # Resize and convert images
    gray_pil = Image.fromarray(gray).resize((prep_width, prep_height))
    enhanced_pil = Image.fromarray(enhanced).resize((prep_width, prep_height))
    edges_pil = Image.fromarray(edges).resize((prep_width, prep_height))
    thresh_pil = Image.fromarray(thresh).resize((prep_width, prep_height))
    
    # Paste into grid
    prep_grid.paste(gray_pil, (0, 0))
    prep_grid.paste(enhanced_pil, (prep_width, 0))
    prep_grid.paste(edges_pil, (0, prep_height))
    prep_grid.paste(thresh_pil, (prep_width, prep_height))
    
    # Add labels
    draw_prep = ImageDraw.Draw(prep_grid)
    labels = ["Original Gray", "CLAHE Enhanced", "Canny Edges", "Adaptive Threshold"]
    positions = [(10, 10), (prep_width + 10, 10), (10, prep_height + 10), (prep_width + 10, prep_height + 10)]
    
    for label, pos in zip(labels, positions):
        draw_prep.text(pos, label, fill='black')
    
    prep_grid.save(f"{output_dir}/02_preprocessing.jpg")
    print(f"✅ Saved preprocessing steps to: {output_dir}/02_preprocessing.jpg")
    
    # Summary
    print("\n📊 SEGMENTATION SUMMARY")
    print("="*60)
    print(f"Basic Segmentation:    {len(basic_crops)} cards detected")
    print(f"Advanced Segmentation: {len(advanced_crops)} cards detected")
    print(f"\nOutput saved to: {output_dir}")
    print("\nKey improvements in advanced segmentation:")
    print("✅ Computer vision preprocessing for better edge detection")
    print("✅ Multiple detection methods (contours, Hough lines)")
    print("✅ Hybrid approach combining CV and Gemini validation")
    print("✅ Better handling of rotated and perspective-distorted cards")
    print("✅ More accurate corner detection for perspective correction")
    
    # Quality comparison
    if advanced_crops:
        print("\n🔍 Quality Analysis:")
        for idx, crop in enumerate(advanced_crops[:3]):  # First 3 cards
            print(f"\nCard {idx+1}:")
            print(f"  - Size: {Image.open(io.BytesIO(crop.image_rgb)).size}")
            print(f"  - Perspective corrected: {crop.perspective_corrected}")
            print(f"  - Confidence: {crop.box.confidence:.2f}")


if __name__ == "__main__":
    asyncio.run(test_advanced_segmentation())