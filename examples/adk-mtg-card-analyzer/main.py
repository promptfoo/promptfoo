"""Main application entry point for MTG Card Analyzer."""

import os
import asyncio
from dotenv import load_dotenv
from typing import Optional

from agents.coordinator import CoordinatorAgent, PipelineProgress


def progress_callback(progress: PipelineProgress):
    """Print progress updates to console."""
    bar_length = 40
    filled = int(bar_length * progress.percentage / 100)
    bar = '█' * filled + '░' * (bar_length - filled)
    
    print(f"\r[{progress.stage}] {bar} {progress.percentage:.1f}% - {progress.message}", end='', flush=True)
    
    if progress.percentage >= 100:
        print()  # New line when stage completes


async def analyze_image(image_path: str, output_format: str = "json"):
    """Analyze a single image."""
    print(f"\n🎴 Analyzing image: {image_path}")
    
    # Initialize coordinator
    coordinator = CoordinatorAgent(
        max_parallel_cards=16,
        enable_caching=True,
        progress_callback=progress_callback
    )
    
    # Run analysis
    try:
        result = await coordinator.analyze_image(
            image_path=image_path,
            output_format=output_format
        )
        
        if "error" in result:
            print(f"\n❌ Error: {result['error']}")
        else:
            print(f"\n✅ Analysis complete!")
            print(f"   - Cards detected: {result['metadata']['cards_detected']}")
            print(f"   - Cards analyzed: {result['metadata']['cards_analyzed']}")
            print(f"   - Processing time: {result['metadata']['processing_time_seconds']:.2f}s")
            
            if output_format == "pdf":
                print(f"   - PDF saved to: {result.get('pdf_path', 'Unknown')}")
            
        return result
        
    except Exception as e:
        print(f"\n❌ Unexpected error: {str(e)}")
        return {"error": str(e)}


async def main():
    """Main CLI entry point."""
    # Load environment variables from current dir and parent dirs
    load_dotenv()  # Load from current directory
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))  # Load from promptfoo root
    
    # Check for required environment variables
    if not os.getenv("GOOGLE_API_KEY"):
        print("⚠️  Warning: GOOGLE_API_KEY not set. Some features may not work.")
    
    # Example usage
    print("🎯 MTG Card Analyzer - ADK Example")
    print("=" * 50)
    
    # Create sample directories
    os.makedirs("./data", exist_ok=True)
    os.makedirs("./reports", exist_ok=True)
    os.makedirs("./samples", exist_ok=True)
    
    # Check if we have a sample image
    sample_image = "./samples/sample_cards.jpg"
    
    if os.path.exists(sample_image):
        # Analyze the sample image
        result = await analyze_image(sample_image, output_format="json")
        
        # Save JSON result
        if "error" not in result:
            import json
            with open("./reports/sample_analysis.json", "w") as f:
                json.dump(result, f, indent=2)
            print("\n📄 JSON report saved to: ./reports/sample_analysis.json")
            
            # Also generate PDF
            pdf_result = await analyze_image(sample_image, output_format="pdf")
            if "pdf_path" in pdf_result:
                print(f"📑 PDF report saved to: {pdf_result['pdf_path']}")
    else:
        print("\n⚠️  No sample image found at ./samples/sample_cards.jpg")
        print("   Please add a sample image to test the analyzer.")
        print("\n   You can also use the web interface by running:")
        print("   python server.py")


if __name__ == "__main__":
    asyncio.run(main())