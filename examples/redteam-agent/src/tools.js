const { tool } = require('@langchain/core/tools');

// Define the tools for the agent to use
const getWeather = tool(
  async ({ location }) => {
    const weatherConditions = ['sunny', 'cloudy', 'rainy', 'stormy', 'snowy'];
    const temperatures = Array.from({ length: 30 }, (_, i) => i + 15); // 15-45°C

    return {
      location,
      condition: weatherConditions[Math.floor(Math.random() * weatherConditions.length)],
      temperature: temperatures[Math.floor(Math.random() * temperatures.length)],
      humidity: Math.floor(Math.random() * 100),
      windSpeed: Math.floor(Math.random() * 30),
    };
  },
  {
    name: 'get_weather',
    description: 'Get the current weather for a specific location',
  },
);

const bookFlight = tool(
  async ({ origin, destination, date, passengers }) => {
    const flightNumber = `FL${Math.floor(Math.random() * 9999)}`;
    const price = Math.floor(Math.random() * 500) + 200;

    return {
      bookingConfirmation: `BOK${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      flightNumber,
      origin,
      destination,
      date,
      passengers,
      totalPrice: price * passengers,
      departureTime: '10:00 AM',
      arrivalTime: '12:00 PM',
      status: 'confirmed',
    };
  },
  {
    name: 'book_flight',
    description: 'Book a flight between two locations',
  },
);

const bookHotel = tool(
  async ({ location, checkIn, checkOut, rooms, guests }) => {
    const hotelNames = [
      'Grand Hotel',
      'Sunset Resort',
      'City View Inn',
      'Ocean Breeze Hotel',
      'Mountain Lodge',
    ];
    const roomTypes = ['Standard', 'Deluxe', 'Suite', 'Executive'];

    return {
      bookingReference: `HB${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      hotel: hotelNames[Math.floor(Math.random() * hotelNames.length)],
      roomType: roomTypes[Math.floor(Math.random() * roomTypes.length)],
      location,
      checkIn,
      checkOut,
      rooms,
      guests,
      totalPrice: Math.floor(Math.random() * 200 + 100) * rooms,
      status: 'confirmed',
      amenities: ['WiFi', 'Breakfast', 'Pool', 'Parking'],
    };
  },
  {
    name: 'book_hotel',
    description: 'Book a hotel room at a specific location',
  },
);

const flightLookup = tool(
  async ({ origin, destination, date }) => {
    const airlines = [
      { name: 'SkyWings', code: 'SW' },
      { name: 'Global Airways', code: 'GA' },
      { name: 'Ocean Air', code: 'OA' },
      { name: 'Mountain Express', code: 'ME' },
      { name: 'Sun Airlines', code: 'SA' },
    ];

    const generateFlightTime = () => {
      const hours = Math.floor(Math.random() * 12) + 1;
      const minutes = Math.floor(Math.random() * 4) * 15;
      return `${hours}h ${minutes ? minutes + 'm' : ''}`;
    };

    const generateDepartureTime = () => {
      const hours = Math.floor(Math.random() * 24);
      const minutes = Math.floor(Math.random() * 4) * 15;
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    };

    const generateArrivalTime = (departureTime) => {
      const [hours, minutes] = departureTime.split(':').map(Number);
      const flightHours = Math.floor(Math.random() * 12) + 1;
      const newHours = (hours + flightHours) % 24;
      return `${newHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    };

    // Generate 3-5 flight options
    const numFlights = Math.floor(Math.random() * 3) + 3;
    const flights = Array.from({ length: numFlights }, () => {
      const airline = airlines[Math.floor(Math.random() * airlines.length)];
      const departureTime = generateDepartureTime();

      return {
        flightNumber: `${airline.code}${Math.floor(Math.random() * 9000) + 1000}`,
        airline: airline.name,
        origin,
        destination,
        date,
        departureTime,
        arrivalTime: generateArrivalTime(departureTime),
        duration: generateFlightTime(),
        status: ['On Time', 'On Time', 'On Time', 'Delayed'][Math.floor(Math.random() * 4)], // 75% chance of being on time
      };
    });

    return {
      origin,
      destination,
      date,
      flights: flights.sort((a, b) => {
        // Sort by departure time
        const timeA = a.departureTime.split(':').map(Number);
        const timeB = b.departureTime.split(':').map(Number);
        return timeA[0] * 60 + timeA[1] - (timeB[0] * 60 + timeB[1]);
      }),
      searchComplete: true,
      totalResults: flights.length,
    };
  },
  {
    name: 'flight_lookup',
    description:
      'Look up available flights between two locations for a specific date. Returns multiple flight options with detailed information including prices, times, and availability.',
  },
);

module.exports = { getWeather, bookFlight, bookHotel, flightLookup };
