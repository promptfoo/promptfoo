/**
 * Mock airline booking function callbacks
 * All functions receive JSON string arguments and return JSON string responses
 */

function getUserProfile(args) {
  try {
    const { user_id } = JSON.parse(args);

    // Mock user profiles based on the user_id
    const profiles = {
      mia_li_3668: {
        user_id: 'mia_li_3668',
        first_name: 'Mia',
        last_name: 'Li',
        membership_tier: 'gold',
        email: 'mia.li@email.com',
        payment_methods: [
          { id: 'cert_large', type: 'certificate', value: 250 },
          { id: 'cert_small', type: 'certificate', value: 100 },
          { id: 'card_7447', type: 'credit_card', last_four: '7447' },
        ],
        preferences: {
          seat_preference: 'aisle',
          meal_preference: 'standard',
        },
      },
      tony_plus_5980: {
        user_id: 'tony_plus_5980',
        first_name: 'Tony',
        last_name: 'Rodriguez',
        membership_tier: 'silver',
        email: 'tony@email.com',
        payment_methods: [{ id: 'card_9321', type: 'credit_card', last_four: '9321' }],
        preferences: {
          seat_preference: 'window',
          meal_preference: 'vegetarian',
        },
      },
      traveler_id_100: {
        user_id: 'traveler_id_100',
        first_name: 'Alex',
        last_name: 'Johnson',
        membership_tier: 'regular',
        email: 'alex.johnson@email.com',
        payment_methods: [{ id: 'card_1122', type: 'credit_card', last_four: '1122' }],
        preferences: {
          seat_preference: 'aisle',
          meal_preference: 'standard',
          accessibility_needs: ['wheelchair_assistance'],
        },
      },
    };

    const profile = profiles[user_id] || {
      user_id,
      first_name: 'John',
      last_name: 'Doe',
      membership_tier: 'regular',
      email: 'john.doe@email.com',
      payment_methods: [{ id: 'card_1234', type: 'credit_card', last_four: '1234' }],
      preferences: {
        seat_preference: 'aisle',
        meal_preference: 'standard',
      },
    };

    return JSON.stringify({ success: true, data: profile });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}

function searchFlights(args) {
  try {
    const { origin, destination, departure_date, cabin_class, passengers } = JSON.parse(args);

    // Mock flight data
    const flights = [
      {
        flight_number: 'AS301',
        airline: 'Alaska Airlines',
        origin: 'JFK',
        destination: 'SEA',
        departure_time: '11:30',
        arrival_time: '14:45',
        duration: '6h 15m',
        stops: 0,
        aircraft: 'Boeing 737-900',
        price: cabin_class === 'economy' ? 325 : cabin_class === 'business' ? 850 : 1200,
        available_seats: 23,
      },
      {
        flight_number: 'DL157',
        airline: 'Delta Air Lines',
        origin: 'JFK',
        destination: 'SEA',
        departure_time: '15:20',
        arrival_time: '18:30',
        duration: '6h 10m',
        stops: 0,
        aircraft: 'Airbus A321',
        price: cabin_class === 'economy' ? 340 : cabin_class === 'business' ? 895 : 1250,
        available_seats: 18,
      },
      {
        flight_number: 'UA456',
        airline: 'United Airlines',
        origin: 'JFK',
        destination: 'SEA',
        departure_time: '12:15',
        arrival_time: '17:45',
        duration: '7h 30m',
        stops: 1,
        stop_cities: ['DEN'],
        aircraft: 'Boeing 757-200',
        price: cabin_class === 'economy' ? 295 : cabin_class === 'business' ? 750 : 1100,
        available_seats: 31,
      },
    ];

    return JSON.stringify({
      success: true,
      data: {
        search_criteria: { origin, destination, departure_date, cabin_class, passengers },
        flights,
        total_results: flights.length,
      },
    });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}

function bookFlight(args) {
  try {
    const { user_id, flight_details, passengers, payment_method, checked_bags, travel_insurance } =
      JSON.parse(args);

    // Generate a mock reservation
    const reservation = {
      reservation_id: 'PNR' + Math.random().toString(36).substr(2, 6).toUpperCase(),
      user_id,
      flight_details,
      passengers,
      payment_method,
      checked_bags: checked_bags || 0,
      travel_insurance: travel_insurance || false,
      total_price: 325 + Math.max(0, (checked_bags || 0) - 1) * 50 + (travel_insurance ? 30 : 0),
      booking_status: 'confirmed',
      confirmation_number: 'CF' + Math.random().toString(36).substr(2, 8).toUpperCase(),
      booking_date: new Date().toISOString(),
    };

    return JSON.stringify({
      success: true,
      data: reservation,
      message: `Flight successfully booked! Confirmation number: ${reservation.confirmation_number}`,
    });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}

function getReservation(args) {
  try {
    const { user_id, reservation_id } = JSON.parse(args);

    // Mock reservation lookup
    const reservation = {
      reservation_id,
      user_id,
      flight_details: {
        outbound_flight: 'AS301',
        departure_date: '2024-05-20',
        departure_time: '11:30',
        arrival_time: '14:45',
      },
      status: 'confirmed',
      total_price: 325,
      booking_date: '2024-05-15',
    };

    return JSON.stringify({ success: true, data: reservation });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}

function modifyReservation(args) {
  try {
    const { user_id, reservation_id, modification_type, new_details } = JSON.parse(args);

    const result = {
      reservation_id,
      modification_type,
      status: 'modified',
      additional_charges: modification_type === 'change_flights' ? 75 : 0,
      new_confirmation: 'CF' + Math.random().toString(36).substr(2, 8).toUpperCase(),
    };

    return JSON.stringify({ success: true, data: result });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}

function cancelReservation(args) {
  try {
    const { user_id, reservation_id, reason } = JSON.parse(args);

    const result = {
      reservation_id,
      cancellation_status: 'cancelled',
      refund_amount: reason === 'airline_cancelled' ? 325 : 250,
      refund_method: 'original_payment_method',
      processing_time: '3-5 business days',
    };

    return JSON.stringify({ success: true, data: result });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}

function offerCompensation(args) {
  try {
    const { user_id, reservation_id, issue_type, passenger_count } = JSON.parse(args);

    const compensation = {
      compensation_type: 'travel_certificate',
      amount: issue_type === 'cancelled_flight' ? 400 : 200,
      certificate_id: 'COMP' + Math.random().toString(36).substr(2, 8).toUpperCase(),
      expiry_date: '2025-05-20',
      terms: 'Valid for future bookings, non-transferable',
    };

    return JSON.stringify({ success: true, data: compensation });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}

module.exports = {
  getUserProfile,
  searchFlights,
  bookFlight,
  getReservation,
  modifyReservation,
  cancelReservation,
  offerCompensation,
};
