#!/usr/bin/env python3
"""Test script to visualize segmentation results and perspective correction."""

import os
import asyncio
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont
import io

from agents.segmenter import SegmenterAgent


async def test_segmentation(image_path: str = "./samples/sample_cards.jpg"):
    """Test the segmentation with visualization."""
    # Load environment variables
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
    
    if not os.getenv("GOOGLE_API_KEY"):
        print("❌ GOOGLE_API_KEY not found. Please set it in your .env file.")
        return
    
    print(f"🔍 Testing segmentation on: {image_path}")
    
    # Initialize segmenter
    segmenter = SegmenterAgent()
    
    # Load original image
    original = Image.open(image_path)
    print(f"📐 Original image size: {original.size}")
    
    # Run segmentation
    try:
        crops = await segmenter(image_path=image_path)
        print(f"✅ Detected {len(crops)} cards")
        
        # Create output directory
        output_dir = "./test_output"
        os.makedirs(output_dir, exist_ok=True)
        
        # Save each crop
        for idx, crop in enumerate(crops):
            # Save the cropped/corrected image
            crop_image = Image.open(io.BytesIO(crop.image_rgb))
            output_path = f"{output_dir}/card_{idx+1}_{'corrected' if crop.perspective_corrected else 'cropped'}.png"
            crop_image.save(output_path)
            
            print(f"\n📸 Card {idx + 1}:")
            print(f"   - Bounding box: ({crop.box.x}, {crop.box.y}, {crop.box.width}x{crop.box.height})")
            print(f"   - Confidence: {crop.box.confidence:.2f}")
            print(f"   - Perspective corrected: {crop.perspective_corrected}")
            if crop.corners:
                print(f"   - Corners detected: {len(crop.corners)} points")
            print(f"   - Saved to: {output_path}")
            print(f"   - Output size: {crop_image.size}")
        
        # Create visualization of original with bounding boxes
        viz = original.copy()
        draw = ImageDraw.Draw(viz)
        
        for idx, crop in enumerate(crops):
            # Draw bounding box
            x1, y1 = crop.box.x, crop.box.y
            x2, y2 = x1 + crop.box.width, y1 + crop.box.height
            
            # Choose color based on perspective correction
            color = "green" if crop.perspective_corrected else "yellow"
            draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
            
            # Draw label
            label = f"Card {idx+1}"
            draw.text((x1 + 5, y1 + 5), label, fill=color)
            
            # Draw corners if available
            if crop.corners:
                for corner in crop.corners:
                    cx = int(corner[0] * original.width)
                    cy = int(corner[1] * original.height)
                    draw.ellipse([cx-5, cy-5, cx+5, cy+5], fill="red", outline="red")
        
        # Save visualization
        viz_path = f"{output_dir}/segmentation_visualization.png"
        viz.save(viz_path)
        print(f"\n🎨 Saved visualization to: {viz_path}")
        
        print("\n✨ Segmentation test complete!")
        print(f"   Check the '{output_dir}' directory for results.")
        
    except Exception as e:
        print(f"❌ Segmentation failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_segmentation())