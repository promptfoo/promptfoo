
import asyncio

def call_api(prompt, options, context, state):
    return {"output": f"Received prompt: {prompt}"}

def increment(prompt, options, context, state):
    count = state.get("count", 0) + 1
    state["count"] = count
    return {"output": f"Count is {count}"}

async def async_call(prompt, options, context, state):
    await asyncio.sleep(0.1)
    return {"output": f"Async call received: {prompt}"}

def error_func(prompt, options, context, state):
    raise Exception("This is a test error")

def slow_func(prompt, options, context, state):
    import time
    time.sleep(1)
    return {"output": "Finished sleeping"}
