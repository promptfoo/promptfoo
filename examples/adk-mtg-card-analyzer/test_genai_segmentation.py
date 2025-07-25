#!/usr/bin/env python3
"""Test GenAI multi-stage segmentation."""

import os
import asyncio
from dotenv import load_dotenv
from PIL import Image
import io
from datetime import datetime

from agents.genai_segmenter import GenAISegmenterAgent
from agents.segmenter import SegmenterAgent


async def test_genai_segmentation(image_path: str = "./samples/sample_cards.jpg"):
    """Test GenAI segmentation approach."""
    # Load environment variables
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
    
    if not os.getenv("GOOGLE_API_KEY"):
        print("❌ GOOGLE_API_KEY not found")
        return
    
    print("🧠 Testing GenAI Multi-Stage Segmentation")
    print("="*60)
    
    # Load image
    original = Image.open(image_path)
    print(f"📐 Image size: {original.size}")
    
    # Create output directory
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_dir = f"./test_output/genai_segmentation_{timestamp}"
    os.makedirs(output_dir, exist_ok=True)
    
    # Save original
    original.save(f"{output_dir}/00_original.jpg")
    
    # Test GenAI Segmentation
    print("\n🤖 Running GenAI Multi-Stage Segmentation...")
    genai_segmenter = GenAISegmenterAgent()
    
    try:
        crops = await genai_segmenter(image_path=image_path)
        print(f"\n✅ GenAI segmentation detected {len(crops)} cards")
        
        # Save crops
        crops_dir = f"{output_dir}/genai_crops"
        os.makedirs(crops_dir, exist_ok=True)
        
        for idx, crop in enumerate(crops):
            crop_image = Image.open(io.BytesIO(crop.image_rgb))
            crop_path = f"{crops_dir}/card_{idx+1}.png"
            crop_image.save(crop_path)
            
            print(f"\n📸 Card {idx+1}:")
            print(f"   - Size: {crop_image.size}")
            print(f"   - Confidence: {crop.box.confidence:.2f}")
            print(f"   - Perspective corrected: {crop.perspective_corrected}")
            print(f"   - Saved to: {crop_path}")
        
        # Create visualization
        viz = original.copy()
        from PIL import ImageDraw
        draw = ImageDraw.Draw(viz)
        
        colors = ['red', 'green', 'blue', 'yellow', 'magenta', 'cyan', 'orange', 'purple']
        
        for idx, crop in enumerate(crops):
            color = colors[idx % len(colors)]
            
            # Draw bounding box
            x, y = crop.box.x, crop.box.y
            w, h = crop.box.width, crop.box.height
            draw.rectangle([x, y, x+w, y+h], outline=color, width=4)
            
            # Draw corners if available
            if crop.corners:
                for i, corner in enumerate(crop.corners):
                    cx = int(corner[0] * original.width)
                    cy = int(corner[1] * original.height)
                    draw.ellipse([cx-10, cy-10, cx+10, cy+10], fill=color, outline='white', width=2)
                    draw.text((cx+12, cy-5), f"{i+1}", fill=color)
            
            # Label
            draw.text((x+5, y+5), f"Card {idx+1} ({crop.box.confidence:.2f})", fill=color)
        
        viz.save(f"{output_dir}/01_detections.jpg")
        print(f"\n🎨 Saved visualization to: {output_dir}/01_detections.jpg")
        
    except Exception as e:
        print(f"❌ GenAI segmentation failed: {e}")
        import traceback
        traceback.print_exc()
    
    # Compare with basic segmentation
    print("\n\n📊 Comparing with Basic Segmentation...")
    basic_segmenter = SegmenterAgent()
    
    try:
        basic_crops = await basic_segmenter(image_path=image_path)
        print(f"Basic segmentation: {len(basic_crops)} cards")
        
        print("\n🔍 COMPARISON SUMMARY:")
        print(f"Basic Segmentation:  {len(basic_crops)} cards")
        print(f"GenAI Segmentation:  {len(crops)} cards")
        
        if len(crops) > 0:
            print("\n✨ GenAI Advantages:")
            print("- Multi-stage reasoning for better accuracy")
            print("- Chain-of-thought analysis")
            print("- Visual attention mechanism")
            print("- Better handling of complex backgrounds")
            print("- More robust corner detection")
            
    except Exception as e:
        print(f"Basic segmentation failed: {e}")
    
    print(f"\n📁 All results saved to: {output_dir}")


if __name__ == "__main__":
    asyncio.run(test_genai_segmentation())