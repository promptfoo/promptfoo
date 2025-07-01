"""
Pydantic models for structured outputs in the travel planning system.
"""

from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class DateRange(BaseModel):
    """Date range for travel"""
    start_date: date = Field(description="Start date of travel")
    end_date: date = Field(description="End date of travel")
    
    @property
    def duration_days(self) -> int:
        return (self.end_date - self.start_date).days + 1


class Flight(BaseModel):
    """Flight information"""
    airline: str = Field(description="Airline name")
    flight_number: str = Field(description="Flight number")
    departure_airport: str = Field(description="Departure airport code")
    arrival_airport: str = Field(description="Arrival airport code")
    departure_time: datetime = Field(description="Departure time")
    arrival_time: datetime = Field(description="Arrival time")
    price: float = Field(description="Price in USD")
    duration_hours: float = Field(description="Flight duration in hours")


class Hotel(BaseModel):
    """Hotel information"""
    name: str = Field(description="Hotel name")
    address: str = Field(description="Hotel address")
    rating: float = Field(description="Rating out of 5")
    price_per_night: float = Field(description="Price per night in USD")
    amenities: List[str] = Field(description="List of amenities")
    distance_to_center: str = Field(description="Distance to city center")
    available: bool = Field(default=True, description="Availability status")


class Activity(BaseModel):
    """Activity or attraction"""
    name: str = Field(description="Activity name")
    description: str = Field(description="Brief description")
    duration_hours: float = Field(description="Estimated duration in hours")
    price_per_person: float = Field(description="Price per person in USD")
    category: str = Field(description="Category (e.g., sightseeing, adventure, cultural)")
    recommended_time: Optional[str] = Field(None, description="Recommended time of day")


class DayItinerary(BaseModel):
    """Itinerary for a single day"""
    day: int = Field(description="Day number of the trip")
    day_date: date = Field(description="Date")
    morning_activity: Optional[Activity] = Field(None, description="Morning activity")
    afternoon_activity: Optional[Activity] = Field(None, description="Afternoon activity")
    evening_activity: Optional[Activity] = Field(None, description="Evening activity")
    meals_recommendations: List[str] = Field(default_factory=list, description="Restaurant recommendations")
    
    
class WeatherInfo(BaseModel):
    """Weather information"""
    temperature: float = Field(description="Temperature in Celsius")
    conditions: str = Field(description="Weather conditions")
    precipitation_chance: float = Field(description="Chance of precipitation (0-100)")
    humidity: float = Field(description="Humidity percentage")
    

class TravelPlan(BaseModel):
    """Complete travel plan"""
    destination: str = Field(description="Travel destination")
    dates: DateRange = Field(description="Travel dates")
    flights: List[Flight] = Field(default_factory=list, description="Flight options")
    hotels: List[Hotel] = Field(default_factory=list, description="Hotel options")
    daily_itinerary: List[DayItinerary] = Field(default_factory=list, description="Day-by-day itinerary")
    estimated_total_cost: float = Field(description="Estimated total cost in USD")
    weather_forecast: Optional[WeatherInfo] = Field(None, description="Weather forecast for the period")
    travel_tips: List[str] = Field(default_factory=list, description="Useful travel tips")
    

class SearchCriteria(BaseModel):
    """Search criteria for travel planning"""
    destination: str = Field(description="Desired destination")
    start_date: Optional[date] = Field(None, description="Preferred start date")
    end_date: Optional[date] = Field(None, description="Preferred end date")
    budget_per_person: Optional[float] = Field(None, description="Budget per person in USD")
    travelers_count: int = Field(default=1, description="Number of travelers")
    preferences: List[str] = Field(default_factory=list, description="Travel preferences (e.g., family-friendly, adventure)") 