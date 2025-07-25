"""Report generation agent using Gemini for structured output."""

import json
import os
from typing import List, Dict, Any
from datetime import datetime
from io import BytesIO

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from PIL import Image

from .gemini_base import GeminiAgent
from .base import CardReport, CardIdentity, CardGrade, CardCrop


class ReportGeneratorAgent(GeminiAgent):
    """Agent for generating comprehensive card analysis reports using Gemini."""
    
    # Condition mapping
    CONDITION_MAP = {
        "Near Mint": "NM",
        "Lightly Played": "LP",
        "Moderately Played": "MP",
        "Heavily Played": "HP",
        "Damaged": "DMG",
        "NM": "NM",
        "LP": "LP",
        "MP": "MP",
        "HP": "HP",
        "DMG": "DMG"
    }
    
    def __init__(self, model_name: str = "gemini-2.5-pro", **kwargs):
        instructions = """You are CardReportBot v0.3.
        Generate comprehensive card analysis reports with the following structure:
        
        1. For JSON output, strictly follow this schema:
        {
            "report_id": "string",
            "timestamp": "ISO 8601 datetime",
            "total_cards": number,
            "cards": [
                {
                    "position": number,
                    "identity": {
                        "name": "string",
                        "set_code": "string",
                        "collector_number": "string",
                        "scryfall_id": "string"
                    },
                    "grade": {
                        "tcg_condition": "NM|LP|MP|HP|DMG",
                        "psa_equivalent": "1-10",
                        "confidence": 0-1,
                        "overall_score": 0-10
                    },
                    "evidence": [
                        {
                            "category": "string",
                            "score": 0-10,
                            "description": "string"
                        }
                    ],
                    "estimated_value": {
                        "low": number,
                        "mid": number,
                        "high": number,
                        "currency": "USD"
                    }
                }
            ],
            "summary": {
                "total_estimated_value": {
                    "low": number,
                    "mid": number,
                    "high": number
                },
                "condition_distribution": {
                    "NM": number,
                    "LP": number,
                    "MP": number,
                    "HP": number,
                    "DMG": number
                }
            }
        }
        
        2. For narrative output, provide clear explanations of:
        - Each card's condition with specific defects noted
        - Value estimates based on condition
        - Recommendations for selling/grading
        
        Use only the provided evidence data. Do not hallucinate card details."""
        
        super().__init__(
            name="ReportGeneratorAgent",
            model_name=model_name,
            instructions=instructions,
            **kwargs
        )
        
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()
    
    def _normalize_condition(self, condition: str) -> str:
        """Normalize condition names to standard abbreviations."""
        return self.CONDITION_MAP.get(condition, condition)
    
    def _normalize_report(self, report: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize the report to ensure consistent formatting."""
        # Normalize condition names in cards
        if 'cards' in report:
            for card in report['cards']:
                if 'grade' in card and 'tcg_condition' in card['grade']:
                    card['grade']['tcg_condition'] = self._normalize_condition(
                        card['grade']['tcg_condition']
                    )
        
        # Normalize condition distribution
        if 'summary' in report and 'condition_distribution' in report['summary']:
            old_dist = report['summary']['condition_distribution']
            new_dist = {}
            for condition, count in old_dist.items():
                normalized = self._normalize_condition(condition)
                new_dist[normalized] = new_dist.get(normalized, 0) + count
            report['summary']['condition_distribution'] = new_dist
        
        return report
    
    def _setup_custom_styles(self):
        """Setup custom PDF styles."""
        self.styles.add(ParagraphStyle(
            name='CardTitle',
            parent=self.styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=6,
            alignment=TA_LEFT
        ))
        
        self.styles.add(ParagraphStyle(
            name='Grade',
            parent=self.styles['Normal'],
            fontSize=12,
            textColor=colors.HexColor('#2a2a2a'),
            alignment=TA_CENTER
        ))
    
    async def generate_report(self, card_reports: List[CardReport], output_format: str = "json") -> Dict[str, Any]:
        """Generate a comprehensive report for analyzed cards."""
        # Prepare data for Gemini
        report_data = self._prepare_report_data(card_reports)
        
        # Generate structured output using Gemini
        if output_format == "json":
            prompt = f"""Generate a JSON report for the following card analysis data.
            Follow the exact schema provided in your instructions.
            
            Card Data:
            {json.dumps(report_data, indent=2)}
            
            Include realistic value estimates based on the conditions. Return ONLY valid JSON."""
            
            response = await self.run(prompt)
            
            # Parse JSON from response
            try:
                json_report = json.loads(response)
                # Normalize condition names
                json_report = self._normalize_report(json_report)
            except Exception as e:
                print(f"Failed to parse Gemini response: {e}")
                # Fallback to structured data
                json_report = self._create_fallback_json_report(card_reports)
            
            return json_report
        
        elif output_format == "pdf":
            # Generate PDF report
            pdf_path = await self._generate_pdf_report(card_reports, report_data)
            return {"pdf_path": pdf_path, "cards_analyzed": len(card_reports)}
        
        else:
            raise ValueError(f"Unsupported output format: {output_format}")
    
    def _prepare_report_data(self, card_reports: List[CardReport]) -> Dict[str, Any]:
        """Prepare card data for report generation."""
        cards_data = []
        
        for idx, report in enumerate(card_reports):
            card_data = {
                "position": idx + 1,
                "identity": {
                    "name": report.identity.name,
                    "set_code": report.identity.set_code,
                    "collector_number": report.identity.collector_number,
                    "scryfall_id": report.identity.scryfall_id
                },
                "grade": {
                    "tcg_condition": report.grade.tcg_condition,
                    "psa_equivalent": report.grade.psa_equivalent,
                    "confidence": report.grade.confidence,
                    "overall_score": report.grade.overall_score
                },
                "evidence": [
                    {
                        "category": e.category,
                        "score": e.score,
                        "description": e.description
                    }
                    for e in report.grade.evidences
                ]
            }
            
            # Add market data if available
            if report.market_data:
                card_data["market_data"] = report.market_data
            
            cards_data.append(card_data)
        
        return {
            "timestamp": datetime.now().isoformat(),
            "total_cards": len(card_reports),
            "cards": cards_data
        }
    
    def _create_fallback_json_report(self, card_reports: List[CardReport]) -> Dict[str, Any]:
        """Create a fallback JSON report without Gemini."""
        report = {
            "report_id": f"rpt_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "timestamp": datetime.now().isoformat(),
            "total_cards": len(card_reports),
            "cards": [],
            "summary": {
                "total_estimated_value": {"low": 0, "mid": 0, "high": 0},
                "condition_distribution": {"NM": 0, "LP": 0, "MP": 0, "HP": 0, "DMG": 0}
            }
        }
        
        for idx, card_report in enumerate(card_reports):
            # Estimate values based on condition
            value_multipliers = {
                "NM": 1.0, "LP": 0.7, "MP": 0.4, "HP": 0.2, "DMG": 0.1
            }
            base_value = 10.0  # Placeholder
            multiplier = value_multipliers.get(card_report.grade.tcg_condition, 0.5)
            
            card_data = {
                "position": idx + 1,
                "identity": {
                    "name": card_report.identity.name,
                    "set_code": card_report.identity.set_code,
                    "collector_number": card_report.identity.collector_number,
                    "scryfall_id": card_report.identity.scryfall_id
                },
                "grade": {
                    "tcg_condition": card_report.grade.tcg_condition,
                    "psa_equivalent": card_report.grade.psa_equivalent,
                    "confidence": card_report.grade.confidence,
                    "overall_score": card_report.grade.overall_score
                },
                "evidence": [
                    {
                        "category": e.category,
                        "score": e.score,
                        "description": e.description
                    }
                    for e in card_report.grade.evidences
                ],
                "estimated_value": {
                    "low": round(base_value * multiplier * 0.8, 2),
                    "mid": round(base_value * multiplier, 2),
                    "high": round(base_value * multiplier * 1.2, 2),
                    "currency": "USD"
                }
            }
            
            report["cards"].append(card_data)
            
            # Update summary (normalize condition)
            normalized_condition = self._normalize_condition(card_report.grade.tcg_condition)
            report["summary"]["condition_distribution"][normalized_condition] += 1
            report["summary"]["total_estimated_value"]["low"] += card_data["estimated_value"]["low"]
            report["summary"]["total_estimated_value"]["mid"] += card_data["estimated_value"]["mid"]
            report["summary"]["total_estimated_value"]["high"] += card_data["estimated_value"]["high"]
        
        return report
    
    async def _generate_pdf_report(self, card_reports: List[CardReport], report_data: Dict[str, Any]) -> str:
        """Generate a PDF report."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        pdf_path = f"./reports/card_analysis_{timestamp}.pdf"
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(pdf_path), exist_ok=True)
        
        # Create PDF
        doc = SimpleDocTemplate(pdf_path, pagesize=letter)
        story = []
        
        # Title page
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=self.styles['Title'],
            fontSize=24,
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=30,
            alignment=TA_CENTER
        )
        
        story.append(Paragraph("MTG Card Analysis Report", title_style))
        story.append(Spacer(1, 0.5*inch))
        
        # Get token usage if available
        from .gemini_base import GeminiAgent
        token_usage = GeminiAgent.get_global_token_usage()
        
        # Summary section
        summary_data = [
            ["Report Date:", datetime.now().strftime("%B %d, %Y")],
            ["Total Cards:", str(len(card_reports))],
            ["Analysis Method:", "AI-Powered Visual Grading (Gemini 2.5 Pro)"],
            ["Total Tokens Used:", f"{token_usage['total_tokens']:,}"],
            ["Processing Cost:", f"${token_usage['total_cost_usd']:.4f}"]
        ]
        
        summary_table = Table(summary_data, colWidths=[2*inch, 4*inch])
        summary_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.grey),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        
        story.append(summary_table)
        story.append(PageBreak())
        
        # Individual card pages
        for idx, card_report in enumerate(card_reports):
            # Card header
            story.append(Paragraph(f"Card {idx + 1}: {card_report.identity.name}", self.styles['CardTitle']))
            story.append(Paragraph(f"{card_report.identity.set_code} #{card_report.identity.collector_number}", self.styles['Normal']))
            story.append(Spacer(1, 0.25*inch))
            
            # Card image (if we have it)
            if card_report.crop and card_report.crop.image_rgb:
                try:
                    img = Image.open(BytesIO(card_report.crop.image_rgb))
                    img_buffer = BytesIO()
                    img.save(img_buffer, format='PNG')
                    img_buffer.seek(0)
                    
                    rl_img = RLImage(img_buffer, width=2.5*inch, height=3.5*inch)
                    story.append(rl_img)
                    story.append(Spacer(1, 0.25*inch))
                except:
                    pass
            
            # Grade information
            grade_data = [
                ["TCGPlayer Condition:", card_report.grade.tcg_condition],
                ["PSA Equivalent:", f"PSA {card_report.grade.psa_equivalent}"],
                ["Overall Score:", f"{card_report.grade.overall_score:.1f}/10"],
                ["Confidence:", f"{card_report.grade.confidence:.0%}"]
            ]
            
            grade_table = Table(grade_data, colWidths=[2*inch, 2*inch])
            grade_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ]))
            
            story.append(grade_table)
            story.append(Spacer(1, 0.25*inch))
            
            # Evidence details
            story.append(Paragraph("Condition Analysis:", self.styles['Heading3']))
            
            for evidence in card_report.grade.evidences:
                evidence_text = f"<b>{evidence.category.title()}:</b> {evidence.description} (Score: {evidence.score:.1f}/10)"
                story.append(Paragraph(evidence_text, self.styles['Normal']))
            
            if idx < len(card_reports) - 1:
                story.append(PageBreak())
        
        # Build PDF
        doc.build(story)
        
        return pdf_path
    
    async def __call__(self, card_reports: List[CardReport], output_format: str = "json") -> Dict[str, Any]:
        """Generate report for analyzed cards."""
        return await self.generate_report(card_reports, output_format)