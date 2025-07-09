"""Coordinator agent that routes queries to specialized agents."""


from google import genai
from opentelemetry import context
from opentelemetry.trace import Status, StatusCode

from .fact_checker import FactCheckerAgent
from .research import ResearchAgent
from .summary import SummaryAgent
from .tracing_utils import extract_trace_context, get_tracer


class CoordinatorAgent:
    """Main coordinator that routes queries to specialized agents."""

    def __init__(self):
        # Use Google AI Studio instead of Vertex AI for easier setup
        self.client = genai.Client()
        self.model = None  # We'll use mock responses for demo
        self.research_agent = ResearchAgent()
        self.fact_checker = FactCheckerAgent()
        self.summary_agent = SummaryAgent()
        self.tracer = get_tracer()

    async def process(self, query: str, trace_context: dict):
        """Process a research query by coordinating multiple agents."""
        # Extract parent trace context
        parent_ctx = extract_trace_context(trace_context)

        # Start coordinator span
        with self.tracer.start_as_current_span(
            "coordinator_agent.process",
            context=parent_ctx,
            attributes={
                "agent.type": "coordinator",
                "query.text": query,
                "query.length": len(query),
                "evaluation.id": trace_context.get("evaluation_id") or "unknown",
                "test_case.id": trace_context.get("test_case_id") or "unknown",
            },
        ) as span:
            try:
                # Step 1: Route decision
                with self.tracer.start_span("route_decision") as route_span:
                    route_span.set_attribute("decision.query", query)

                    # For this example, we always use research -> fact check -> summary
                    # In a real system, you might use the LLM to decide routing
                    route_plan = ["research", "fact_check", "summary"]
                    route_span.set_attribute("decision.plan", str(route_plan))

                # Step 2: Execute research
                research_result = None
                if "research" in route_plan:
                    research_result = await self.research_agent.process(
                        query, context.get_current()
                    )

                # Step 3: Fact check the research
                fact_checked_result = research_result
                if "fact_check" in route_plan and research_result:
                    fact_checked_result = await self.fact_checker.process(
                        research_result, context.get_current()
                    )

                # Step 4: Generate summary
                final_result = fact_checked_result
                if "summary" in route_plan and fact_checked_result:
                    final_result = await self.summary_agent.process(
                        fact_checked_result, context.get_current()
                    )

                span.set_status(Status(StatusCode.OK))
                span.set_attribute(
                    "result.length", len(final_result) if final_result else 0
                )

                return final_result

            except Exception as e:
                span.record_exception(e)
                span.set_status(Status(StatusCode.ERROR, str(e)))
                raise
