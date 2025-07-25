"""Quality grading agent for card condition assessment using Gemini 2.5 Pro."""

import json
from PIL import Image
from io import BytesIO
from typing import List
import re

from .gemini_base import GeminiAgent
from .base import CardCrop, CardGrade, Evidence


class QualityGraderAgent(GeminiAgent):
    """Agent for grading card condition using Gemini 2.5 Pro vision."""
    
    def __init__(self, model_name: str = "gemini-2.5-pro", **kwargs):
        instructions = """You are a professional Magic: The Gathering card grader with expertise in TCGPlayer and PSA grading standards.

        GRADING CRITERIA:

        1. CENTERING (25% weight):
           - Measure the borders on all four sides
           - Perfect centering: 50/50 on all sides (10/10)
           - 55/45 or better: 9/10
           - 60/40 or better: 8/10
           - 65/35 or better: 7/10
           - 70/30 or better: 6/10
           - Worse than 70/30: 5/10 or below

        2. CORNERS (30% weight):
           - Examine all four corners under magnification
           - Perfect sharp corners with no wear: 10/10
           - Slight corner wear visible only under close inspection: 9/10
           - Minor whitening on 1-2 corners: 8/10
           - Light whitening on 3-4 corners: 7/10
           - Moderate whitening/slight bending: 6/10
           - Heavy whitening or bent corners: 5/10 or below

        3. EDGES (20% weight):
           - Check all four edges for whitening, chipping, or wear
           - Pristine edges with no wear: 10/10
           - Minimal edge wear on back only: 9/10
           - Light edge wear on 1-2 edges: 8/10
           - Edge wear on 3-4 edges: 7/10
           - Moderate chipping or whitening: 6/10
           - Heavy edge damage: 5/10 or below

        4. SURFACE (25% weight):
           - Look for scratches, scuffs, print lines, indentations, or stains
           - Perfect surface with no defects: 10/10
           - 1-2 minor print lines or micro scratches: 9/10
           - Light surface wear or minor scratching: 8/10
           - Multiple scratches or light scuffing: 7/10
           - Moderate scratching, scuffing, or clouding: 6/10
           - Heavy surface damage, creases, or stains: 5/10 or below

        TCGPlayer CONDITION MAPPING:
        - Near Mint (NM): 9.0+ overall, no category below 8.0
        - Lightly Played (LP): 7.5-8.9 overall, no category below 6.5
        - Moderately Played (MP): 5.5-7.4 overall, no category below 5.0
        - Heavily Played (HP): 3.0-5.4 overall
        - Damaged (DMG): Below 3.0 overall or any major defect (tears, water damage, etc.)

        PSA GRADE MAPPING:
        - PSA 10: 9.5+ overall, perfect centering, no defects
        - PSA 9: 9.0-9.4 overall, minor centering issue or single minor defect
        - PSA 8: 8.0-8.9 overall, slight wear visible
        - PSA 7: 7.0-7.9 overall, light wear on multiple areas
        - PSA 6: 6.0-6.9 overall, noticeable wear
        - PSA 5 and below: Significant wear or damage

        Return JSON with this EXACT structure:
        {
            "detailed_analysis": {
                "centering": {
                    "score": 8.5,
                    "measurements": "55/45 left-right, 52/48 top-bottom",
                    "description": "Slightly favors left side"
                },
                "corners": {
                    "score": 7.0,
                    "description": "Light whitening on bottom corners, top corners sharp",
                    "corner_details": {
                        "top_left": "Sharp",
                        "top_right": "Sharp",
                        "bottom_left": "Light whitening",
                        "bottom_right": "Light whitening"
                    }
                },
                "edges": {
                    "score": 8.0,
                    "description": "Minor wear on bottom edge only",
                    "edge_details": {
                        "top": "Clean",
                        "bottom": "Light wear",
                        "left": "Clean",
                        "right": "Clean"
                    }
                },
                "surface": {
                    "score": 9.0,
                    "description": "Clean surface with one minor print line",
                    "defects": ["Minor print line near top border"]
                }
            },
            "overall_score": 8.1,
            "tcg_condition": "LP",
            "psa_grade": "8",
            "confidence": 0.92,
            "key_defects": ["Light corner whitening", "Minor edge wear", "Single print line"],
            "grading_notes": "Card shows light play wear consistent with careful use"
        }"""
        
        super().__init__(
            name="CardGraderAgent",
            model_name=model_name,
            instructions=instructions,
            **kwargs
        )
    
    async def grade_card(self, crop: CardCrop) -> CardGrade:
        """Grade a single card's condition using Gemini 2.5 Pro."""
        # Convert crop bytes to PIL Image
        image = Image.open(BytesIO(crop.image_rgb))
        
        # Create detailed grading prompt
        prompt = """Analyze this Magic: The Gathering card and provide a detailed condition assessment.
        
        Examine the card carefully for:
        1. Centering - measure the borders precisely
        2. Corners - check each corner for wear or whitening
        3. Edges - inspect all edges for damage
        4. Surface - look for any scratches, scuffs, or defects
        
        Apply professional grading standards as specified in your instructions. Return ONLY valid JSON."""
        
        try:
            # Get Gemini's assessment
            response = await self.run(prompt, images=[image])
            
            # Parse response
            try:
                result = json.loads(response)
            except:
                # Extract JSON from response
                json_match = re.search(r'\{.*\}', response, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group())
                else:
                    raise ValueError("Could not parse JSON from response")
            
            # Extract detailed analysis
            analysis = result.get("detailed_analysis", {})
            
            # Create evidence entries
            evidences = []
            
            # Centering evidence
            centering = analysis.get("centering", {})
            evidences.append(Evidence(
                category="centering",
                score=centering.get("score", 8.0),
                description=f"{centering.get('measurements', 'Not measured')} - {centering.get('description', 'No details')}",
                visual_markers=[{"type": "measurements", "data": centering}]
            ))
            
            # Corners evidence
            corners = analysis.get("corners", {})
            evidences.append(Evidence(
                category="corners",
                score=corners.get("score", 8.0),
                description=corners.get("description", "No corner analysis"),
                visual_markers=[{"type": "corner_details", "data": corners.get("corner_details", {})}]
            ))
            
            # Edges evidence
            edges = analysis.get("edges", {})
            evidences.append(Evidence(
                category="edges",
                score=edges.get("score", 8.0),
                description=edges.get("description", "No edge analysis"),
                visual_markers=[{"type": "edge_details", "data": edges.get("edge_details", {})}]
            ))
            
            # Surface evidence
            surface = analysis.get("surface", {})
            evidences.append(Evidence(
                category="surface",
                score=surface.get("score", 8.0),
                description=surface.get("description", "No surface analysis"),
                visual_markers=[{"type": "defects", "data": surface.get("defects", [])}]
            ))
            
            # Overall assessment evidence
            if result.get("grading_notes"):
                evidences.append(Evidence(
                    category="overall_assessment",
                    score=result.get("overall_score", 8.0),
                    description=result.get("grading_notes", ""),
                    visual_markers=[{"type": "key_defects", "data": result.get("key_defects", [])}]
                ))
            
            return CardGrade(
                tcg_condition=result.get("tcg_condition", "LP"),
                psa_equivalent=result.get("psa_grade", "8"),
                evidences=evidences,
                confidence=result.get("confidence", 0.8),
                overall_score=result.get("overall_score", 8.0)
            )
            
        except Exception as e:
            print(f"Error grading card: {e}")
            # Return conservative grade on error
            return CardGrade(
                tcg_condition="MP",
                psa_equivalent="6",
                evidences=[
                    Evidence(
                        category="error",
                        score=6.0,
                        description=f"Grading error: {str(e)}"
                    )
                ],
                confidence=0.5,
                overall_score=6.0
            )
    
    async def __call__(self, crops: List[CardCrop]) -> List[CardGrade]:
        """Grade multiple card crops."""
        grades = []
        for crop in crops:
            grade = await self.grade_card(crop)
            grades.append(grade)
        return grades