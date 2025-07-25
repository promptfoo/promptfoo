"""Segmentation agent using Gemini 2.5 Pro vision capabilities."""

import json
from PIL import Image
from typing import List
from io import BytesIO
import re

from .gemini_base import GeminiAgent
from .base import CardCrop, BoundingBox


class SegmenterAgent(GeminiAgent):
    """Agent for segmenting cards from images using Gemini 2.5 Pro."""
    
    def __init__(self, model_name: str = "gemini-2.5-pro", **kwargs):
        instructions = """You are an expert at detecting and segmenting Magic: The Gathering cards in images.
        
        Your task is to:
        1. Identify ALL Magic: The Gathering cards visible in the image
        2. For each card, provide precise bounding box coordinates
        3. Handle various card orientations, overlapping cards, and different lighting conditions
        4. Ignore non-MTG items like sleeves, playmats, or other objects
        
        Return a JSON response with this EXACT structure:
        {
            "detections": [
                {
                    "box_2d": [x_min, y_min, x_max, y_max],
                    "label": "MTG Card 1",
                    "confidence": 0.95
                }
            ],
            "total_cards": 3,
            "notes": "Any relevant observations about card conditions or layout"
        }
        
        Important guidelines:
        - Coordinates should be normalized (0.0 to 1.0) relative to image dimensions
        - Only include cards that are at least 70% visible
        - Sort detections from top-left to bottom-right
        - If no cards are found, return empty detections array
        - Be precise with bounding boxes - they should tightly fit the card edges"""
        
        super().__init__(
            name="CardSegmenterAgent",
            model_name=model_name,
            instructions=instructions,
            **kwargs
        )
    
    async def segment_image(self, image: Image.Image) -> List[CardCrop]:
        """Segment cards from an image using Gemini 2.5 Pro."""
        prompt = """Detect and segment all Magic: The Gathering cards in this image.
        
        Provide precise bounding boxes for each card. Return ONLY valid JSON."""
        
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
                
                # Extract crop with padding
                padding = 10
                x1 = max(0, x_min - padding)
                y1 = max(0, y_min - padding)
                x2 = min(image.width, x_max + padding)
                y2 = min(image.height, y_max + padding)
                
                # Crop image
                crop = image.crop((x1, y1, x2, y2))
                
                # Convert to bytes
                crop_buffer = BytesIO()
                crop.save(crop_buffer, format="PNG")
                crop_bytes = crop_buffer.getvalue()
                
                crops.append(CardCrop(
                    image_rgb=crop_bytes,
                    box=bbox,
                    original_index=idx
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