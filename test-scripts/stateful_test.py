#!/usr/bin/env python3
"""
Stateful test script for persistent Python provider validation
Tests state persistence, memory management, and stateful computations
"""

import time
import json
import random
from datetime import datetime
from collections import defaultdict

# Persistent state across calls
state = {
    "call_history": [],
    "user_sessions": defaultdict(dict),
    "cache": {},
    "counters": defaultdict(int),
    "initialized_at": None,
    "computation_results": []
}

def init_provider():
    """Initialize provider state"""
    global state
    state["initialized_at"] = datetime.now().isoformat()
    state["provider_id"] = random.randint(10000, 99999)

    # Simulate expensive initialization
    time.sleep(0.1)

    return {
        "status": "initialized",
        "provider_id": state["provider_id"],
        "initialized_at": state["initialized_at"]
    }

def call_api(prompt, options=None, context=None, persistent_state=None):
    """Main API with stateful operations"""
    global state

    if options is None:
        options = {}
    if context is None:
        context = {}

    # Initialize if not done
    if state["initialized_at"] is None:
        init_provider()

    call_info = {
        "prompt": prompt,
        "timestamp": datetime.now().isoformat(),
        "call_number": len(state["call_history"]) + 1
    }
    state["call_history"].append(call_info)

    prompt_lower = prompt.lower()

    if "initialize complex state" in prompt_lower:
        # Test complex state initialization
        session_id = options.get("session_id", "default")

        if session_id not in state["user_sessions"]:
            # Initialize expensive session state
            time.sleep(0.2)  # Simulate expensive initialization
            state["user_sessions"][session_id] = {
                "created_at": datetime.now().isoformat(),
                "session_data": {
                    "preferences": {"theme": "dark", "language": "en"},
                    "computed_values": [random.random() for _ in range(100)],
                    "session_counter": 0
                }
            }

        state["user_sessions"][session_id]["session_data"]["session_counter"] += 1
        state["counters"]["complex_state_calls"] += 1

        return {
            "output": f"Complex state initialized for session {session_id}",
            "session_info": state["user_sessions"][session_id],
            "total_sessions": len(state["user_sessions"]),
            "call_count": len(state["call_history"]),
            "state_persistent": state["initialized_at"] is not None,
            "provider_id": state.get("provider_id")
        }

    elif "run expensive computation" in prompt_lower:
        # Test caching and expensive computations
        import re
        cache_key_match = re.search(r'cache[_\s]+key[:\s]+(\w+)', prompt)
        cache_key = cache_key_match.group(1) if cache_key_match else "default"

        state["counters"]["computation_calls"] += 1

        if cache_key in state["cache"]:
            # Return cached result
            cached_result = state["cache"][cache_key]
            return {
                "output": cached_result["result"],
                "cached": True,
                "cache_key": cache_key,
                "original_computation_time": cached_result["computation_time"],
                "call_count": len(state["call_history"]),
                "cache_hits": state["counters"]["cache_hits"],
                "provider_id": state.get("provider_id")
            }
        else:
            # Perform expensive computation
            start_time = time.time()
            time.sleep(0.3)  # Simulate expensive computation

            # Complex mathematical computation
            result = sum(i ** 2 for i in range(1000))
            computation_time = time.time() - start_time

            # Cache the result
            state["cache"][cache_key] = {
                "result": f"Computation result: {result}",
                "computation_time": computation_time,
                "computed_at": datetime.now().isoformat()
            }
            state["counters"]["cache_misses"] += 1

            return {
                "output": f"Computation result: {result}",
                "cached": False,
                "cache_key": cache_key,
                "computation_time": computation_time,
                "call_count": len(state["call_history"]),
                "cache_size": len(state["cache"]),
                "provider_id": state.get("provider_id")
            }

    elif "get state summary" in prompt_lower:
        # Return comprehensive state summary
        return {
            "output": "State summary generated",
            "state_summary": {
                "call_count": len(state["call_history"]),
                "active_sessions": len(state["user_sessions"]),
                "cache_entries": len(state["cache"]),
                "counters": dict(state["counters"]),
                "provider_id": state.get("provider_id"),
                "initialized_at": state["initialized_at"],
                "uptime_seconds": (
                    datetime.now() - datetime.fromisoformat(state["initialized_at"])
                ).total_seconds() if state["initialized_at"] else 0
            },
            "recent_calls": state["call_history"][-5:],  # Last 5 calls
            "memory_usage": {
                "call_history_size": len(state["call_history"]),
                "user_sessions_count": len(state["user_sessions"]),
                "cache_keys": list(state["cache"].keys())
            }
        }

    elif "stress test" in prompt_lower:
        # Stress test with many state updates
        import re
        iterations_match = re.search(r'(\d+)', prompt)
        iterations = int(iterations_match.group(1)) if iterations_match else 100

        stress_results = []
        start_time = time.time()

        for i in range(min(iterations, 1000)):  # Cap at 1000 for safety
            key = f"stress_{i}"
            state["cache"][key] = {
                "value": random.random(),
                "iteration": i
            }
            stress_results.append(state["cache"][key]["value"])
            state["counters"][f"stress_iteration_{i}"] += 1

        processing_time = time.time() - start_time
        state["counters"]["stress_test_calls"] += 1

        return {
            "output": f"Stress test completed with {len(stress_results)} iterations",
            "iterations": len(stress_results),
            "processing_time": processing_time,
            "average_time_per_iteration": processing_time / len(stress_results),
            "sample_results": stress_results[:10],
            "state_size_after": {
                "cache_entries": len(state["cache"]),
                "counter_entries": len(state["counters"])
            },
            "call_count": len(state["call_history"]),
            "provider_id": state.get("provider_id")
        }

    # Default response with state info
    state["counters"]["default_calls"] += 1
    return {
        "output": f"Processed: {prompt}",
        "call_count": len(state["call_history"]),
        "state_initialized": state["initialized_at"] is not None,
        "provider_id": state.get("provider_id"),
        "counters_snapshot": dict(state["counters"])
    }

# Alternative async function for testing
async def async_call_api(prompt, options=None, context=None):
    """Async version for testing async compatibility"""
    import asyncio

    # Simulate async work
    await asyncio.sleep(0.1)

    result = call_api(prompt, options, context)
    result["async_execution"] = True
    result["execution_mode"] = "async"

    return result

if __name__ == "__main__":
    # Direct test
    print("Testing stateful_test.py")
    print(json.dumps(call_api("Initialize complex state"), indent=2))
    print(json.dumps(call_api("Run expensive computation with cache key: test123"), indent=2))
    print(json.dumps(call_api("Run expensive computation with cache key: test123"), indent=2))  # Should be cached
    print(json.dumps(call_api("Get state summary"), indent=2))