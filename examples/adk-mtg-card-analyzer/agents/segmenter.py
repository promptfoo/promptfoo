"""Segmentation agent using Gemini 2.5 Pro vision capabilities with perspective correction."""

import json
import cv2
import numpy as np
from PIL import Image
from typing import List, Tuple, Optional
from io import BytesIO
import re

from .gemini_base import GeminiAgent
from .base import CardCrop, BoundingBox


class SegmenterAgent(GeminiAgent):
    """Agent for segmenting cards from images using Gemini 2.5 Pro."""
    
    def __init__(self, model_name: str = "gemini-2.5-pro", **kwargs):
        instructions = """You are an expert at detecting and segmenting Magic: The Gathering cards in images with precise corner detection.
        
        Your task is to:
        1. Identify ALL Magic: The Gathering cards visible in the image
        2. For each card, provide BOTH bounding box AND the four corner points
        3. Handle various card orientations, perspective distortions, and lighting conditions
        4. Detect cards even if they're at an angle or have perspective distortion
        5. Ignore non-MTG items like sleeves, playmats, or other objects
        
        Return a JSON response with this EXACT structure:
        {
            "detections": [
                {
                    "box_2d": [x_min, y_min, x_max, y_max],
                    "corners": [
                        [x1, y1],  // top-left corner
                        [x2, y2],  // top-right corner
                        [x3, y3],  // bottom-right corner
                        [x4, y4]   // bottom-left corner
                    ],
                    "label": "MTG Card 1",
                    "confidence": 0.95,
                    "rotation_angle": 0.0,  // degrees of rotation from vertical
                    "perspective_score": 0.8  // 0-1 score of how much perspective distortion
                }
            ],
            "total_cards": 3,
            "notes": "Any relevant observations about card conditions or layout"
        }
        
        Important guidelines:
        - All coordinates should be normalized (0.0 to 1.0) relative to image dimensions
        - Corner points should be ordered: top-left, top-right, bottom-right, bottom-left
        - Be extremely precise with corner detection - they should match the actual card corners
        - Include cards that are at least 60% visible
        - Detect cards even if they're rotated or have perspective distortion
        - Sort detections from top-left to bottom-right based on center point"""
        
        super().__init__(
            name="CardSegmenterAgent",
            model_name=model_name,
            instructions=instructions,
            **kwargs
        )
    
    def _apply_perspective_correction(self, image: np.ndarray, corners: List[List[float]], 
                                    target_width: int = 488, target_height: int = 680) -> np.ndarray:
        """Apply perspective correction to extract a card with proper dimensions.
        
        Args:
            image: Input image as numpy array
            corners: Four corner points (normalized)
            target_width: Target width for MTG card (standard is 2.5 inches = 488 pixels at ~195 DPI)
            target_height: Target height for MTG card (standard is 3.5 inches = 680 pixels at ~195 DPI)
        """
        h, w = image.shape[:2]
        
        # Denormalize corner points
        src_corners = np.array([
            [corners[0][0] * w, corners[0][1] * h],  # top-left
            [corners[1][0] * w, corners[1][1] * h],  # top-right
            [corners[2][0] * w, corners[2][1] * h],  # bottom-right
            [corners[3][0] * w, corners[3][1] * h]   # bottom-left
        ], dtype=np.float32)
        
        # Define destination corners for standard card dimensions
        dst_corners = np.array([
            [0, 0],                          # top-left
            [target_width - 1, 0],           # top-right
            [target_width - 1, target_height - 1],  # bottom-right
            [0, target_height - 1]           # bottom-left
        ], dtype=np.float32)
        
        # Calculate perspective transform matrix
        matrix = cv2.getPerspectiveTransform(src_corners, dst_corners)
        
        # Apply perspective warp
        warped = cv2.warpPerspective(image, matrix, (target_width, target_height), 
                                   flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        
        return warped
    
    def _enhance_card_edges(self, image: np.ndarray) -> np.ndarray:
        """Enhance card edges for better boundary detection."""
        # Convert to grayscale for edge detection
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        # Apply CLAHE for better contrast
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        enhanced = clahe.apply(gray)
        
        # Apply bilateral filter to reduce noise while keeping edges sharp
        denoised = cv2.bilateralFilter(enhanced, 9, 75, 75)
        
        # Convert back to color
        if len(image.shape) == 3:
            return cv2.cvtColor(denoised, cv2.COLOR_GRAY2BGR)
        return denoised
    
    async def segment_image(self, image: Image.Image) -> List[CardCrop]:
        """Segment cards from an image using Gemini 2.5 Pro with perspective correction."""
        prompt = """Detect and segment all Magic: The Gathering cards in this image.
        
        For each card, provide:
        1. Precise bounding box coordinates
        2. The EXACT four corner points of the card
        3. Rotation angle and perspective distortion score
        
        Be extremely accurate with corner detection - trace the actual card edges.
        Return ONLY valid JSON."""
        
        try:
            # Run Gemini with the image
            response = await self.run(prompt, images=[image])
            
            # Try to parse JSON from response
            try:
                result = json.loads(response)
            except:
                # If response isn't pure JSON, try to extract it
                json_match = re.search(r'\{.*\}', response, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group())
                else:
                    result = {"detections": []}
            
            # Convert PIL image to OpenCV format
            img_array = np.array(image)
            if len(img_array.shape) == 2:  # Grayscale
                img_cv = cv2.cvtColor(img_array, cv2.COLOR_GRAY2BGR)
            else:  # RGB
                img_cv = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
            
            # Process detections
            crops = []
            detections = result.get("detections", [])
            
            for idx, detection in enumerate(detections):
                # Extract bounding box (denormalize coordinates)
                box_2d = detection.get("box_2d", [0, 0, 1, 1])
                x_min = int(box_2d[0] * image.width)
                y_min = int(box_2d[1] * image.height)
                x_max = int(box_2d[2] * image.width)
                y_max = int(box_2d[3] * image.height)
                
                # Create bounding box
                bbox = BoundingBox(
                    x=x_min,
                    y=y_min,
                    width=x_max - x_min,
                    height=y_max - y_min,
                    confidence=detection.get("confidence", 0.9)
                )
                
                # Check if we have corner points for perspective correction
                corners = detection.get("corners")
                
                if corners and len(corners) == 4:
                    # Apply perspective correction
                    try:
                        # Apply perspective correction
                        corrected = self._apply_perspective_correction(img_cv, corners)
                        
                        # Enhance edges for better quality
                        enhanced = self._enhance_card_edges(corrected)
                        
                        # Convert back to PIL Image
                        corrected_pil = Image.fromarray(cv2.cvtColor(enhanced, cv2.COLOR_BGR2RGB))
                        
                        # Convert to bytes
                        crop_buffer = BytesIO()
                        corrected_pil.save(crop_buffer, format="PNG", quality=95)
                        crop_bytes = crop_buffer.getvalue()
                        
                        print(f"Applied perspective correction to card {idx + 1}")
                        
                    except Exception as e:
                        print(f"Failed to apply perspective correction: {e}")
                        # Fall back to regular cropping
                        corners = None
                
                if not corners:
                    # Fallback: Extract crop with slight padding for regular bounding box
                    padding = 5  # Reduced padding for tighter crops
                    x1 = max(0, x_min - padding)
                    y1 = max(0, y_min - padding)
                    x2 = min(image.width, x_max + padding)
                    y2 = min(image.height, y_max + padding)
                    
                    # Crop image
                    crop = image.crop((x1, y1, x2, y2))
                    
                    # Convert to bytes
                    crop_buffer = BytesIO()
                    crop.save(crop_buffer, format="PNG", quality=95)
                    crop_bytes = crop_buffer.getvalue()
                
                crops.append(CardCrop(
                    image_rgb=crop_bytes,
                    box=bbox,
                    original_index=idx,
                    corners=corners if corners else None,
                    perspective_corrected=bool(corners and len(corners) == 4)
                ))
            
            print(f"Detected {len(crops)} cards")
            return crops
            
        except Exception as e:
            print(f"Error in segmentation: {e}")
            # Fallback: return entire image as single crop
            buffer = BytesIO()
            image.save(buffer, format="PNG")
            
            return [CardCrop(
                image_rgb=buffer.getvalue(),
                box=BoundingBox(
                    x=0,
                    y=0,
                    width=image.width,
                    height=image.height,
                    confidence=0.5
                ),
                original_index=0
            )]
    
    async def __call__(self, image_path: str = None, image_bytes: bytes = None) -> List[CardCrop]:
        """Process an image to extract card crops."""
        if image_path:
            image = Image.open(image_path)
        elif image_bytes:
            image = Image.open(BytesIO(image_bytes))
        else:
            raise ValueError("Either image_path or image_bytes must be provided")
        
        return await self.segment_image(image)