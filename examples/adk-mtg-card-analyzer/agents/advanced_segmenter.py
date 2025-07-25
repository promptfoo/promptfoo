"""Advanced segmentation agent using hybrid CV techniques with Gemini 2.5 Pro."""

import cv2
import numpy as np
from PIL import Image
from typing import List, Tuple, Optional, Dict, Any
from io import BytesIO
import json
import re
from scipy import ndimage
from skimage import measure, morphology

from .gemini_base import GeminiAgent
from .base import CardCrop, BoundingBox


class AdvancedSegmenterAgent(GeminiAgent):
    """Advanced segmentation using computer vision preprocessing and Gemini validation."""
    
    def __init__(self, model_name: str = "gemini-2.5-pro", **kwargs):
        instructions = """You are an expert at validating and refining Magic: The Gathering card detections.
        
        Given preprocessed card candidates from computer vision, you must:
        1. Validate which regions are actual MTG cards vs false positives
        2. Provide precise corner points for each valid card
        3. Identify cards that are partially obscured or at extreme angles
        4. Detect subtle card boundaries that CV might miss
        
        For each valid card, return:
        {
            "is_valid_card": true/false,
            "confidence": 0.0-1.0,
            "corners": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]],  // clockwise from top-left
            "card_condition_visible": true/false,
            "obstruction_level": "none|partial|severe",
            "rotation_angle": -180 to 180,
            "notes": "any relevant observations"
        }
        
        Be extremely precise with corner detection - they must match the actual card edges exactly."""
        
        super().__init__(
            name="AdvancedSegmenterAgent",
            model_name=model_name,
            instructions=instructions,
            **kwargs
        )
    
    def _preprocess_image(self, image: np.ndarray) -> Dict[str, np.ndarray]:
        """Advanced preprocessing for better card detection."""
        results = {}
        
        # 1. Adaptive histogram equalization for better contrast
        if len(image.shape) == 3:
            lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
            l = clahe.apply(l)
            enhanced = cv2.merge([l, a, b])
            enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
            gray = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)
        else:
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
            enhanced = image.copy()
            gray = clahe.apply(image)
        
        results['enhanced'] = enhanced
        results['gray'] = gray
        
        # 2. Multi-scale edge detection with lower thresholds for cards on backgrounds
        edges_fine = cv2.Canny(gray, 30, 90, apertureSize=3)
        edges_coarse = cv2.Canny(gray, 20, 60, apertureSize=5)
        edges_combined = cv2.bitwise_or(edges_fine, edges_coarse)
        
        # Additional edge detection on color channels
        if len(enhanced.shape) == 3:
            edges_b = cv2.Canny(enhanced[:,:,0], 30, 90)
            edges_g = cv2.Canny(enhanced[:,:,1], 30, 90)
            edges_r = cv2.Canny(enhanced[:,:,2], 30, 90)
            edges_color = cv2.bitwise_or(cv2.bitwise_or(edges_b, edges_g), edges_r)
            edges_combined = cv2.bitwise_or(edges_combined, edges_color)
        
        # 3. Morphological operations to connect broken edges
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        edges_closed = cv2.morphologyEx(edges_combined, cv2.MORPH_CLOSE, kernel, iterations=2)
        
        results['edges'] = edges_closed
        
        # 4. Adaptive thresholding for different lighting conditions
        thresh_mean = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, 
                                          cv2.THRESH_BINARY_INV, 21, 10)
        thresh_gaussian = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                              cv2.THRESH_BINARY_INV, 21, 10)
        
        results['thresh_mean'] = thresh_mean
        results['thresh_gaussian'] = thresh_gaussian
        
        return results
    
    def _find_card_candidates(self, preprocessed: Dict[str, np.ndarray], 
                            original_shape: Tuple[int, int]) -> List[Dict[str, Any]]:
        """Find potential card regions using multiple techniques."""
        h, w = original_shape[:2]
        candidates = []
        
        # Expected card aspect ratio (2.5" x 3.5")
        expected_ratio = 2.5 / 3.5
        ratio_tolerance = 0.15
        
        # Minimum card size (at least 2% of image area for multiple cards)
        min_area = 0.02 * w * h
        max_area = 0.5 * w * h
        
        # 1. Find contours on edge image
        contours_edges, _ = cv2.findContours(preprocessed['edges'], 
                                            cv2.RETR_EXTERNAL, 
                                            cv2.CHAIN_APPROX_SIMPLE)
        
        # 2. Find contours on thresholded images
        contours_mean, _ = cv2.findContours(preprocessed['thresh_mean'],
                                           cv2.RETR_EXTERNAL,
                                           cv2.CHAIN_APPROX_SIMPLE)
        
        # Combine all contours
        all_contours = contours_edges + contours_mean
        
        for contour in all_contours:
            area = cv2.contourArea(contour)
            
            # Filter by area
            if area < min_area or area > max_area:
                continue
            
            # Approximate polygon
            epsilon = 0.02 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            
            # Look for quadrilaterals (4 corners)
            if len(approx) == 4:
                # Get bounding rectangle
                rect = cv2.minAreaRect(contour)
                box = cv2.boxPoints(rect)
                box = np.int0(box)
                
                # Check aspect ratio
                width = rect[1][0]
                height = rect[1][1]
                if width == 0 or height == 0:
                    continue
                
                aspect_ratio = min(width, height) / max(width, height)
                if abs(aspect_ratio - expected_ratio) > ratio_tolerance:
                    continue
                
                # Get corners in correct order
                corners = self._order_corners(approx.reshape(-1, 2))
                
                candidates.append({
                    'corners': corners.tolist(),
                    'area': area,
                    'aspect_ratio': aspect_ratio,
                    'confidence': 0.8,
                    'method': 'quadrilateral'
                })
            
            # Also try minimum area rectangle for rotated cards
            elif len(approx) > 4:
                rect = cv2.minAreaRect(contour)
                box = cv2.boxPoints(rect)
                box = np.int0(box)
                
                # Check aspect ratio
                width = rect[1][0]
                height = rect[1][1]
                if width == 0 or height == 0:
                    continue
                
                aspect_ratio = min(width, height) / max(width, height)
                if abs(aspect_ratio - expected_ratio) > ratio_tolerance:
                    continue
                
                corners = self._order_corners(box)
                
                candidates.append({
                    'corners': corners.tolist(),
                    'area': area,
                    'aspect_ratio': aspect_ratio,
                    'confidence': 0.6,
                    'method': 'min_area_rect'
                })
        
        # 3. Use Hough line detection for cards with clear edges
        candidates.extend(self._detect_cards_with_hough(preprocessed['edges'], original_shape))
        
        # Remove duplicates
        candidates = self._remove_duplicate_candidates(candidates)
        
        return candidates
    
    def _detect_cards_with_hough(self, edges: np.ndarray, shape: Tuple[int, int]) -> List[Dict[str, Any]]:
        """Detect cards using Hough line transformation."""
        h, w = shape[:2]
        candidates = []
        
        # Detect lines
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=100, 
                               minLineLength=min(w, h) * 0.1,
                               maxLineGap=20)
        
        if lines is None:
            return candidates
        
        # Group lines by angle
        horizontal_lines = []
        vertical_lines = []
        
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi
            
            if abs(angle) < 15 or abs(angle) > 165:  # Horizontal
                horizontal_lines.append(line[0])
            elif 75 < abs(angle) < 105:  # Vertical
                vertical_lines.append(line[0])
        
        # Find rectangles formed by intersecting lines
        # This is a simplified approach - in practice would need more sophisticated logic
        
        return candidates
    
    def _order_corners(self, points: np.ndarray) -> np.ndarray:
        """Order corners clockwise starting from top-left."""
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
    
    def _remove_duplicate_candidates(self, candidates: List[Dict[str, Any]], 
                                   iou_threshold: float = 0.5) -> List[Dict[str, Any]]:
        """Remove duplicate/overlapping candidates."""
        if not candidates:
            return candidates
        
        # Sort by confidence
        candidates = sorted(candidates, key=lambda x: x['confidence'], reverse=True)
        
        kept = []
        for candidate in candidates:
            # Check overlap with already kept candidates
            is_duplicate = False
            
            for kept_candidate in kept:
                iou = self._calculate_iou(candidate['corners'], kept_candidate['corners'])
                if iou > iou_threshold:
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                kept.append(candidate)
        
        return kept
    
    def _calculate_iou(self, corners1: List[List[float]], corners2: List[List[float]]) -> float:
        """Calculate Intersection over Union between two quadrilaterals."""
        # Convert to numpy arrays
        poly1 = np.array(corners1, dtype=np.int32)
        poly2 = np.array(corners2, dtype=np.int32)
        
        # Create masks
        h, w = 1000, 1000  # Temporary canvas size
        mask1 = np.zeros((h, w), dtype=np.uint8)
        mask2 = np.zeros((h, w), dtype=np.uint8)
        
        # Scale corners to fit in canvas
        poly1_scaled = (poly1 * [w/np.max(poly1[:, 0]), h/np.max(poly1[:, 1])]).astype(np.int32)
        poly2_scaled = (poly2 * [w/np.max(poly2[:, 0]), h/np.max(poly2[:, 1])]).astype(np.int32)
        
        cv2.fillPoly(mask1, [poly1_scaled], 255)
        cv2.fillPoly(mask2, [poly2_scaled], 255)
        
        # Calculate IOU
        intersection = np.logical_and(mask1, mask2).sum()
        union = np.logical_or(mask1, mask2).sum()
        
        return intersection / union if union > 0 else 0
    
    async def segment_image(self, image: Image.Image) -> List[CardCrop]:
        """Segment cards using advanced CV techniques and Gemini validation."""
        # Convert to OpenCV format
        img_array = np.array(image)
        if len(img_array.shape) == 2:
            img_cv = cv2.cvtColor(img_array, cv2.COLOR_GRAY2BGR)
        else:
            img_cv = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        
        # Preprocess image
        preprocessed = self._preprocess_image(img_cv)
        
        # Find card candidates
        candidates = self._find_card_candidates(preprocessed, img_cv.shape)
        
        # Always include Gemini detection as well
        print(f"Found {len(candidates)} card candidates with CV")
        
        # If no CV candidates or very few, use pure Gemini detection
        if len(candidates) < 2:  # Expecting multiple cards
            print("Using Gemini for primary detection")
            return await self._gemini_only_detection(image)
        
        # Create visualization for Gemini
        viz = img_cv.copy()
        for i, candidate in enumerate(candidates):
            corners = np.array(candidate['corners'], dtype=np.int32)
            cv2.drawContours(viz, [corners], -1, (0, 255, 0), 2)
            cv2.putText(viz, f"C{i+1}", tuple(corners[0]), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
        
        # Convert visualization to PIL
        viz_pil = Image.fromarray(cv2.cvtColor(viz, cv2.COLOR_BGR2RGB))
        
        # Get Gemini to validate and refine
        prompt = f"""I've detected {len(candidates)} potential MTG card regions marked in green.
        
        For each candidate (C1, C2, etc.), tell me:
        1. Is it actually an MTG card?
        2. Are the corners accurate? If not, provide corrected corners.
        3. Any issues with the detection?
        
        Return a JSON array with one entry per candidate in order.
        Include the refined corner coordinates normalized to 0-1 range."""
        
        try:
            response = await self.run(prompt, images=[viz_pil])
            
            # Parse response
            validations = self._parse_validation_response(response)
            
            # Create final crops
            crops = []
            for i, (candidate, validation) in enumerate(zip(candidates, validations)):
                if not validation.get('is_valid_card', False):
                    continue
                
                # Use refined corners if provided, otherwise use CV corners
                corners = validation.get('corners', candidate['corners'])
                
                # Apply perspective correction
                corrected = self._apply_perspective_correction(img_cv, 
                                                              self._normalize_corners(corners, img_cv.shape))
                
                # Convert to PIL and save
                corrected_pil = Image.fromarray(cv2.cvtColor(corrected, cv2.COLOR_BGR2RGB))
                crop_buffer = BytesIO()
                corrected_pil.save(crop_buffer, format="PNG", quality=95)
                
                # Create bounding box from corners
                corners_array = np.array(corners)
                x_min, y_min = corners_array.min(axis=0)
                x_max, y_max = corners_array.max(axis=0)
                
                bbox = BoundingBox(
                    x=int(x_min),
                    y=int(y_min),
                    width=int(x_max - x_min),
                    height=int(y_max - y_min),
                    confidence=validation.get('confidence', candidate['confidence'])
                )
                
                crops.append(CardCrop(
                    image_rgb=crop_buffer.getvalue(),
                    box=bbox,
                    original_index=i,
                    corners=corners,
                    perspective_corrected=True
                ))
            
            print(f"Validated {len(crops)} cards with advanced segmentation")
            return crops
            
        except Exception as e:
            print(f"Error in validation: {e}")
            # Fall back to basic detection
            return await self._gemini_only_detection(image)
    
    def _normalize_corners(self, corners: List[List[float]], shape: Tuple[int, int]) -> List[List[float]]:
        """Normalize corners to 0-1 range."""
        h, w = shape[:2]
        return [[x/w, y/h] for x, y in corners]
    
    def _parse_validation_response(self, response: str) -> List[Dict[str, Any]]:
        """Parse Gemini's validation response."""
        try:
            # First try to find JSON array
            json_match = re.search(r'\[.*?\]', response, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group())
                if isinstance(parsed, list):
                    return parsed
            
            # Try multiple JSON objects
            json_objects = re.findall(r'\{[^{}]*\}', response)
            if json_objects:
                return [json.loads(obj) for obj in json_objects]
                
        except Exception as e:
            print(f"Failed to parse validation response: {e}")
        
        # Return default validations if parsing fails
        return [{'is_valid_card': True, 'confidence': 0.7} for _ in range(4)]
    
    async def _gemini_only_detection(self, image: Image.Image) -> List[CardCrop]:
        """Pure Gemini detection with enhanced prompting."""
        prompt = """Detect ALL Magic: The Gathering cards in this image. I can see there are multiple cards laid out.
        
        For EACH card visible in the image:
        1. Provide the EXACT four corner points (clockwise from top-left) 
        2. Corners should be at the actual card edges, not the artwork
        3. Include cards even if partially visible
        
        Return a JSON array with one object per card:
        [
            {
                "corners": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]],
                "confidence": 0.9,
                "card_name": "name if visible"  
            }
        ]
        
        Coordinates should be normalized to 0-1 range. Detect ALL cards - there should be multiple."""
        
        try:
            response = await self.run(prompt, images=[image])
            detections = self._parse_validation_response(response)
            
            crops = []
            img_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
            
            for i, detection in enumerate(detections):
                corners = detection.get('corners', [])
                if len(corners) != 4:
                    continue
                
                # Validate corners are reasonable
                corners_array = np.array(corners)
                if np.any(corners_array < 0) or np.any(corners_array > 1):
                    # Denormalize if needed
                    if np.any(corners_array > 1):
                        corners = [[c[0]/image.width, c[1]/image.height] for c in corners]
                
                # Apply perspective correction
                corrected = self._apply_perspective_correction(img_cv, corners)
                
                # Convert to PIL
                corrected_pil = Image.fromarray(cv2.cvtColor(corrected, cv2.COLOR_BGR2RGB))
                crop_buffer = BytesIO()
                corrected_pil.save(crop_buffer, format="PNG", quality=95)
                
                # Create bounding box
                corners_array = np.array(corners)
                x_min, y_min = corners_array.min(axis=0)
                x_max, y_max = corners_array.max(axis=0)
                
                bbox = BoundingBox(
                    x=int(x_min * image.width),
                    y=int(y_min * image.height),
                    width=int((x_max - x_min) * image.width),
                    height=int((y_max - y_min) * image.height),
                    confidence=detection.get('confidence', 0.9)
                )
                
                crops.append(CardCrop(
                    image_rgb=crop_buffer.getvalue(),
                    box=bbox,
                    original_index=i,
                    corners=corners,
                    perspective_corrected=True
                ))
            
            return crops
            
        except Exception as e:
            print(f"Gemini detection failed: {e}")
            return []
    
    def _apply_perspective_correction(self, image: np.ndarray, corners: List[List[float]], 
                                    target_width: int = 488, target_height: int = 680) -> np.ndarray:
        """Apply perspective correction with enhanced quality."""
        h, w = image.shape[:2]
        
        # Denormalize corners if normalized
        if all(0 <= c[0] <= 1 and 0 <= c[1] <= 1 for c in corners):
            src_corners = np.array([[c[0] * w, c[1] * h] for c in corners], dtype=np.float32)
        else:
            src_corners = np.array(corners, dtype=np.float32)
        
        # Ensure corners are in correct order
        src_corners = self._order_corners(src_corners)
        
        # Destination corners
        dst_corners = np.array([
            [0, 0],
            [target_width - 1, 0],
            [target_width - 1, target_height - 1],
            [0, target_height - 1]
        ], dtype=np.float32)
        
        # Get transformation matrix
        matrix = cv2.getPerspectiveTransform(src_corners, dst_corners)
        
        # Apply high-quality perspective warp
        flags = cv2.INTER_CUBIC | cv2.WARP_FILL_OUTLIERS
        warped = cv2.warpPerspective(image, matrix, (target_width, target_height), 
                                   flags=flags, borderMode=cv2.BORDER_REFLECT)
        
        # Post-process for better quality
        # Sharpen slightly
        kernel = np.array([[0, -1, 0],
                         [-1, 5, -1],
                         [0, -1, 0]], dtype=np.float32)
        sharpened = cv2.filter2D(warped, -1, kernel * 0.3 + np.eye(3) * 0.7)
        
        return sharpened
    
    async def __call__(self, image_path: str = None, image_bytes: bytes = None) -> List[CardCrop]:
        """Process an image to extract card crops."""
        if image_path:
            image = Image.open(image_path)
        elif image_bytes:
            image = Image.open(BytesIO(image_bytes))
        else:
            raise ValueError("Either image_path or image_bytes must be provided")
        
        return await self.segment_image(image)