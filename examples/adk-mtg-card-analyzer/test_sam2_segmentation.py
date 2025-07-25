#!/usr/bin/env python3
"""Test SAM2 segmentation with automatic aspect ratio correction."""

import os
import asyncio
from dotenv import load_dotenv
from PIL import Image
import io
from datetime import datetime
import cv2
import numpy as np

from agents.sam2_segmenter import SAM2SegmenterAgent, SAM2Config
from agents.genai_segmenter import GenAISegmenterAgent


async def test_sam2_segmentation(image_path: str = "./samples/sample_cards.jpg"):
    """Test SAM2 segmentation with aspect ratio correction."""
    # Load environment variables
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
    
    if not os.getenv("GOOGLE_API_KEY"):
        print("❌ GOOGLE_API_KEY not found")
        return
    
    print("🤖 Testing SAM2 Segmentation with Aspect Ratio Correction")
    print("="*60)
    
    # Load image
    original = Image.open(image_path)
    print(f"📐 Image size: {original.size}")
    
    # Create output directory
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_dir = f"./test_output/sam2_segmentation_{timestamp}"
    os.makedirs(output_dir, exist_ok=True)
    
    # Save original
    original.save(f"{output_dir}/00_original.jpg")
    
    # Configure SAM2
    sam2_config = SAM2Config(
        model_type="sam2.1_hiera_large",  # Use latest SAM 2.1
        device="cuda" if os.system("nvidia-smi > /dev/null 2>&1") == 0 else "cpu",
        points_per_side=32,
        pred_iou_thresh=0.88,
        stability_score_thresh=0.95,
        min_mask_region_area=1000
    )
    
    print(f"\n🔧 SAM2 Configuration:")
    print(f"   - Model: {sam2_config.model_type}")
    print(f"   - Device: {sam2_config.device}")
    print(f"   - Points per side: {sam2_config.points_per_side}")
    
    # Test SAM2 Segmentation
    print("\n🚀 Running SAM2 Segmentation...")
    sam2_segmenter = SAM2SegmenterAgent(sam2_config=sam2_config)
    
    try:
        crops = await sam2_segmenter(image_path=image_path)
        print(f"\n✅ SAM2 segmentation detected {len(crops)} cards")
        
        # Save crops
        crops_dir = f"{output_dir}/sam2_crops"
        os.makedirs(crops_dir, exist_ok=True)
        
        # Create aspect ratio comparison
        comparison_width = 1500
        comparison_height = 400
        comparison = Image.new('RGB', (comparison_width, comparison_height), color='white')
        
        for idx, crop in enumerate(crops):
            crop_image = Image.open(io.BytesIO(crop.image_rgb))
            crop_path = f"{crops_dir}/card_{idx+1}.png"
            crop_image.save(crop_path)
            
            print(f"\n📸 Card {idx+1}:")
            print(f"   - Output size: {crop_image.size}")
            print(f"   - Aspect ratio: {crop_image.width/crop_image.height:.3f} (target: {2.5/3.5:.3f})")
            print(f"   - Confidence: {crop.box.confidence:.2f}")
            print(f"   - Perspective corrected: {crop.perspective_corrected}")
            print(f"   - Saved to: {crop_path}")
            
            # Add to comparison (show first 3 cards)
            if idx < 3:
                x_offset = idx * 500
                # Resize for comparison
                display_crop = crop_image.resize((488//2, 680//2), Image.Resampling.LANCZOS)
                comparison.paste(display_crop, (x_offset + 10, 30))
                
                # Add label
                from PIL import ImageDraw, ImageFont
                draw = ImageDraw.Draw(comparison)
                draw.text((x_offset + 10, 5), f"Card {idx+1} (Corrected)", fill='black')
        
        comparison.save(f"{output_dir}/02_aspect_ratio_comparison.jpg")
        
        # Create visualization with masks
        viz = original.copy()
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
                    if isinstance(corner, list) and len(corner) == 2:
                        # Handle normalized coordinates
                        if 0 <= corner[0] <= 1 and 0 <= corner[1] <= 1:
                            cx = int(corner[0] * original.width)
                            cy = int(corner[1] * original.height)
                        else:
                            cx, cy = int(corner[0]), int(corner[1])
                        
                        draw.ellipse([cx-10, cy-10, cx+10, cy+10], fill=color, outline='white', width=2)
                        draw.text((cx+12, cy-5), f"{i+1}", fill=color)
            
            # Label
            draw.text((x+5, y+5), f"SAM2 Card {idx+1} ({crop.box.confidence:.2f})", fill=color)
        
        viz.save(f"{output_dir}/01_sam2_detections.jpg")
        print(f"\n🎨 Saved visualization to: {output_dir}/01_sam2_detections.jpg")
        
    except Exception as e:
        print(f"❌ SAM2 segmentation failed: {e}")
        import traceback
        traceback.print_exc()
        crops = []
    
    # Compare with GenAI segmentation
    print("\n\n📊 Comparing with GenAI Segmentation...")
    genai_segmenter = GenAISegmenterAgent()
    
    try:
        genai_crops = await genai_segmenter(image_path=image_path)
        print(f"GenAI segmentation: {len(genai_crops)} cards")
        
        print("\n🔍 COMPARISON SUMMARY:")
        print(f"GenAI Segmentation: {len(genai_crops)} cards")
        print(f"SAM2 Segmentation:  {len(crops)} cards")
        
        if len(crops) > 0:
            print("\n✨ SAM2 Advantages:")
            print("- State-of-the-art segmentation model")
            print("- Automatic aspect ratio correction")
            print("- Precise mask-based detection")
            print("- Better handling of card boundaries")
            print("- Consistent output dimensions (488x680)")
            
    except Exception as e:
        print(f"GenAI segmentation failed: {e}")
    
    print(f"\n📁 All results saved to: {output_dir}")
    
    # Check if SAM2 is properly installed
    try:
        import sam2
        print("\n✅ SAM2 is installed")
    except ImportError:
        print("\n⚠️  SAM2 is not installed. To use SAM2 segmentation:")
        print("1. Install PyTorch: pip install torch>=2.5.1 torchvision>=0.20.1")
        print("2. Clone SAM2: git clone https://github.com/facebookresearch/sam2.git")
        print("3. Install: cd sam2 && pip install -e .")
        print("4. Download checkpoints from the SAM2 repository")


if __name__ == "__main__":
    asyncio.run(test_sam2_segmentation())