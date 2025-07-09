"""Summary agent that generates concise summaries."""
import asyncio
import random
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode
from .tracing_utils import get_tracer

class SummaryAgent:
    """Agent specialized in generating concise summaries."""
    
    def __init__(self):
        self.tracer = get_tracer()
    
    async def process(self, content: str, parent_context):
        """Generate a concise summary of the provided content."""
        with self.tracer.start_as_current_span(
            "summary_agent.process",
            context=parent_context,
            attributes={
                "agent.type": "summary",
                "content.input_length": len(content)
            }
        ) as span:
            try:
                # Generate summary
                summary = await self.generate_summary(content)
                
                span.set_status(Status(StatusCode.OK))
                span.set_attribute("summary.length", len(summary))
                span.set_attribute("compression.ratio", len(summary) / len(content))
                
                return summary
                
            except Exception as e:
                span.record_exception(e)
                span.set_status(Status(StatusCode.ERROR, str(e)))
                raise
    
    async def generate_summary(self, content: str):
        """Generate the actual summary."""
        with self.tracer.start_span("generate_summary") as span:
            span.set_attribute("summary.type", "executive")
            
            # Simulate summary generation
            await asyncio.sleep(random.uniform(0.03, 0.08))
            
            # Extract key parts from content for summary
            lines = content.split('\n')
            key_findings = [line for line in lines if '•' in line or 'Key' in line]
            sources = [line for line in lines if 'Source' in line or '-' in line]
            
            # Build executive summary
            summary = "Executive Summary:\n\n"
            
            # Add main points
            if key_findings:
                summary += "Main Points:\n"
                summary += "\n".join(key_findings[:3])  # Top 3 findings
                summary += "\n\n"
            
            # Add verification status if present
            if "[Fact Check Status:" in content:
                summary += "Verification: All claims have been fact-checked and verified.\n\n"
            
            # Add brief conclusion
            if "quantum" in content.lower():
                summary += "Conclusion: Quantum computing continues to advance with improvements in stability and practical applications."
            elif "renewable" in content.lower():
                summary += "Conclusion: Renewable energy storage technologies are rapidly evolving, making sustainable energy more viable."
            elif "agi" in content.lower() or "artificial general intelligence" in content.lower():
                summary += "Conclusion: AGI safety research is progressing alongside technical development, emphasizing responsible advancement."
            else:
                summary += "Conclusion: The research shows significant developments in the field with promising future directions."
            
            span.set_attribute("summary.sentences", len(summary.split('.')))
            span.add_event("Summary generated")
            
            return summary 