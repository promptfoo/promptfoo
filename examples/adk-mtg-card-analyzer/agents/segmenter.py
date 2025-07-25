"""Segmentation agent using Gemini 2.5 Pro vision capabilities."""

import base64
import json
from PIL import Image
from typing import List, Dict, Any
from io import BytesIO

from google.adk import Agent
from google.adk.generative_models import GenerativeModel

from .base import CardCrop, BoundingBox


class SegmenterAgent(Agent):
    """Agent for segmenting cards from images using Gemini 2.5 Pro."""
    
    def __init__(self, model_name: str = "gemini-2.5-pro", **kwargs):
        # Initialize with Gemini model
        model = GenerativeModel(model_name)
        
        super().__init__(
            name="CardSegmenterAgent",
            model=model,
            description="Segments Magic: The Gathering cards from images",
            instructions="""You are an expert at detecting and segmenting Magic: The Gathering cards in images.
            
            Your task is to:
            1. Identify ALL Magic: The Gathering cards visible in the image
            2. For each card, provide precise bounding box coordinates and segmentation mask
            3. Handle various card orientations, overlapping cards, and different lighting conditions
            4. Ignore non-MTG items like sleeves, playmats, or other objects
            
            Return a JSON response with this EXACT structure:
            {
                "detections": [
                    {
                        "box_2d": [x_min, y_min, x_max, y_max],
                        "label": "MTG Card 1",
                        "confidence": 0.95,
                        "mask": "base64_encoded_png_mask"
                    }
                ],
                "total_cards": 3,
                "notes": "Any relevant observations about card conditions or layout"
            }
            
            Important guidelines:
            - Coordinates should be normalized (0.0 to 1.0)
            - Only include cards that are at least 70% visible
            - Sort detections from top-left to bottom-right
            - If no cards are found, return empty detections array
            - Be precise with bounding boxes - they should tightly fit the card edges""",
            **kwargs
        )
    
    async def segment_image(self, image: Image.Image) -> List[CardCrop]:
        """Segment cards from an image using Gemini 2.5 Pro."""
        # Convert image to base64
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        # Create prompt
        prompt = f"""Detect and segment all Magic: The Gathering cards in this image.
        
        <image>data:image/png;base64,{image_base64}</image>
        
        Provide precise bounding boxes and segmentation masks for each card."""
        
        try:
            # Get Gemini's response
            response = await self.run(prompt)
            result = json.loads(response)
            
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