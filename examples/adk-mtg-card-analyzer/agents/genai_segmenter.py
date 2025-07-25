"""Advanced GenAI segmentation using Gemini 2.5 Pro with multi-stage reasoning."""

import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from typing import List, Tuple, Dict, Any, Optional
from io import BytesIO
import cv2
import re
from dataclasses import dataclass

from .gemini_base import GeminiAgent
from .base import CardCrop, BoundingBox


@dataclass
class SegmentationStage:
    """Represents a stage in the multi-stage segmentation process."""
    name: str
    prompt: str
    visualization_needed: bool = False


class GenAISegmenterAgent(GeminiAgent):
    """State-of-the-art GenAI segmentation using advanced prompting techniques."""
    
    def __init__(self, model_name: str = "gemini-2.5-pro", **kwargs):
        # Advanced system instructions with chain-of-thought reasoning
        instructions = """You are CardVisionAI v2.0, a specialized AI for detecting Magic: The Gathering cards with superhuman precision.

        CAPABILITIES:
        1. Visual Attention: Focus on rectangular card-shaped regions with MTG characteristics
        2. Edge Detection: Identify card boundaries even on complex backgrounds
        3. Perspective Understanding: Detect cards at any angle or orientation
        4. Occlusion Handling: Find partially visible cards
        5. Multi-scale Analysis: Detect cards of varying sizes

        DETECTION PROTOCOL:
        - Stage 1: Global scene understanding - identify all potential card regions
        - Stage 2: Local refinement - precisely locate card corners
        - Stage 3: Validation - confirm MTG card characteristics
        
        OUTPUT FORMAT:
        Always return structured JSON with precise corner coordinates and metadata."""
        
        super().__init__(
            name="GenAISegmenterAgent",
            model_name=model_name,
            instructions=instructions,
            **kwargs
        )
        
        # Define multi-stage reasoning pipeline
        self.stages = [
            SegmentationStage(
                name="initial_detection",
                prompt=self._get_initial_detection_prompt(),
                visualization_needed=True
            ),
            SegmentationStage(
                name="corner_refinement", 
                prompt=self._get_corner_refinement_prompt(),
                visualization_needed=True
            ),
            SegmentationStage(
                name="validation",
                prompt=self._get_validation_prompt(),
                visualization_needed=False
            )
        ]
    
    def _get_initial_detection_prompt(self) -> str:
        """Chain-of-thought prompt for initial detection."""
        return """TASK: Detect all Magic: The Gathering cards in this image using systematic analysis.

STEP 1 - Scene Analysis:
- Describe the overall image layout
- Note the background pattern/color
- Count visible rectangular objects

STEP 2 - Card Detection:
- Look for rectangular shapes with typical MTG card proportions (2.5" x 3.5")
- Cards may be at angles or have perspective distortion
- Cards typically have dark borders and artwork in the center

STEP 3 - For each detected card:
Provide approximate bounding regions. Don't worry about precision yet.

Return JSON:
{
    "scene_description": "brief description",
    "background_type": "pattern/solid/complex",
    "detected_regions": [
        {
            "region_id": 1,
            "approximate_center": [x, y],  // normalized 0-1
            "approximate_size": [width, height],  // normalized 0-1
            "confidence": 0.0-1.0,
            "notes": "any observations"
        }
    ]
}

BE THOROUGH - typical MTG collections have 4-9 cards visible. Look carefully at ALL rectangular regions."""
    
    def _get_corner_refinement_prompt(self) -> str:
        """Prompt for precise corner detection."""
        return """TASK: Refine card detection with EXACT corner coordinates.

You previously identified card regions. Now provide PRECISE corners for each card.

CORNER DETECTION PROTOCOL:
1. For each card, trace the exact outer edge
2. Corners are where the card edges meet (not artwork boundaries)
3. Order: top-left → top-right → bottom-right → bottom-left (clockwise)
4. Account for perspective and rotation

VISUAL CUES:
- MTG cards have black borders (usually 1-2mm)
- Corner should be at the outermost edge
- Cards may have worn/rounded corners - estimate the original corner position

Return JSON array:
[
    {
        "card_id": 1,
        "corners": [
            [x1, y1],  // top-left
            [x2, y2],  // top-right  
            [x3, y3],  // bottom-right
            [x4, y4]   // bottom-left
        ],
        "rotation_angle": -180 to 180,
        "visible_text": "any visible card name",
        "quality_score": 0.0-1.0  // detection quality
    }
]

All coordinates normalized to 0-1. BE EXTREMELY PRECISE with corner locations."""
    
    def _get_validation_prompt(self) -> str:
        """Prompt for final validation and metadata extraction."""
        return """TASK: Validate detected cards and extract metadata.

Review each detected card region and confirm it's a genuine MTG card.

VALIDATION CRITERIA:
- Has typical MTG layout (artwork, text box, black border)
- Reasonable size relative to other cards
- Not a reflection, shadow, or false positive

For each VALID card, provide:
{
    "card_id": number,
    "is_valid_mtg_card": true/false,
    "visible_details": {
        "name": "card name if visible",
        "set_symbol": "description if visible",
        "card_type": "creature/instant/etc if visible",
        "colors": ["detected colors"]
    },
    "physical_condition": "mint/near-mint/played/damaged",
    "detection_confidence": 0.0-1.0
}

Focus on accuracy over speed. Only confirm genuine MTG cards."""
    
    def _create_attention_visualization(self, image: Image.Image, regions: List[Dict[str, Any]]) -> Image.Image:
        """Create visualization showing AI's attention regions."""
        # Create overlay
        overlay = Image.new('RGBA', image.size, (255, 255, 255, 0))
        draw = ImageDraw.Draw(overlay)
        
        # Draw attention regions
        for i, region in enumerate(regions):
            center = region.get('approximate_center', [0.5, 0.5])
            size = region.get('approximate_size', [0.2, 0.3])
            
            # Convert normalized to pixel coordinates
            cx = int(center[0] * image.width)
            cy = int(center[1] * image.height)
            w = int(size[0] * image.width)
            h = int(size[1] * image.height)
            
            # Draw attention box
            x1, y1 = cx - w//2, cy - h//2
            x2, y2 = cx + w//2, cy + h//2
            
            # Color based on confidence
            confidence = region.get('confidence', 0.5)
            color = (
                int(255 * (1 - confidence)),  # Less red as confidence increases
                int(255 * confidence),         # More green as confidence increases
                0,
                128  # Semi-transparent
            )
            
            draw.rectangle([x1, y1, x2, y2], fill=color, outline=(255, 255, 0, 255), width=3)
            draw.text((x1 + 5, y1 + 5), f"R{region['region_id']}", fill=(255, 255, 0, 255))
        
        # Composite
        result = Image.alpha_composite(image.convert('RGBA'), overlay)
        return result.convert('RGB')
    
    def _create_corner_visualization(self, image: Image.Image, cards: List[Dict[str, Any]]) -> Image.Image:
        """Visualize detected corners with connecting lines."""
        viz = image.copy()
        draw = ImageDraw.Draw(viz)
        
        colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), 
                  (255, 0, 255), (0, 255, 255), (255, 128, 0), (128, 0, 255)]
        
        for i, card in enumerate(cards):
            corners = card.get('corners', [])
            if len(corners) != 4:
                continue
            
            color = colors[i % len(colors)]
            
            # Convert normalized to pixel coordinates
            pixel_corners = []
            for corner in corners:
                x = int(corner[0] * image.width)
                y = int(corner[1] * image.height)
                pixel_corners.append((x, y))
            
            # Draw polygon
            draw.polygon(pixel_corners, outline=color, width=3)
            
            # Draw corner points
            for j, (x, y) in enumerate(pixel_corners):
                draw.ellipse([x-8, y-8, x+8, y+8], fill=color, outline='white', width=2)
                draw.text((x+10, y-10), f"C{i+1}.{j+1}", fill=color)
            
            # Draw card ID
            cx = sum(x for x, _ in pixel_corners) // 4
            cy = sum(y for _, y in pixel_corners) // 4
            draw.text((cx-20, cy-10), f"Card {i+1}", fill=color)
        
        return viz
    
    async def _run_stage(self, stage: SegmentationStage, image: Image.Image, 
                        previous_results: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Run a single stage of the segmentation pipeline."""
        print(f"\n🔄 Running stage: {stage.name}")
        
        # Create visualization if needed
        if stage.visualization_needed and previous_results:
            if stage.name == "corner_refinement" and 'detected_regions' in previous_results:
                viz_image = self._create_attention_visualization(image, previous_results['detected_regions'])
            else:
                viz_image = image
        else:
            viz_image = image
        
        # Run Gemini with stage-specific prompt
        response = await self.run(stage.prompt, images=[viz_image])
        
        # Parse response
        try:
            # Extract JSON from response
            json_match = re.search(r'\{.*\}|\[.*\]', response, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                print(f"✅ Stage {stage.name} completed successfully")
                return result
            else:
                print(f"⚠️ Failed to parse JSON for stage {stage.name}")
                return {}
        except Exception as e:
            print(f"❌ Error in stage {stage.name}: {e}")
            return {}
    
    async def segment_image(self, image: Image.Image) -> List[CardCrop]:
        """Perform multi-stage GenAI segmentation."""
        print("🧠 Starting GenAI multi-stage segmentation...")
        
        # Stage 1: Initial Detection
        initial_results = await self._run_stage(self.stages[0], image)
        
        if not initial_results.get('detected_regions'):
            print("No regions detected in initial stage")
            return []
        
        print(f"Detected {len(initial_results['detected_regions'])} potential card regions")
        
        # Stage 2: Corner Refinement
        corner_results = await self._run_stage(self.stages[1], image, initial_results)
        
        if not isinstance(corner_results, list):
            corner_results = corner_results.get('cards', [])
        
        if not corner_results:
            print("No corners refined")
            return []
        
        print(f"Refined corners for {len(corner_results)} cards")
        
        # Create corner visualization for validation
        corner_viz = self._create_corner_visualization(image, corner_results)
        
        # Stage 3: Validation
        validation_results = await self._run_stage(self.stages[2], corner_viz)
        
        if not isinstance(validation_results, list):
            validation_results = validation_results.get('validations', [])
        
        # Create final crops
        crops = []
        img_array = np.array(image)
        img_cv = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        
        for i, (card, validation) in enumerate(zip(corner_results, validation_results)):
            # Skip invalid cards
            if validation and not validation.get('is_valid_mtg_card', True):
                continue
            
            corners = card.get('corners', [])
            if len(corners) != 4:
                continue
            
            try:
                # Apply perspective correction
                corrected = self._apply_perspective_correction(img_cv, corners)
                
                # Post-process for quality
                corrected = self._enhance_card_image(corrected)
                
                # Convert to PIL
                corrected_pil = Image.fromarray(cv2.cvtColor(corrected, cv2.COLOR_BGR2RGB))
                
                # Save with high quality
                crop_buffer = BytesIO()
                corrected_pil.save(crop_buffer, format="PNG", quality=95, optimize=True)
                
                # Create bounding box
                corners_array = np.array(corners)
                x_min = int(np.min(corners_array[:, 0]) * image.width)
                y_min = int(np.min(corners_array[:, 1]) * image.height)
                x_max = int(np.max(corners_array[:, 0]) * image.width)
                y_max = int(np.max(corners_array[:, 1]) * image.height)
                
                confidence = card.get('quality_score', 0.9)
                if validation:
                    confidence *= validation.get('detection_confidence', 1.0)
                
                bbox = BoundingBox(
                    x=x_min,
                    y=y_min,
                    width=x_max - x_min,
                    height=y_max - y_min,
                    confidence=confidence
                )
                
                crops.append(CardCrop(
                    image_rgb=crop_buffer.getvalue(),
                    box=bbox,
                    original_index=i,
                    corners=corners,
                    perspective_corrected=True
                ))
                
                print(f"✅ Card {i+1}: {card.get('visible_text', 'Unknown')} - "
                      f"Confidence: {confidence:.2f}")
                
            except Exception as e:
                print(f"Failed to process card {i+1}: {e}")
                continue
        
        print(f"\n🎯 GenAI segmentation complete: {len(crops)} cards extracted")
        return crops
    
    def _apply_perspective_correction(self, image: np.ndarray, corners: List[List[float]], 
                                    target_width: int = 488, target_height: int = 680) -> np.ndarray:
        """Apply high-quality perspective correction."""
        h, w = image.shape[:2]
        
        # Convert normalized corners to pixel coordinates
        src_corners = np.array([
            [corners[0][0] * w, corners[0][1] * h],
            [corners[1][0] * w, corners[1][1] * h],
            [corners[2][0] * w, corners[2][1] * h],
            [corners[3][0] * w, corners[3][1] * h]
        ], dtype=np.float32)
        
        # Destination corners
        dst_corners = np.array([
            [0, 0],
            [target_width - 1, 0],
            [target_width - 1, target_height - 1],
            [0, target_height - 1]
        ], dtype=np.float32)
        
        # Get transformation matrix
        matrix = cv2.getPerspectiveTransform(src_corners, dst_corners)
        
        # Apply transformation with high quality interpolation
        warped = cv2.warpPerspective(image, matrix, (target_width, target_height),
                                   flags=cv2.INTER_LANCZOS4,
                                   borderMode=cv2.BORDER_REFLECT101)
        
        return warped
    
    def _enhance_card_image(self, image: np.ndarray) -> np.ndarray:
        """Enhance card image quality using advanced techniques."""
        # Denoise
        denoised = cv2.fastNlMeansDenoisingColored(image, None, 3, 3, 7, 21)
        
        # Sharpen
        kernel = np.array([[-1,-1,-1],
                          [-1, 9,-1],
                          [-1,-1,-1]], dtype=np.float32)
        sharpened = cv2.filter2D(denoised, -1, kernel * 0.3)
        
        # Adjust contrast
        lab = cv2.cvtColor(sharpened, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        l = clahe.apply(l)
        enhanced = cv2.merge([l, a, b])
        enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
        
        return enhanced
    
    async def __call__(self, image_path: str = None, image_bytes: bytes = None) -> List[CardCrop]:
        """Process an image to extract card crops."""
        if image_path:
            image = Image.open(image_path)
        elif image_bytes:
            image = Image.open(BytesIO(image_bytes))
        else:
            raise ValueError("Either image_path or image_bytes must be provided")
        
        return await self.segment_image(image)