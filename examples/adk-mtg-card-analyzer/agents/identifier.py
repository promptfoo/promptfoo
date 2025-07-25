"""Card identification agent using Gemini 2.5 Pro vision capabilities."""

import base64
from PIL import Image
import json
import os
from typing import List, Dict, Optional, Tuple
import aiohttp
import asyncio

from google.adk import Agent
from google.adk.generative_models import GenerativeModel

from .base import MTGAnalysisAgent, CardCrop, CardIdentity


class IdentifierAgent(Agent):
    """Agent for identifying cards using Gemini 2.5 Pro's vision capabilities."""
    
    def __init__(self, model_name: str = "gemini-2.5-pro", **kwargs):
        # Initialize with Gemini model
        model = GenerativeModel(model_name)
        
        super().__init__(
            name="CardIdentifierAgent",
            model=model,
            description="Identifies Magic: The Gathering cards using vision analysis",
            instructions="""You are an expert at identifying Magic: The Gathering cards from images.
            
            For each card image provided:
            1. Identify the card name, set, and collector number
            2. Provide the Oracle text if visible
            3. Rate your confidence in the identification (0.0 to 1.0)
            
            Return a JSON response with this structure:
            {
                "cards": [
                    {
                        "name": "Card Name",
                        "set_code": "SET",
                        "collector_number": "123",
                        "oracle_text": "Card text if visible",
                        "confidence": 0.95,
                        "reasoning": "Brief explanation of identification"
                    }
                ]
            }
            
            If you cannot identify a card, still provide a response with confidence < 0.5 and explain why.
            Focus on visual elements like artwork, name, mana cost, and any visible text.""",
            **kwargs
        )
    
    async def identify_card(self, crop: CardCrop) -> CardIdentity:
        """Identify a single card from a crop using Gemini vision."""
        # Convert crop bytes to base64 for Gemini
        image_base64 = base64.b64encode(crop.image_rgb).decode('utf-8')
        
        # Create prompt with image
        prompt = f"""Analyze this Magic: The Gathering card image and identify it.
        
        <image>data:image/png;base64,{image_base64}</image>
        
        Provide your identification in the specified JSON format."""
        
        try:
            # Call Gemini for identification
            response = await self.run(prompt)
            
            # Parse response
            result = json.loads(response)
            
            if result.get("cards") and len(result["cards"]) > 0:
                card_data = result["cards"][0]
                
                # Fetch additional data from Scryfall if we have high confidence
                scryfall_id = None
                if card_data.get("confidence", 0) > 0.7 and card_data.get("name"):
                    scryfall_data = await self.fetch_scryfall_data(card_data["name"])
                    if scryfall_data:
                        scryfall_id = scryfall_data.get("id")
                        # Update with accurate data
                        card_data["set_code"] = scryfall_data.get("set", card_data.get("set_code", "UNK"))
                        card_data["collector_number"] = scryfall_data.get("collector_number", card_data.get("collector_number", "0"))
                        card_data["oracle_text"] = scryfall_data.get("oracle_text", card_data.get("oracle_text"))
                
                return CardIdentity(
                    scryfall_id=scryfall_id or f"gemini-{hash(card_data.get('name', 'unknown'))}",
                    similarity=card_data.get("confidence", 0.5),
                    set_code=card_data.get("set_code", "UNK"),
                    collector_number=str(card_data.get("collector_number", "0")),
                    name=card_data.get("name", "Unknown Card"),
                    oracle_text=card_data.get("oracle_text")
                )
                
        except Exception as e:
            print(f"Error identifying card: {e}")
        
        # Fallback response
        return CardIdentity(
            scryfall_id="unknown",
            similarity=0.0,
            set_code="UNK",
            collector_number="0",
            name="Unidentified Card",
            oracle_text="Could not identify this card"
        )
    
    async def fetch_scryfall_data(self, card_name: str) -> Optional[Dict]:
        """Fetch card data from Scryfall API."""
        async with aiohttp.ClientSession() as session:
            try:
                url = f"https://api.scryfall.com/cards/named?fuzzy={card_name}"
                async with session.get(url) as response:
                    if response.status == 200:
                        return await response.json()
            except Exception as e:
                print(f"Error fetching Scryfall data: {e}")
        return None
    
    async def identify_batch(self, crops: List[CardCrop], max_batch_size: int = 10) -> List[CardIdentity]:
        """Identify multiple cards in a single Gemini call for efficiency."""
        if len(crops) <= max_batch_size:
            # Process all in one batch
            return await self._process_batch(crops)
        else:
            # Process in multiple batches
            results = []
            for i in range(0, len(crops), max_batch_size):
                batch = crops[i:i + max_batch_size]
                batch_results = await self._process_batch(batch)
                results.extend(batch_results)
            return results
    
    async def _process_batch(self, crops: List[CardCrop]) -> List[CardIdentity]:
        """Process a batch of cards with Gemini."""
        # Prepare batch prompt with multiple images
        prompt_parts = ["Analyze these Magic: The Gathering card images and identify each one:\n"]
        
        for idx, crop in enumerate(crops):
            image_base64 = base64.b64encode(crop.image_rgb).decode('utf-8')
            prompt_parts.append(f"\nCard {idx + 1}:")
            prompt_parts.append(f"<image>data:image/png;base64,{image_base64}</image>")
        
        prompt_parts.append("\nProvide identifications for all cards in the specified JSON format.")
        prompt = "\n".join(prompt_parts)
        
        try:
            # Call Gemini for batch identification
            response = await self.run(prompt)
            result = json.loads(response)
            
            identities = []
            cards_data = result.get("cards", [])
            
            # Process each identified card
            for idx, crop in enumerate(crops):
                if idx < len(cards_data):
                    card_data = cards_data[idx]
                    
                    # Fetch Scryfall data for high-confidence identifications
                    scryfall_id = None
                    if card_data.get("confidence", 0) > 0.7 and card_data.get("name"):
                        scryfall_data = await self.fetch_scryfall_data(card_data["name"])
                        if scryfall_data:
                            scryfall_id = scryfall_data.get("id")
                            card_data["set_code"] = scryfall_data.get("set", card_data.get("set_code", "UNK"))
                            card_data["collector_number"] = scryfall_data.get("collector_number", card_data.get("collector_number", "0"))
                            card_data["oracle_text"] = scryfall_data.get("oracle_text", card_data.get("oracle_text"))
                    
                    identity = CardIdentity(
                        scryfall_id=scryfall_id or f"gemini-{hash(card_data.get('name', 'unknown'))}",
                        similarity=card_data.get("confidence", 0.5),
                        set_code=card_data.get("set_code", "UNK"),
                        collector_number=str(card_data.get("collector_number", "0")),
                        name=card_data.get("name", "Unknown Card"),
                        oracle_text=card_data.get("oracle_text")
                    )
                else:
                    # Fallback for missing identifications
                    identity = CardIdentity(
                        scryfall_id="unknown",
                        similarity=0.0,
                        set_code="UNK",
                        collector_number="0",
                        name="Unidentified Card",
                        oracle_text="Could not identify this card"
                    )
                
                identities.append(identity)
            
            return identities
            
        except Exception as e:
            print(f"Error in batch identification: {e}")
            # Return fallback identities
            return [
                CardIdentity(
                    scryfall_id="error",
                    similarity=0.0,
                    set_code="UNK",
                    collector_number="0",
                    name="Error Identifying Card",
                    oracle_text=str(e)
                ) for _ in crops
            ]
    
    async def __call__(self, crops: List[CardCrop]) -> List[CardIdentity]:
        """Identify multiple card crops using batch processing."""
        return await self.identify_batch(crops)