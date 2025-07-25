"""Coordinator agent to orchestrate the card analysis pipeline."""

import asyncio
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass
import json
import time
from PIL import Image

from .base import CardReport, CardCrop
from .segmenter import SegmenterAgent
from .identifier import IdentifierAgent
from .grader import QualityGraderAgent
from .reporter import ReportGeneratorAgent
from .gemini_base import GeminiAgent


@dataclass
class PipelineProgress:
    """Track pipeline progress."""
    stage: str
    current: int
    total: int
    message: str
    percentage: float


class CoordinatorAgent:
    """Orchestrates the multi-agent card analysis pipeline."""
    
    def __init__(self, 
                 max_parallel_cards: int = 16,
                 enable_caching: bool = True,
                 progress_callback: Optional[Callable[[PipelineProgress], None]] = None,
                 track_tokens: bool = True,
                 **kwargs):
        
        # Reset token tracking for new session
        if track_tokens:
            GeminiAgent.reset_global_token_tracking()
        
        # Initialize component agents
        self.segmenter = SegmenterAgent(track_tokens=track_tokens)
        self.identifier = IdentifierAgent(track_tokens=track_tokens)
        self.grader = QualityGraderAgent(track_tokens=track_tokens)
        self.reporter = ReportGeneratorAgent(track_tokens=track_tokens)
        
        # Configure pipeline
        self.max_parallel_cards = max_parallel_cards
        self.enable_caching = enable_caching
        self.progress_callback = progress_callback
        
        self._cache = {} if enable_caching else None
    
    def _report_progress(self, stage: str, current: int, total: int, message: str = ""):
        """Report progress to callback if provided."""
        if self.progress_callback:
            percentage = (current / total * 100) if total > 0 else 0
            progress = PipelineProgress(
                stage=stage,
                current=current,
                total=total,
                message=message,
                percentage=percentage
            )
            self.progress_callback(progress)
    
    async def analyze_image(self, 
                           image_path: Optional[str] = None,
                           image_bytes: Optional[bytes] = None,
                           output_format: str = "json") -> Dict[str, Any]:
        """
        Analyze an image containing one or more MTG cards.
        
        Args:
            image_path: Path to image file
            image_bytes: Image data as bytes
            output_format: "json" or "pdf"
            
        Returns:
            Analysis report with progress tracking
        """
        start_time = time.time()
        
        # Stage 1: Segmentation
        self._report_progress("segmentation", 0, 1, "Detecting cards in image...")
        
        try:
            crops = await self.segmenter(image_path=image_path, image_bytes=image_bytes)
            self._report_progress("segmentation", 1, 1, f"Found {len(crops)} cards")
        except Exception as e:
            return {
                "error": f"Segmentation failed: {str(e)}",
                "stage": "segmentation"
            }
        
        if not crops:
            return {
                "error": "No cards detected in image",
                "stage": "segmentation",
                "total_cards": 0
            }
        
        # Stage 2 & 3: Parallel identification and grading
        card_reports = []
        
        # Process cards in batches
        for batch_start in range(0, len(crops), self.max_parallel_cards):
            batch_end = min(batch_start + self.max_parallel_cards, len(crops))
            batch_crops = crops[batch_start:batch_end]
            
            # Parallel processing of identification and grading
            self._report_progress("identification", batch_start, len(crops), 
                                f"Identifying cards {batch_start+1}-{batch_end}...")
            
            identification_tasks = []
            grading_tasks = []
            
            # Check cache and create tasks
            for crop in batch_crops:
                # Cache key based on image hash
                cache_key = hash(crop.image_rgb) if self._cache is not None else None
                
                if cache_key and cache_key in self._cache:
                    # Use cached result
                    card_reports.append(self._cache[cache_key])
                else:
                    # Create identification task
                    ident_task = asyncio.create_task(self.identifier([crop]))
                    identification_tasks.append((crop, ident_task))
                    
                    # Create grading task  
                    grade_task = asyncio.create_task(self.grader([crop]))
                    grading_tasks.append(grade_task)
            
            # Wait for identification
            identities = []
            for crop, task in identification_tasks:
                result = await task
                identities.append(result[0] if result else None)
            
            self._report_progress("grading", batch_start, len(crops),
                                f"Grading cards {batch_start+1}-{batch_end}...")
            
            # Wait for grading
            grades = []
            for task in grading_tasks:
                result = await task
                grades.append(result[0] if result else None)
            
            # Combine results
            for i, (crop, identity, grade) in enumerate(zip(
                [c for c, _ in identification_tasks],
                identities,
                grades
            )):
                if identity and grade:
                    report = CardReport(
                        identity=identity,
                        grade=grade,
                        crop=crop
                    )
                    
                    # Cache result
                    if self._cache is not None:
                        cache_key = hash(crop.image_rgb)
                        self._cache[cache_key] = report
                    
                    card_reports.append(report)
            
            self._report_progress("grading", batch_end, len(crops),
                                f"Completed batch {batch_start+1}-{batch_end}")
        
        # Stage 4: Report generation
        self._report_progress("reporting", 0, 1, "Generating final report...")
        
        try:
            final_report = await self.reporter(card_reports, output_format=output_format)
            
            # Get token usage statistics
            token_usage = GeminiAgent.get_global_token_usage()
            
            # Add per-agent breakdown
            agent_breakdown = {
                "segmenter": self.segmenter.get_token_usage(),
                "identifier": self.identifier.get_token_usage(),
                "grader": self.grader.get_token_usage(),
                "reporter": self.reporter.get_token_usage()
            }
            token_usage["breakdown_by_agent"] = agent_breakdown
            
            # Add metadata including token usage
            final_report["metadata"] = {
                "processing_time_seconds": time.time() - start_time,
                "cards_detected": len(crops),
                "cards_analyzed": len(card_reports),
                "pipeline_version": "1.0.0",
                "token_usage": token_usage,
                "estimated_cost_usd": token_usage["total_cost_usd"]
            }
            
            # Log token usage summary
            print(f"\n💰 Token Usage Summary:")
            print(f"   - Total tokens: {token_usage['total_tokens']:,}")
            print(f"   - Prompt tokens: {token_usage['total_prompt_tokens']:,}")
            print(f"   - Completion tokens: {token_usage['total_completion_tokens']:,}")
            print(f"   - Total cost: ${token_usage['total_cost_usd']:.4f}")
            print(f"   - Requests: {token_usage['total_requests']}")
            
            self._report_progress("reporting", 1, 1, "Report complete!")
            
            return final_report
            
        except Exception as e:
            return {
                "error": f"Report generation failed: {str(e)}",
                "stage": "reporting",
                "cards_analyzed": len(card_reports)
            }
    
    async def analyze_batch(self,
                           image_paths: List[str],
                           output_dir: str = "./reports",
                           output_format: str = "json") -> List[Dict[str, Any]]:
        """
        Analyze multiple images in batch.
        
        Args:
            image_paths: List of image file paths
            output_dir: Directory for output reports
            output_format: "json" or "pdf"
            
        Returns:
            List of analysis reports
        """
        results = []
        total_images = len(image_paths)
        
        for idx, image_path in enumerate(image_paths):
            self._report_progress("batch_processing", idx, total_images,
                                f"Processing image {idx+1}/{total_images}")
            
            result = await self.analyze_image(
                image_path=image_path,
                output_format=output_format
            )
            
            # Save individual report
            if "error" not in result:
                if output_format == "json":
                    report_path = f"{output_dir}/report_{idx+1}.json"
                    with open(report_path, 'w') as f:
                        json.dump(result, f, indent=2)
                    result["saved_to"] = report_path
            
            results.append(result)
        
        self._report_progress("batch_processing", total_images, total_images,
                            f"Batch processing complete!")
        
        return results
    
    def get_pipeline_status(self) -> Dict[str, Any]:
        """Get current pipeline status and configuration."""
        return {
            "agents": {
                "segmenter": {"status": "ready", "model": "Gemini 2.5 Pro"},
                "identifier": {"status": "ready", "model": "Gemini 2.5 Pro"},
                "grader": {"status": "ready", "model": "Gemini 2.5 Pro"},
                "reporter": {"status": "ready", "model": "Gemini 2.5 Pro"}
            },
            "configuration": {
                "max_parallel_cards": self.max_parallel_cards,
                "caching_enabled": self.enable_caching,
                "cache_size": len(self._cache) if self._cache else 0
            }
        }
    
    async def __call__(self, **kwargs) -> Dict[str, Any]:
        """Main entry point for the coordinator."""
        return await self.analyze_image(**kwargs)