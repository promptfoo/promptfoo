"""Main application entry point for MTG Card Analyzer."""

import os
import asyncio
import argparse
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
    
    # Initialize coordinator with selected segmentation mode
    coordinator = CoordinatorAgent(
        max_parallel_cards=16,
        enable_caching=True,
        progress_callback=progress_callback,
        segmentation_mode=args.segmentation_mode
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
            
            # Display token usage if available
            if 'token_usage' in result['metadata']:
                token_usage = result['metadata']['token_usage']
                print(f"\n📊 Token Usage:")
                print(f"   - Total tokens: {token_usage['total_tokens']:,}")
                print(f"   - Cost: ${token_usage['total_cost_usd']:.4f}")
                print(f"   - Avg per card: {token_usage['average_tokens_per_request']:,} tokens")
            
            if output_format == "pdf":
                print(f"   - PDF saved to: {result.get('pdf_path', 'Unknown')}")
            
        return result
        
    except Exception as e:
        print(f"\n❌ Unexpected error: {str(e)}")
        return {"error": str(e)}


async def main():
    """Main CLI entry point."""
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="MTG Card Analyzer - Google ADK Example")
    parser.add_argument(
        "--segmentation-mode",
        choices=["basic", "advanced", "genai", "sam2"],
        default="genai",
        help="Segmentation method to use (default: genai)"
    )
    parser.add_argument(
        "--image",
        default="./samples/sample_cards.jpg",
        help="Path to image file to analyze"
    )
    parser.add_argument(
        "--output-format",
        choices=["json", "pdf"],
        default="json",
        help="Output format for the report (default: json)"
    )
    args = parser.parse_args()
    
    # Load environment variables from current dir and parent dirs
    load_dotenv()  # Load from current directory
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))  # Load from promptfoo root
    
    # Check for required environment variables
    if not os.getenv("GOOGLE_API_KEY"):
        print("⚠️  Warning: GOOGLE_API_KEY not set. Some features may not work.")
    
    # Example usage
    print("🎯 MTG Card Analyzer - ADK Example")
    print(f"   Segmentation: {args.segmentation_mode}")
    print(f"   Image: {args.image}")
    print(f"   Output: {args.output_format}")
    print("=" * 50)
    
    # Create sample directories
    os.makedirs("./data", exist_ok=True)
    os.makedirs("./reports", exist_ok=True)
    os.makedirs("./samples", exist_ok=True)
    
    # Check if we have a sample image
    sample_image = args.image
    
    if os.path.exists(sample_image):
        # Analyze the sample image
        result = await analyze_image(sample_image, output_format=args.output_format)
        
        # Save JSON result
        if "error" not in result:
            import json
            with open("./reports/sample_analysis.json", "w") as f:
                json.dump(result, f, indent=2)
            print("\n📄 JSON report saved to: ./reports/sample_analysis.json")
            
            # Also generate PDF if requested
            if args.output_format == "json":
                pdf_result = await analyze_image(sample_image, output_format="pdf")
                if "pdf_path" in pdf_result:
                    print(f"📑 PDF report saved to: {pdf_result['pdf_path']}")
    else:
        print(f"\n⚠️  No sample image found at {sample_image}")
        print("   Please add a sample image to test the analyzer.")
        print("\n   Usage: python main.py --image path/to/image.jpg")
        print("   Or use the web interface: python server.py")


if __name__ == "__main__":
    asyncio.run(main())