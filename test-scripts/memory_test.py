#!/usr/bin/env python3
"""
Memory management test script for persistent Python provider validation
Tests memory usage, garbage collection, and resource cleanup
"""

import gc
import sys
import time
import json
from datetime import datetime

# Global state to track memory usage
memory_tracking = {
    "allocated_objects": [],
    "call_count": 0,
    "peak_objects": 0,
    "gc_collections": 0
}

def get_memory_info():
    """Get current memory information"""
    return {
        "object_count": len(gc.get_objects()),
        "gc_counts": gc.get_count(),
        "allocated_objects": len(memory_tracking["allocated_objects"]),
        "peak_objects": memory_tracking["peak_objects"]
    }

def call_api(prompt, options=None, context=None):
    """Main API function for memory testing"""
    global memory_tracking

    if options is None:
        options = {}

    memory_tracking["call_count"] += 1
    start_memory = get_memory_info()

    prompt_lower = prompt.lower()

    try:
        if "allocate_large_memory" in prompt_lower:
            # Extract memory size from prompt
            import re
            size_match = re.search(r'(\d+)(mb|kb|gb)', prompt_lower)
            if size_match:
                amount = int(size_match.group(1))
                unit = size_match.group(2)

                # Convert to bytes
                if unit == "kb":
                    bytes_to_allocate = amount * 1024
                elif unit == "mb":
                    bytes_to_allocate = amount * 1024 * 1024
                elif unit == "gb":
                    bytes_to_allocate = amount * 1024 * 1024 * 1024
                else:
                    bytes_to_allocate = amount

                # Allocate memory (be careful not to crash)
                max_safe_size = 50 * 1024 * 1024  # 50MB max for safety
                actual_size = min(bytes_to_allocate, max_safe_size)

                # Create large object
                large_data = bytearray(actual_size)
                for i in range(min(1000, actual_size)):
                    large_data[i] = i % 256

                # Store reference to prevent immediate GC
                memory_tracking["allocated_objects"].append({
                    "data": large_data,
                    "size": actual_size,
                    "allocated_at": datetime.now().isoformat(),
                    "call_id": memory_tracking["call_count"]
                })

                # Update peak tracking
                current_objects = len(memory_tracking["allocated_objects"])
                if current_objects > memory_tracking["peak_objects"]:
                    memory_tracking["peak_objects"] = current_objects

                end_memory = get_memory_info()

                return {
                    "output": f"Allocated {actual_size} bytes ({actual_size / (1024*1024):.2f} MB)",
                    "requested_size": bytes_to_allocate,
                    "actual_size": actual_size,
                    "capped_for_safety": actual_size < bytes_to_allocate,
                    "memory_before": start_memory,
                    "memory_after": end_memory,
                    "memory_delta": {
                        "object_count_change": end_memory["object_count"] - start_memory["object_count"],
                        "allocated_objects_change": end_memory["allocated_objects"] - start_memory["allocated_objects"]
                    },
                    "total_allocated_objects": len(memory_tracking["allocated_objects"]),
                    "call_count": memory_tracking["call_count"]
                }

        elif "create_many_objects" in prompt_lower:
            # Extract object count from prompt
            import re
            count_match = re.search(r'(\d+)', prompt)
            count = int(count_match.group(1)) if count_match else 1000

            # Cap for safety
            max_objects = 50000
            actual_count = min(count, max_objects)

            # Create many small objects
            object_list = []
            for i in range(actual_count):
                obj = {
                    "id": i,
                    "data": f"object_{i}",
                    "timestamp": time.time(),
                    "nested": {
                        "value": i * 2,
                        "text": f"nested_data_{i}"
                    }
                }
                object_list.append(obj)

            # Store some references
            memory_tracking["allocated_objects"].append({
                "objects": object_list,
                "count": actual_count,
                "allocated_at": datetime.now().isoformat(),
                "call_id": memory_tracking["call_count"]
            })

            end_memory = get_memory_info()

            return {
                "output": f"Created {actual_count} objects",
                "requested_count": count,
                "actual_count": actual_count,
                "capped_for_safety": actual_count < count,
                "memory_before": start_memory,
                "memory_after": end_memory,
                "object_sample": object_list[:3],  # First 3 objects as sample
                "total_allocated_batches": len(memory_tracking["allocated_objects"]),
                "call_count": memory_tracking["call_count"]
            }

        elif "force_garbage_collection" in prompt_lower:
            # Force garbage collection and report results
            before_gc = get_memory_info()

            # Run garbage collection
            collected = gc.collect()
            memory_tracking["gc_collections"] += 1

            after_gc = get_memory_info()

            return {
                "output": f"Garbage collection completed, collected {collected} objects",
                "collected_objects": collected,
                "memory_before_gc": before_gc,
                "memory_after_gc": after_gc,
                "memory_freed": {
                    "object_count_reduction": before_gc["object_count"] - after_gc["object_count"]
                },
                "gc_run_count": memory_tracking["gc_collections"],
                "call_count": memory_tracking["call_count"]
            }

        elif "clear_allocated_memory" in prompt_lower:
            # Clear all tracked allocations
            before_clear = get_memory_info()
            objects_cleared = len(memory_tracking["allocated_objects"])

            memory_tracking["allocated_objects"].clear()

            # Force GC after clearing
            collected = gc.collect()

            after_clear = get_memory_info()

            return {
                "output": f"Cleared {objects_cleared} allocated object batches",
                "objects_cleared": objects_cleared,
                "gc_collected": collected,
                "memory_before": before_clear,
                "memory_after": after_clear,
                "memory_freed": {
                    "object_count_reduction": before_clear["object_count"] - after_clear["object_count"]
                },
                "call_count": memory_tracking["call_count"]
            }

        elif "memory_stress_test" in prompt_lower:
            # Combined stress test
            stress_results = []

            # Allocate and deallocate in cycles
            for cycle in range(5):
                # Allocate
                temp_data = [list(range(1000)) for _ in range(100)]
                memory_tracking["allocated_objects"].append({
                    "cycle_data": temp_data,
                    "cycle": cycle,
                    "allocated_at": datetime.now().isoformat()
                })

                stress_results.append({
                    "cycle": cycle,
                    "action": "allocated",
                    "memory_info": get_memory_info()
                })

                # Deallocate previous cycle (keep only current)
                if len(memory_tracking["allocated_objects"]) > 1:
                    memory_tracking["allocated_objects"].pop(0)

                stress_results.append({
                    "cycle": cycle,
                    "action": "deallocated",
                    "memory_info": get_memory_info()
                })

            # Final GC
            collected = gc.collect()

            final_memory = get_memory_info()

            return {
                "output": "Memory stress test completed",
                "cycles_completed": 5,
                "final_gc_collected": collected,
                "stress_results": stress_results,
                "final_memory": final_memory,
                "start_memory": start_memory,
                "memory_delta": {
                    "object_count_change": final_memory["object_count"] - start_memory["object_count"]
                },
                "call_count": memory_tracking["call_count"]
            }

        elif "get_memory_status" in prompt_lower:
            # Report comprehensive memory status
            current_memory = get_memory_info()

            return {
                "output": "Memory status report",
                "current_memory": current_memory,
                "tracking_info": {
                    "call_count": memory_tracking["call_count"],
                    "allocated_batches": len(memory_tracking["allocated_objects"]),
                    "peak_objects": memory_tracking["peak_objects"],
                    "gc_collections": memory_tracking["gc_collections"]
                },
                "allocation_summary": [
                    {
                        "call_id": alloc.get("call_id"),
                        "size": alloc.get("size", "unknown"),
                        "count": alloc.get("count", "unknown"),
                        "allocated_at": alloc.get("allocated_at")
                    }
                    for alloc in memory_tracking["allocated_objects"]
                ],
                "memory_status": True
            }

        # Default case
        end_memory = get_memory_info()
        return {
            "output": f"Memory test processed: {prompt}",
            "memory_before": start_memory,
            "memory_after": end_memory,
            "call_count": memory_tracking["call_count"]
        }

    except MemoryError as e:
        return {
            "error": f"Memory error: {str(e)}",
            "error_type": "memory_error",
            "memory_info": get_memory_info(),
            "call_count": memory_tracking["call_count"],
            "graceful_handling": True
        }

    except Exception as e:
        return {
            "error": f"Unexpected error: {str(e)}",
            "error_type": type(e).__name__,
            "memory_info": get_memory_info(),
            "call_count": memory_tracking["call_count"]
        }

if __name__ == "__main__":
    # Direct test
    print("Testing memory_test.py")
    print(json.dumps(call_api("allocate_large_memory: 1MB"), indent=2))
    print(json.dumps(call_api("create_many_objects: 1000"), indent=2))
    print(json.dumps(call_api("get_memory_status"), indent=2))