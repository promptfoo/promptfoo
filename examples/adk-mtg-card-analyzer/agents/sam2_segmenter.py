"""SAM2 (Segment Anything Model 2) segmentation agent for high-quality card detection."""

import os
import cv2
import numpy as np
from PIL import Image
from typing import List, Dict, Any, Optional, Tuple
from io import BytesIO
import torch
from dataclasses import dataclass

from .gemini_base import GeminiAgent
from .base import CardCrop, BoundingBox


@dataclass
class SAM2Config:
    """Configuration for SAM2 model."""
    model_type: str = "sam2.1_hiera_large"  # Latest SAM 2.1 model
    checkpoint_path: Optional[str] = None
    device: str = "cuda" if torch.cuda.is_available() else "cpu"
    points_per_side: int = 32  # For automatic mask generation
    pred_iou_thresh: float = 0.88
    stability_score_thresh: float = 0.95
    min_mask_region_area: int = 1000  # Minimum area for valid masks


class SAM2SegmenterAgent(GeminiAgent):
    """Advanced segmentation using SAM2 with automatic aspect ratio correction."""
    
    def __init__(self, model_name: str = "gemini-2.5-pro", sam2_config: Optional[SAM2Config] = None, **kwargs):
        # Gemini instructions for validation
        instructions = """You are a card validation expert. Given segmentation masks from SAM2, you must:
        1. Identify which masks correspond to Magic: The Gathering cards
        2. Validate that the detected regions are actual cards (not reflections, shadows, or other objects)
        3. Provide corner refinement if needed
        
        Return JSON with:
        {
            "mask_validations": [
                {
                    "mask_id": 0,
                    "is_mtg_card": true/false,
                    "confidence": 0.0-1.0,
                    "refined_corners": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] or null,
                    "notes": "any observations"
                }
            ]
        }"""
        
        super().__init__(
            name="SAM2SegmenterAgent",
            model_name=model_name,
            instructions=instructions,
            **kwargs
        )
        
        self.config = sam2_config or SAM2Config()
        self.sam2_model = None
        self.predictor = None
        self._initialize_sam2()
    
    def _initialize_sam2(self):
        """Initialize SAM2 model."""
        try:
            # Import SAM2 components
            from sam2.build_sam import build_sam2
            from sam2.sam2_image_predictor import SAM2ImagePredictor
            from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
            
            print(f"Initializing SAM2 model: {self.config.model_type}")
            
            # Build SAM2 model
            if self.config.checkpoint_path and os.path.exists(self.config.checkpoint_path):
                checkpoint = self.config.checkpoint_path
            else:
                # Use default checkpoint path
                checkpoint = f"checkpoints/{self.config.model_type}.pth"
                
                # Download checkpoint if not exists
                if not os.path.exists(checkpoint):
                    os.makedirs("checkpoints", exist_ok=True)
                    print(f"Downloading SAM2 checkpoint: {self.config.model_type}")
                    # In production, implement checkpoint download logic
                    # For now, assume checkpoint is available
            
            # Load model configuration
            model_cfg = self.config.model_type.replace("sam2.1_", "configs/sam2.1/")
            model_cfg = f"{model_cfg}.yaml"
            
            # Build model
            self.sam2_model = build_sam2(
                config_file=model_cfg,
                ckpt_path=checkpoint,
                device=self.config.device
            )
            
            # Create automatic mask generator
            self.mask_generator = SAM2AutomaticMaskGenerator(
                model=self.sam2_model,
                points_per_side=self.config.points_per_side,
                pred_iou_thresh=self.config.pred_iou_thresh,
                stability_score_thresh=self.config.stability_score_thresh,
                min_mask_region_area=self.config.min_mask_region_area,
            )
            
            # Create predictor for refinement
            self.predictor = SAM2ImagePredictor(self.sam2_model)
            
            print(f"SAM2 initialized on {self.config.device}")
            
        except ImportError as e:
            print(f"SAM2 not installed. Please install with: pip install sam2")
            print(f"Error: {e}")
            self.sam2_model = None
            self.mask_generator = None
            self.predictor = None
        except Exception as e:
            print(f"Failed to initialize SAM2: {e}")
            self.sam2_model = None
            self.mask_generator = None
            self.predictor = None
    
    def _compute_card_corners_from_mask(self, mask: np.ndarray) -> Optional[np.ndarray]:
        """Extract card corners from a binary mask using contour analysis."""
        # Find contours
        contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return None
        
        # Get largest contour
        contour = max(contours, key=cv2.contourArea)
        
        # Approximate to polygon
        epsilon = 0.02 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)
        
        # If we get a quadrilateral, use those corners
        if len(approx) == 4:
            corners = approx.reshape(-1, 2)
        else:
            # Use minimum area rectangle
            rect = cv2.minAreaRect(contour)
            corners = cv2.boxPoints(rect)
            corners = np.int0(corners)
        
        # Order corners (top-left, top-right, bottom-right, bottom-left)
        corners = self._order_corners(corners)
        
        return corners
    
    def _order_corners(self, points: np.ndarray) -> np.ndarray:
        """Order corners in clockwise order starting from top-left."""
        # Find centroid
        center = points.mean(axis=0)
        
        # Sort by angle from center
        angles = np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0])
        order = np.argsort(angles)
        points = points[order]
        
        # Find top-left (minimum sum of coordinates)
        sums = points[:, 0] + points[:, 1]
        tl_idx = np.argmin(sums)
        
        # Reorder starting from top-left
        ordered = np.roll(points, -tl_idx, axis=0)
        
        return ordered
    
    def _correct_aspect_ratio(self, image: np.ndarray, corners: np.ndarray,
                            target_ratio: float = 2.5/3.5) -> np.ndarray:
        """Apply perspective warp with aspect ratio correction."""
        # Calculate current dimensions
        width = np.linalg.norm(corners[1] - corners[0])
        height = np.linalg.norm(corners[2] - corners[1])
        
        # Determine target dimensions maintaining aspect ratio
        current_ratio = width / height
        
        if current_ratio < target_ratio:
            # Height is too large, adjust based on width
            target_width = int(width)
            target_height = int(width / target_ratio)
        else:
            # Width is too large, adjust based on height
            target_height = int(height)
            target_width = int(height * target_ratio)
        
        # Standard card size for output
        output_width = 488
        output_height = 680
        
        # Source points (original corners)
        src_points = corners.astype(np.float32)
        
        # Destination points (corrected rectangle)
        dst_points = np.array([
            [0, 0],
            [output_width - 1, 0],
            [output_width - 1, output_height - 1],
            [0, output_height - 1]
        ], dtype=np.float32)
        
        # Compute perspective transform
        matrix = cv2.getPerspectiveTransform(src_points, dst_points)
        
        # Apply transform with high-quality interpolation
        warped = cv2.warpPerspective(
            image, matrix, (output_width, output_height),
            flags=cv2.INTER_LANCZOS4,
            borderMode=cv2.BORDER_REFLECT101
        )
        
        return warped
    
    async def segment_with_sam2(self, image: Image.Image) -> List[CardCrop]:
        """Segment cards using SAM2 automatic mask generation."""
        if self.mask_generator is None:
            print("SAM2 not available, falling back to Gemini-only detection")
            return await self._gemini_fallback_segmentation(image)
        
        # Convert to numpy array
        img_array = np.array(image)
        if len(img_array.shape) == 2:
            img_cv = cv2.cvtColor(img_array, cv2.COLOR_GRAY2BGR)
        else:
            img_cv = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        
        print("Running SAM2 automatic mask generation...")
        
        # Generate masks
        masks = self.mask_generator.generate(img_array)
        
        print(f"SAM2 generated {len(masks)} masks")
        
        # Filter masks by area and aspect ratio
        card_candidates = []
        expected_ratio = 2.5 / 3.5
        ratio_tolerance = 0.25
        
        for i, mask_data in enumerate(masks):
            mask = mask_data['segmentation']
            bbox = mask_data['bbox']  # x, y, w, h
            area = mask_data['area']
            
            # Check aspect ratio
            w, h = bbox[2], bbox[3]
            if w == 0 or h == 0:
                continue
            
            aspect_ratio = min(w, h) / max(w, h)
            if abs(aspect_ratio - expected_ratio) > ratio_tolerance:
                continue
            
            # Extract corners from mask
            corners = self._compute_card_corners_from_mask(mask)
            if corners is None:
                continue
            
            card_candidates.append({
                'mask': mask,
                'corners': corners,
                'bbox': bbox,
                'area': area,
                'stability_score': mask_data.get('stability_score', 0),
                'predicted_iou': mask_data.get('predicted_iou', 0)
            })
        
        print(f"Found {len(card_candidates)} potential cards")
        
        if not card_candidates:
            return await self._gemini_fallback_segmentation(image)
        
        # Validate with Gemini
        validation_image = self._create_validation_image(img_array, card_candidates)
        validations = await self._validate_with_gemini(validation_image, len(card_candidates))
        
        # Process validated cards
        crops = []
        for i, (candidate, validation) in enumerate(zip(card_candidates, validations)):
            if not validation.get('is_mtg_card', False):
                continue
            
            # Use refined corners if provided, otherwise use detected corners
            corners = validation.get('refined_corners')
            if corners:
                corners = np.array(corners) * np.array([image.width, image.height])
            else:
                corners = candidate['corners']
            
            # Apply aspect ratio correction and perspective warp
            try:
                corrected = self._correct_aspect_ratio(img_cv, corners)
                
                # Convert to PIL
                corrected_pil = Image.fromarray(cv2.cvtColor(corrected, cv2.COLOR_BGR2RGB))
                
                # Save to bytes
                crop_buffer = BytesIO()
                corrected_pil.save(crop_buffer, format="PNG", quality=95, optimize=True)
                
                # Create bounding box
                x, y, w, h = candidate['bbox']
                bbox = BoundingBox(
                    x=int(x),
                    y=int(y),
                    width=int(w),
                    height=int(h),
                    confidence=validation.get('confidence', 0.9) * candidate['predicted_iou']
                )
                
                crops.append(CardCrop(
                    image_rgb=crop_buffer.getvalue(),
                    box=bbox,
                    original_index=i,
                    corners=corners.tolist(),
                    perspective_corrected=True
                ))
                
                print(f"✅ Card {i+1}: Aspect ratio corrected and perspective warped")
                
            except Exception as e:
                print(f"Failed to process card {i+1}: {e}")
                continue
        
        return crops
    
    def _create_validation_image(self, image: np.ndarray, candidates: List[Dict[str, Any]]) -> Image.Image:
        """Create visualization for Gemini validation."""
        viz = image.copy()
        
        # Convert to BGR if needed
        if len(viz.shape) == 2:
            viz = cv2.cvtColor(viz, cv2.COLOR_GRAY2BGR)
        elif viz.shape[2] == 3:
            viz = cv2.cvtColor(viz, cv2.COLOR_RGB2BGR)
        
        colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0)]
        
        for i, candidate in enumerate(candidates):
            color = colors[i % len(colors)]
            
            # Draw mask contour
            mask = candidate['mask'].astype(np.uint8) * 255
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(viz, contours, -1, color, 2)
            
            # Draw corners
            corners = candidate['corners']
            for j, corner in enumerate(corners):
                cv2.circle(viz, tuple(corner.astype(int)), 5, color, -1)
                cv2.putText(viz, str(j+1), tuple(corner.astype(int) + 5), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
            
            # Draw ID
            x, y, w, h = candidate['bbox']
            cv2.putText(viz, f"M{i+1}", (int(x), int(y)-5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        
        return Image.fromarray(cv2.cvtColor(viz, cv2.COLOR_BGR2RGB))
    
    async def _validate_with_gemini(self, validation_image: Image.Image, num_candidates: int) -> List[Dict[str, Any]]:
        """Validate SAM2 detections with Gemini."""
        prompt = f"""SAM2 detected {num_candidates} masks (M1, M2, etc.) shown in different colors.
        
        For each mask, determine:
        1. Is it an MTG card? (not a shadow, reflection, or other object)
        2. Are the corner points accurate? If not, provide refined corners.
        3. What's your confidence level?
        
        Return JSON array with one entry per mask in order."""
        
        try:
            response = await self.run(prompt, images=[validation_image])
            
            # Parse response
            import json
            import re
            
            json_match = re.search(r'\[.*?\]', response, re.DOTALL)
            if json_match:
                validations = json.loads(json_match.group())
                if len(validations) < num_candidates:
                    # Pad with default validations
                    validations.extend([{'is_mtg_card': True, 'confidence': 0.8}] * (num_candidates - len(validations)))
                return validations[:num_candidates]
        except Exception as e:
            print(f"Validation error: {e}")
        
        # Default validation
        return [{'is_mtg_card': True, 'confidence': 0.8} for _ in range(num_candidates)]
    
    async def _gemini_fallback_segmentation(self, image: Image.Image) -> List[CardCrop]:
        """Fallback to Gemini-only segmentation if SAM2 is not available."""
        from .genai_segmenter import GenAISegmenterAgent
        
        print("Using Gemini fallback segmentation")
        fallback_agent = GenAISegmenterAgent(track_tokens=self.track_tokens)
        return await fallback_agent.segment_image(image)
    
    async def segment_image(self, image: Image.Image) -> List[CardCrop]:
        """Main segmentation method."""
        return await self.segment_with_sam2(image)
    
    async def __call__(self, image_path: str = None, image_bytes: bytes = None) -> List[CardCrop]:
        """Process an image to extract card crops."""
        if image_path:
            image = Image.open(image_path)
        elif image_bytes:
            image = Image.open(BytesIO(image_bytes))
        else:
            raise ValueError("Either image_path or image_bytes must be provided")
        
        return await self.segment_image(image)