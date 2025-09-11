#!/usr/bin/env python3
"""
Test 3: Async vs Sync Concurrency
Tests behavior of async and sync functions under concurrent load
"""
import asyncio
import time

async def call_async(prompt, options=None, context=None, state=None):
    """Async function with 1-second delay"""
    print(f"Starting async call for: {prompt}")
    await asyncio.sleep(1)  # Async sleep
    print(f"Finished async call for: {prompt}")
    return {
        "output": f"Async result: {prompt}",
        "type": "async",
        "delay": 1
    }

def call_sync(prompt, options=None, context=None, state=None):
    """Sync function with 1-second delay (blocking)"""
    print(f"Starting sync call for: {prompt}")
    time.sleep(1)  # Blocking sleep
    print(f"Finished sync call for: {prompt}")
    return {
        "output": f"Sync result: {prompt}",
        "type": "sync", 
        "delay": 1
    }