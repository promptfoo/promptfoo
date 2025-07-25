"""Base agent classes for MTG card analysis pipeline."""

from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass
import numpy as np
from PIL import Image
import io
import base64

# Remove ADK imports - we'll use our own base classes


@dataclass
class BoundingBox:
    """Bounding box for a detected card."""
    x: int
    y: int
    width: int
    height: int
    confidence: float = 1.0


@dataclass
class CardCrop:
    """Cropped card image with metadata."""
    image_rgb: bytes  # PNG-encoded crop
    box: BoundingBox
    original_index: int = 0


@dataclass
class CardIdentity:
    """Card identification result."""
    scryfall_id: str
    similarity: float
    set_code: str
    collector_number: str
    name: str
    image_url: Optional[str] = None
    oracle_text: Optional[str] = None


@dataclass
class Evidence:
    """Evidence for a grading decision."""
    category: str  # "centering", "corners", "surface", "edges"
    score: float  # 0-10 scale
    description: str
    visual_markers: Optional[List[Dict[str, Any]]] = None


@dataclass
class CardGrade:
    """Card condition grade with evidence."""
    tcg_condition: str  # "NM", "LP", "MP", "HP", "DMG"
    psa_equivalent: str  # "10", "9", "8", etc.
    evidences: List[Evidence]
    confidence: float
    overall_score: float  # 0-10 scale


@dataclass
class CardReport:
    """Complete card analysis report."""
    identity: CardIdentity
    grade: CardGrade
    crop: CardCrop
    market_data: Optional[Dict[str, Any]] = None
    similar_sales: Optional[List[Dict[str, Any]]] = None


# Helper functions for image processing
def image_to_base64(image: Image.Image) -> str:
    """Convert PIL Image to base64 string."""
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()

def base64_to_image(base64_str: str) -> Image.Image:
    """Convert base64 string to PIL Image."""
    image_data = base64.b64decode(base64_str)
    return Image.open(io.BytesIO(image_data))

def bytes_to_image(image_bytes: bytes) -> Image.Image:
    """Convert bytes to PIL Image."""
    return Image.open(io.BytesIO(image_bytes))

def image_to_bytes(image: Image.Image, format: str = "PNG") -> bytes:
    """Convert PIL Image to bytes."""
    buffer = io.BytesIO()
    image.save(buffer, format=format)
    return buffer.getvalue()