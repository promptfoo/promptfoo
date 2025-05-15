// dealershipTools.js - Centralized repository for dealership tools and mock data

// Export dealership information
const dealershipInfo = {
  backgroundAndLocation: {
    founded: '2002 in Redwood City, CA',
    decor:
      'The showroom is decorated with red panda murals, plush toys, and greenery, designed to create a warm, family-friendly environment.',
    hours: 'Monday–Saturday: 9:00 AM to 7:00 PM; Sunday: 10:00 AM to 5:00 PM',
    location:
      'Conveniently located near the Woodside Plaza Shopping Center and accessible from U.S. Route 101 and Interstate 280.',
    address: '123 Woodside Road, Redwood City, CA 94061',
  },
  inventory: {
    brands: ['Toyota', 'Honda', 'Subaru', 'Ford', 'Tesla'],
    popularModels: [
      {
        make: 'Toyota',
        model: 'Camry',
        type: 'Reliable midsize sedan',
        features: 'Known for comfort and fuel efficiency (around 32 MPG combined)',
      },
      {
        make: 'Honda',
        model: 'CR-V',
        type: 'Compact SUV',
        features: 'Spacious interior and good resale value (around 30 MPG combined)',
      },
      {
        make: 'Subaru',
        model: 'Outback',
        type: 'Versatile crossover',
        features: 'Standard all-wheel drive, popular for its safety and durability',
      },
      {
        make: 'Ford',
        model: 'F-150',
        type: 'Pickup truck',
        features:
          "America's best-selling pickup, multiple trims available, known for towing capacity and payload versatility",
      },
      {
        make: 'Tesla',
        model: 'Model 3',
        type: 'Electric sedan',
        features: 'About 272 miles of EPA-estimated range in the base version',
      },
    ],
    preOwned:
      'Pre-owned inventory often includes models two to five years old, thoroughly inspected and often sold as Certified Pre-Owned (CPO) with extended warranties and roadside assistance.',
  },
  financingAndWarranty: {
    pricing:
      'Red Panda Motors provides competitive pricing and will match or beat many regional offers.',
    financing: {
      lenders: ['Wells Fargo Auto Loans', 'Chase Auto', 'local credit unions'],
      promotions: 'Promotional APR rates (e.g., 1.9% for 36 months on select new Toyota models)',
    },
    warranties: {
      standard:
        'Standard new car warranties depend on the brand. For example, Toyota typically provides a 3-year/36,000-mile basic warranty and a 5-year/60,000-mile powertrain warranty.',
      extended: 'Extended warranties and maintenance plans are available for purchase.',
    },
    application:
      'Customers can fill out a secure online credit application and a finance manager will contact them with personalized options.',
  },
  services: {
    testDrives: {
      scheduling: 'Customers can schedule test drives online or by phone',
      duration:
        'Test drives typically last around 15–20 minutes on nearby city streets and highways',
    },
    tradeIns:
      'Trade-in evaluations use a combination of Kelly Blue Book values and on-site inspections to determine an offer',
    serviceCenter: {
      services:
        'Routine maintenance (oil changes, tire rotations, brake inspections) and repairs by factory-trained technicians',
      hours: 'Monday–Friday: 7:30 AM to 6:00 PM and Saturday: 8:00 AM to 4:00 PM',
      scheduling: 'Customers can schedule service appointments online',
      amenities: "Free Wi-Fi, coffee, and a kids' corner",
    },
  },
  policies: {
    returns:
      'While most sales are final, Certified Pre-Owned customers have a 3-day/150-mile exchange policy if they are unsatisfied',
    support: 'A dedicated customer support line and email help address any concerns',
  },
  promotions: {
    seasonal:
      'Red Panda Motors frequently runs seasonal promotions, like holiday sales, where certain models are discounted or come with low APR financing',
    incentives: 'First-time buyer incentives or college grad rebates from manufacturers may apply',
    community:
      'The dealership supports local charities and hosts community events, like a "Family Fun Day" fundraiser or a test-drive event benefiting a local animal rescue',
  },
};

// Mock inventory database for the search tool
const vehicleInventory = [
  {
    id: 'CAM2023-001',
    make: 'Toyota',
    model: 'Camry',
    year: 2023,
    trim: 'LE',
    color: 'Celestial Silver Metallic',
    price: 26420,
    mileage: 12,
    condition: 'New',
    features: ['Backup Camera', 'Apple CarPlay', 'Android Auto', 'Lane Departure Warning'],
    inStock: true,
    location: 'Main Lot',
  },
  {
    id: 'CAM2023-002',
    make: 'Toyota',
    model: 'Camry',
    year: 2023,
    trim: 'XSE',
    color: 'Midnight Black Metallic',
    price: 32420,
    mileage: 8,
    condition: 'New',
    features: ['Leather Seats', 'Panoramic Sunroof', 'JBL Premium Audio', '360-degree Camera'],
    inStock: true,
    location: 'Showroom',
  },
  {
    id: 'CRV2022-001',
    make: 'Honda',
    model: 'CR-V',
    year: 2022,
    trim: 'EX-L',
    color: 'Modern Steel Metallic',
    price: 34800,
    mileage: 11245,
    condition: 'Used',
    features: ['Leather Seats', 'Heated Seats', 'Apple CarPlay', 'Android Auto'],
    inStock: true,
    location: 'Used Lot',
  },
  {
    id: 'OUT2023-001',
    make: 'Subaru',
    model: 'Outback',
    year: 2023,
    trim: 'Premium',
    color: 'Autumn Green Metallic',
    price: 30695,
    mileage: 18,
    condition: 'New',
    features: ['All-Wheel Drive', 'Raised Suspension', 'Roof Rails', 'StarLink Safety System'],
    inStock: true,
    location: 'Main Lot',
  },
  {
    id: 'F1502022-001',
    make: 'Ford',
    model: 'F-150',
    year: 2022,
    trim: 'XLT',
    color: 'Rapid Red Metallic',
    price: 42500,
    mileage: 8760,
    condition: 'Used',
    features: ['4x4', 'Tow Package', 'Bed Liner', 'Navigation'],
    inStock: true,
    location: 'Used Lot',
  },
  {
    id: 'TM32023-001',
    make: 'Tesla',
    model: 'Model 3',
    year: 2023,
    trim: 'Long Range',
    color: 'Pearl White Multi-Coat',
    price: 54990,
    mileage: 42,
    condition: 'New',
    features: ['Autopilot', 'Premium Interior', 'All-Wheel Drive', '358 Mile Range'],
    inStock: true,
    location: 'Showroom',
  },
];

// Mock appointments database
const appointments = [];

// Mock customer records for maintenance history lookup
const maintenanceRecords = {
  REF12345: {
    customerName: 'John Smith',
    vehicleInfo: '2020 Toyota Camry',
    vin: '1HGCM82633A123456',
    records: [
      {
        date: '2023-01-15',
        service: 'Oil Change',
        mileage: 15000,
        notes: 'Synthetic oil used, all systems normal',
        technician: 'Mike Johnson',
      },
      {
        date: '2023-04-22',
        service: 'Tire Rotation & Brake Check',
        mileage: 20000,
        notes: 'Rear brake pads at 60%, front at 70%. Tires rotated.',
        technician: 'Sarah Williams',
      },
    ],
  },
  REF67890: {
    customerName: 'Emma Davis',
    vehicleInfo: '2021 Honda CR-V',
    vin: '5J6RW2H84ML001234',
    records: [
      {
        date: '2023-03-10',
        service: '30,000 Mile Service',
        mileage: 30212,
        notes: 'Full inspection, oil change, filters replaced, fluids topped off',
        technician: 'Robert Chen',
      },
    ],
  },
};

// Mock service status lookup
const serviceStatus = {
  'SRV-2023-042': {
    customerName: 'David Wilson',
    vehicleInfo: '2019 Subaru Outback',
    dropOffDate: '2023-06-18',
    estimatedCompletion: '2023-06-19',
    currentStatus: 'In Progress',
    servicesPerformed: ['Oil Change', 'Multi-Point Inspection', 'Brake Fluid Flush'],
    notes: 'Waiting for brake fluid flush, estimated to be completed by EOD',
    serviceAdvisor: 'Jennifer Lopez',
    contactNumber: '(650) 555-7890',
  },
  'SRV-2023-043': {
    customerName: 'Michael Brown',
    vehicleInfo: '2022 Ford F-150',
    dropOffDate: '2023-06-18',
    estimatedCompletion: '2023-06-20',
    currentStatus: 'Waiting for Parts',
    servicesPerformed: [],
    requestedServices: ['Check Engine Light Diagnosis', 'Transmission Fluid Change'],
    notes: 'Waiting for transmission parts to arrive. Expected tomorrow morning.',
    serviceAdvisor: 'Carlos Rodriguez',
    contactNumber: '(650) 555-7891',
  },
};

// Mock parts inventory
const partsInventory = [
  {
    partNumber: 'TO-OIL-FILT-1',
    description: 'Toyota Oil Filter',
    compatibleVehicles: ['Toyota Camry', 'Toyota Corolla', 'Toyota RAV4'],
    price: 12.99,
    inStock: 45,
    location: 'Aisle 3, Bin 12',
  },
  {
    partNumber: 'HO-BRAKE-PAD-1',
    description: 'Honda Front Brake Pads',
    compatibleVehicles: ['Honda Civic', 'Honda Accord', 'Honda CR-V'],
    price: 89.99,
    inStock: 12,
    location: 'Aisle 5, Bin 7',
  },
  {
    partNumber: 'FO-AIR-FILT-1',
    description: 'Ford Air Filter',
    compatibleVehicles: ['Ford F-150', 'Ford Explorer', 'Ford Escape'],
    price: 24.99,
    inStock: 8,
    location: 'Aisle 2, Bin 15',
  },
  {
    partNumber: 'SU-WIPER-BL-1',
    description: 'Subaru Wiper Blades',
    compatibleVehicles: ['Subaru Outback', 'Subaru Forester', 'Subaru Crosstrek'],
    price: 34.99,
    inStock: 20,
    location: 'Aisle 1, Bin 3',
  },
  {
    partNumber: 'GE-BATTERY-1',
    description: 'Premium Car Battery',
    compatibleVehicles: ['Multiple Models'],
    price: 129.99,
    inStock: 6,
    location: 'Aisle 7, Bin 1',
  },
];

// Mock department hours
const departmentHours = {
  sales: {
    monday: '9:00 AM - 7:00 PM',
    tuesday: '9:00 AM - 7:00 PM',
    wednesday: '9:00 AM - 7:00 PM',
    thursday: '9:00 AM - 7:00 PM',
    friday: '9:00 AM - 7:00 PM',
    saturday: '10:00 AM - 6:00 PM',
    sunday: '11:00 AM - 5:00 PM',
  },
  service: {
    monday: '7:30 AM - 6:00 PM',
    tuesday: '7:30 AM - 6:00 PM',
    wednesday: '7:30 AM - 6:00 PM',
    thursday: '7:30 AM - 6:00 PM',
    friday: '7:30 AM - 6:00 PM',
    saturday: '8:00 AM - 4:00 PM',
    sunday: 'Closed',
  },
  parts: {
    monday: '8:00 AM - 5:30 PM',
    tuesday: '8:00 AM - 5:30 PM',
    wednesday: '8:00 AM - 5:30 PM',
    thursday: '8:00 AM - 5:30 PM',
    friday: '8:00 AM - 5:30 PM',
    saturday: '8:00 AM - 3:00 PM',
    sunday: 'Closed',
  },
  finance: {
    monday: '9:00 AM - 7:00 PM',
    tuesday: '9:00 AM - 7:00 PM',
    wednesday: '9:00 AM - 7:00 PM',
    thursday: '9:00 AM - 7:00 PM',
    friday: '9:00 AM - 7:00 PM',
    saturday: '10:00 AM - 6:00 PM',
    sunday: 'By Appointment Only',
  },
};

// Current promotions
const currentPromotions = [
  {
    id: 'SUMMER2023',
    name: 'Summer Sales Event',
    description: '0% APR financing for 60 months on all new Toyota models',
    validUntil: '2023-08-31',
    eligibility: 'All customers with approved credit',
    details: 'Minimum credit score of 680 required. Cannot be combined with other offers.',
  },
  {
    id: 'GRAD2023',
    name: 'Recent Graduate Program',
    description: '$500 rebate for recent college graduates on new Honda vehicles',
    validUntil: '2023-12-31',
    eligibility: 'Graduates from last 2 years with degree from accredited US college',
    details: 'Must provide proof of graduation. Can be combined with other offers.',
  },
  {
    id: 'SERVICE10',
    name: 'Service Special',
    description: '10% off any service over $100',
    validUntil: '2023-07-15',
    eligibility: 'All customers',
    details: 'Excludes parts. Mention code SERVICE10 when booking appointment.',
  },
  {
    id: 'TRADEUP',
    name: 'Trade-Up Bonus',
    description: '$1,000 additional trade-in value on vehicles under 8 years old',
    validUntil: '2023-09-30',
    eligibility: 'Any customer trading in a vehicle model year 2015 or newer',
    details: 'Vehicle must be in drivable condition. Subject to inspection.',
  },
];

// Mock customer database (CRM)
const customerDatabase = {
  C10045: {
    id: 'C10045',
    firstName: 'James',
    lastName: 'Wilson',
    email: 'jwilson@example.com',
    phone: '(650) 555-1234',
    address: '742 Pine Street, Redwood City, CA 94061',
    dateAdded: '2021-04-15',
    status: 'Active',
    notes: 'Interested in SUVs, particularly the Honda CR-V',
    salesPerson: 'Michael Rodriguez',
    vehicles: [
      {
        vin: '1HGCM82633A123456',
        year: '2020',
        make: 'Toyota',
        model: 'Camry',
        purchaseDate: '2020-06-12',
        lastService: '2023-01-15',
      },
    ],
    interactions: [
      {
        date: '2023-05-10',
        type: 'Phone Call',
        notes: 'Discussed upcoming service needs and potential trade-in options',
        staff: 'Sarah Johnson',
      },
      {
        date: '2023-03-22',
        type: 'Email',
        notes: 'Sent information about new Honda CR-V models in stock',
        staff: 'Michael Rodriguez',
      },
    ],
  },
  C10087: {
    id: 'C10087',
    firstName: 'Emma',
    lastName: 'Davis',
    email: 'edavis@example.com',
    phone: '(650) 555-7890',
    address: '123 Oak Avenue, Menlo Park, CA 94025',
    dateAdded: '2021-08-22',
    status: 'Active',
    notes: 'Looking for a reliable family vehicle, budget conscious',
    salesPerson: 'Jennifer Lopez',
    vehicles: [
      {
        vin: '5J6RW2H84ML001234',
        year: '2021',
        make: 'Honda',
        model: 'CR-V',
        purchaseDate: '2021-08-25',
        lastService: '2023-03-10',
      },
    ],
    interactions: [
      {
        date: '2023-04-15',
        type: 'In-Person Visit',
        notes: '30k service visit, mentioned interest in adding a second vehicle in the next year',
        staff: 'Robert Chen',
      },
    ],
  },
};

// Mock sales leads
const salesLeads = [
  {
    id: 'L5001',
    source: 'Website Form',
    firstName: 'Thomas',
    lastName: 'Mitchell',
    email: 'tmitchell@example.com',
    phone: '(650) 555-3456',
    dateCreated: '2023-06-10',
    status: 'New',
    interest: '2023 Tesla Model 3',
    notes: 'Requested information about electric vehicle tax incentives',
    assignedTo: 'Michael Rodriguez',
    followUpDate: '2023-06-15',
  },
  {
    id: 'L5002',
    source: 'Phone Inquiry',
    firstName: 'Sophia',
    lastName: 'Garcia',
    email: 'sgarcia@example.com',
    phone: '(650) 555-6789',
    dateCreated: '2023-06-12',
    status: 'Contacted',
    interest: '2023 Toyota Camry Hybrid',
    notes: 'Looking for fuel-efficient sedan, has a 2018 Honda Civic for trade-in',
    assignedTo: 'Sarah Johnson',
    followUpDate: '2023-06-14',
  },
];

// Mock employee directory
const employeeDirectory = [
  {
    id: 'E001',
    firstName: 'Michael',
    lastName: 'Rodriguez',
    position: 'Sales Manager',
    department: 'Sales',
    email: 'mrodriguez@redpandamotors.example',
    phone: '(650) 555-1001',
    extension: '101',
    hireDate: '2015-03-15',
    schedule: 'Monday-Friday: 9:00 AM - 7:00 PM',
  },
  {
    id: 'E002',
    firstName: 'Sarah',
    lastName: 'Johnson',
    position: 'Senior Sales Consultant',
    department: 'Sales',
    email: 'sjohnson@redpandamotors.example',
    phone: '(650) 555-1002',
    extension: '102',
    hireDate: '2017-06-22',
    schedule: 'Tuesday-Saturday: 10:00 AM - 8:00 PM',
  },
];

// Mock inventory allocations
const inventoryAllocations = [
  {
    id: 'A2023-045',
    model: 'Toyota Camry',
    trim: 'XLE Hybrid',
    color: 'Midnight Black Metallic',
    status: 'Allocated',
    estimatedArrival: '2023-07-15',
    allocatedTo: 'Red Panda Motors',
    vinWhenAvailable: 'Pending',
    transportMethod: 'Truck',
    sourceLocation: 'Toyota Factory, Kentucky',
    notes: 'Allocated as part of June 2023 distribution',
  },
];

// Mock sales performance data
const salesPerformance = {
  currentMonth: {
    period: 'June 2023',
    totalSales: 42,
    totalRevenue: 1680000,
    newVehicles: 28,
    usedVehicles: 14,
    topSalesperson: 'Sarah Johnson',
    topModel: 'Toyota Camry',
    averageSalePrice: 40000,
    targetCompletion: '85%',
  },
  ytd: {
    period: 'Jan-Jun 2023',
    totalSales: 245,
    totalRevenue: 9800000,
    newVehicles: 165,
    usedVehicles: 80,
    topSalesperson: 'Michael Rodriguez',
    topModel: 'Honda CR-V',
    averageSalePrice: 40000,
    targetCompletion: '92%',
  },
};

// Function implementations
const toolFunctions = {
  // Function to get dealership information
  getDealershipInfo: (category) => {
    if (!category || category === 'all') {
      return dealershipInfo;
    }

    return dealershipInfo[category] || { error: `Information about ${category} not available` };
  },

  // Function to search vehicle inventory
  searchInventory: (params) => {
    const { make, model, year, priceMin, priceMax, condition } = params;

    let results = [...vehicleInventory];

    if (make) {
      results = results.filter((vehicle) => vehicle.make.toLowerCase() === make.toLowerCase());
    }

    if (model) {
      results = results.filter((vehicle) => vehicle.model.toLowerCase() === model.toLowerCase());
    }

    if (year) {
      results = results.filter((vehicle) => vehicle.year === parseInt(year));
    }

    if (priceMin) {
      results = results.filter((vehicle) => vehicle.price >= parseFloat(priceMin));
    }

    if (priceMax) {
      results = results.filter((vehicle) => vehicle.price <= parseFloat(priceMax));
    }

    if (condition) {
      results = results.filter(
        (vehicle) => vehicle.condition.toLowerCase() === condition.toLowerCase(),
      );
    }

    return {
      count: results.length,
      vehicles: results,
    };
  },

  // Function to schedule an appointment
  scheduleAppointment: (params) => {
    const { name, email, phone, date, time, type, vehicleInfo, notes } = params;

    // Validate required fields
    if (!name || !email || !phone || !date || !time || !type) {
      return {
        success: false,
        error:
          'Missing required information. Please provide name, email, phone, date, time, and appointment type.',
      };
    }

    // Generate a reference number
    const refNumber = `APT-${Math.floor(Math.random() * 10000)}-${new Date().getFullYear()}`;

    // Create appointment object
    const appointment = {
      refNumber,
      name,
      email,
      phone,
      date,
      time,
      type,
      vehicleInfo: vehicleInfo || 'Not specified',
      notes: notes || '',
      status: 'Scheduled',
      createdAt: new Date().toISOString(),
    };

    // Add to appointments array (in a real system, this would be a database insert)
    appointments.push(appointment);

    return {
      success: true,
      message: 'Appointment scheduled successfully',
      appointment: {
        refNumber,
        name,
        date,
        time,
        type,
      },
    };
  },

  // Function to check maintenance records
  checkMaintenanceRecords: (params) => {
    const { referenceNumber } = params;

    if (!referenceNumber) {
      return {
        success: false,
        error: 'Please provide a reference number to look up maintenance records.',
      };
    }

    const record = maintenanceRecords[referenceNumber];

    if (!record) {
      return {
        success: false,
        error: 'No maintenance records found for the provided reference number.',
      };
    }

    return {
      success: true,
      record,
    };
  },

  // Function to check service status
  checkServiceStatus: (params) => {
    const { serviceOrderNumber } = params;

    if (!serviceOrderNumber) {
      return {
        success: false,
        error: 'Please provide a service order number to check status.',
      };
    }

    const status = serviceStatus[serviceOrderNumber];

    if (!status) {
      return {
        success: false,
        error: 'No service order found with the provided number.',
      };
    }

    return {
      success: true,
      status,
    };
  },

  // Function to check parts availability
  checkPartsAvailability: (params) => {
    const { partNumber, description, vehicle } = params;

    let results = [...partsInventory];

    if (partNumber) {
      results = results.filter(
        (part) => part.partNumber.toLowerCase() === partNumber.toLowerCase(),
      );
    } else if (description) {
      results = results.filter((part) =>
        part.description.toLowerCase().includes(description.toLowerCase()),
      );
    }

    if (vehicle) {
      results = results.filter(
        (part) =>
          part.compatibleVehicles.some((v) => v.toLowerCase().includes(vehicle.toLowerCase())) ||
          part.compatibleVehicles.includes('Multiple Models'),
      );
    }

    return {
      count: results.length,
      parts: results,
    };
  },

  // Function to get department hours
  getDepartmentHours: (params) => {
    const { department, day } = params;

    if (!department) {
      return departmentHours;
    }

    if (!departmentHours[department.toLowerCase()]) {
      return {
        success: false,
        error: `Department '${department}' not found. Available departments: sales, service, parts, finance.`,
      };
    }

    if (day) {
      const lowerDay = day.toLowerCase();
      if (!departmentHours[department.toLowerCase()][lowerDay]) {
        return {
          success: false,
          error: `Day '${day}' not valid. Please use Monday, Tuesday, etc.`,
        };
      }

      return {
        success: true,
        hours: {
          [lowerDay]: departmentHours[department.toLowerCase()][lowerDay],
        },
      };
    }

    return {
      success: true,
      hours: departmentHours[department.toLowerCase()],
    };
  },

  // Function to get current promotions
  getCurrentPromotions: (params) => {
    const { type } = params;

    if (!type) {
      return {
        count: currentPromotions.length,
        promotions: currentPromotions,
      };
    }

    // Filter by type of promotion
    const filteredPromotions = currentPromotions.filter(
      (promo) =>
        promo.name.toLowerCase().includes(type.toLowerCase()) ||
        promo.description.toLowerCase().includes(type.toLowerCase()),
    );

    return {
      count: filteredPromotions.length,
      promotions: filteredPromotions,
    };
  },

  // Function to calculate financing
  calculateFinancing: (params) => {
    const { vehiclePrice, downPayment, tradeInValue, interestRate, termMonths } = params;

    if (!vehiclePrice) {
      return {
        success: false,
        error: 'Vehicle price is required to calculate financing.',
      };
    }

    const price = parseFloat(vehiclePrice);
    const down = parseFloat(downPayment) || 0;
    const tradeIn = parseFloat(tradeInValue) || 0;
    const rate = parseFloat(interestRate) || 3.9; // Default to 3.9% if not provided
    const term = parseInt(termMonths) || 60; // Default to 60 months if not provided

    // Calculate loan amount
    const loanAmount = price - down - tradeIn;

    if (loanAmount <= 0) {
      return {
        success: true,
        message: 'No financing needed - the down payment and trade-in cover the vehicle price.',
        details: {
          vehiclePrice: price,
          downPayment: down,
          tradeInValue: tradeIn,
          loanAmount: 0,
          monthlyPayment: 0,
        },
      };
    }

    // Calculate monthly payment using formula: P = L[c(1 + c)^n]/[(1 + c)^n - 1]
    // Where P = payment, L = loan amount, c = monthly interest rate, n = number of payments
    const monthlyRate = rate / 100 / 12;
    const monthlyPayment =
      (loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, term))) /
      (Math.pow(1 + monthlyRate, term) - 1);

    return {
      success: true,
      details: {
        vehiclePrice: price,
        downPayment: down,
        tradeInValue: tradeIn,
        loanAmount: loanAmount,
        interestRate: rate,
        termMonths: term,
        monthlyPayment: parseFloat(monthlyPayment.toFixed(2)),
      },
    };
  },

  // Function to search customer database (CRM)
  searchCustomerDatabase: (params) => {
    const { customerId, name, email, phone, vehicleVin } = params;

    // If specific customer ID is provided, return that customer
    if (customerId && customerDatabase[customerId]) {
      return {
        success: true,
        customer: customerDatabase[customerId],
      };
    }

    // Otherwise search by other parameters
    let results = Object.values(customerDatabase);

    if (name) {
      const searchName = name.toLowerCase();
      results = results.filter(
        (customer) =>
          customer.firstName.toLowerCase().includes(searchName) ||
          customer.lastName.toLowerCase().includes(searchName),
      );
    }

    if (email) {
      const searchEmail = email.toLowerCase();
      results = results.filter((customer) => customer.email.toLowerCase().includes(searchEmail));
    }

    if (phone) {
      // Remove non-numeric characters for comparison
      const searchPhone = phone.replace(/\D/g, '');
      results = results.filter((customer) =>
        customer.phone.replace(/\D/g, '').includes(searchPhone),
      );
    }

    if (vehicleVin) {
      const searchVin = vehicleVin.toUpperCase();
      results = results.filter((customer) =>
        customer.vehicles.some((vehicle) => vehicle.vin.includes(searchVin)),
      );
    }

    return {
      success: true,
      count: results.length,
      customers: results.map((customer) => ({
        id: customer.id,
        name: `${customer.firstName} ${customer.lastName}`,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        salesPerson: customer.salesPerson,
        vehicleCount: customer.vehicles.length,
      })),
    };
  },

  // Function to get sales leads
  getSalesLeads: (params) => {
    const { status, source, assignedTo } = params;

    let results = [...salesLeads];

    if (status) {
      const searchStatus = status.toLowerCase();
      results = results.filter((lead) => lead.status.toLowerCase() === searchStatus);
    }

    if (source) {
      const searchSource = source.toLowerCase();
      results = results.filter((lead) => lead.source.toLowerCase().includes(searchSource));
    }

    if (assignedTo) {
      const searchAssigned = assignedTo.toLowerCase();
      results = results.filter((lead) => lead.assignedTo.toLowerCase().includes(searchAssigned));
    }

    // Sort by most recent
    results.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));

    return {
      success: true,
      count: results.length,
      leads: results,
    };
  },

  // Function to look up employee information
  lookupEmployee: (params) => {
    const { employeeId, name, department } = params;

    let results = [...employeeDirectory];

    if (employeeId) {
      results = results.filter((employee) => employee.id === employeeId);
    }

    if (name) {
      const searchName = name.toLowerCase();
      results = results.filter(
        (employee) =>
          employee.firstName.toLowerCase().includes(searchName) ||
          employee.lastName.toLowerCase().includes(searchName),
      );
    }

    if (department) {
      const searchDept = department.toLowerCase();
      results = results.filter((employee) => employee.department.toLowerCase() === searchDept);
    }

    return {
      success: true,
      count: results.length,
      employees: results,
    };
  },

  // Function to check inventory allocations
  checkInventoryAllocations: (params) => {
    const { allocationId, model, status } = params;

    let results = [...inventoryAllocations];

    if (allocationId) {
      results = results.filter((allocation) => allocation.id === allocationId);
    }

    if (model) {
      const searchModel = model.toLowerCase();
      results = results.filter((allocation) =>
        allocation.model.toLowerCase().includes(searchModel),
      );
    }

    if (status) {
      const searchStatus = status.toLowerCase();
      results = results.filter((allocation) => allocation.status.toLowerCase() === searchStatus);
    }

    return {
      success: true,
      count: results.length,
      allocations: results,
    };
  },

  // Function to get sales performance metrics
  getSalesPerformance: (params) => {
    const { period } = params;

    if (period === 'currentMonth') {
      return {
        success: true,
        performance: salesPerformance.currentMonth,
      };
    } else if (period === 'ytd') {
      return {
        success: true,
        performance: salesPerformance.ytd,
      };
    } else {
      return {
        success: true,
        performance: salesPerformance,
      };
    }
  },
};

// Tool definitions for the OpenAI API
const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'getDealershipInfo',
      description: 'Get general information about the Red Panda Motors dealership',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: [
              'backgroundAndLocation',
              'inventory',
              'financingAndWarranty',
              'services',
              'policies',
              'promotions',
              'all',
            ],
            description: 'The category of dealership information to retrieve',
          },
        },
        required: [],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'searchInventory',
      description: 'Search for vehicles currently in stock at Red Panda Motors',
      parameters: {
        type: 'object',
        properties: {
          make: {
            type: 'string',
            description: 'The make of the vehicle (e.g., Toyota, Honda)',
          },
          model: {
            type: 'string',
            description: 'The model of the vehicle (e.g., Camry, CR-V)',
          },
          year: {
            type: 'string',
            description: 'The year of the vehicle (e.g., 2023)',
          },
          priceMin: {
            type: 'string',
            description: 'The minimum price to search for',
          },
          priceMax: {
            type: 'string',
            description: 'The maximum price to search for',
          },
          condition: {
            type: 'string',
            enum: ['New', 'Used'],
            description: 'The condition of the vehicle',
          },
        },
        required: [],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'scheduleAppointment',
      description: 'Schedule a test drive or service appointment at Red Panda Motors',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Customer full name',
          },
          email: {
            type: 'string',
            description: 'Customer email address',
          },
          phone: {
            type: 'string',
            description: 'Customer phone number',
          },
          date: {
            type: 'string',
            description: 'Appointment date (YYYY-MM-DD format)',
          },
          time: {
            type: 'string',
            description: 'Appointment time (e.g., "10:00 AM")',
          },
          type: {
            type: 'string',
            enum: ['Test Drive', 'Service', 'Sales Consultation', 'Parts Pickup'],
            description: 'Type of appointment',
          },
          vehicleInfo: {
            type: 'string',
            description: 'Information about the vehicle (make, model, year)',
          },
          notes: {
            type: 'string',
            description: 'Additional notes or special requests',
          },
        },
        required: ['name', 'email', 'phone', 'date', 'time', 'type'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'checkMaintenanceRecords',
      description: 'Look up vehicle maintenance records using a reference number',
      parameters: {
        type: 'object',
        properties: {
          referenceNumber: {
            type: 'string',
            description: 'The reference number for the customer or vehicle (e.g., REF12345)',
          },
        },
        required: ['referenceNumber'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'checkServiceStatus',
      description: 'Check the status of a vehicle currently in service',
      parameters: {
        type: 'object',
        properties: {
          serviceOrderNumber: {
            type: 'string',
            description: 'The service order number (e.g., SRV-2023-042)',
          },
        },
        required: ['serviceOrderNumber'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'checkPartsAvailability',
      description: 'Check availability of automotive parts',
      parameters: {
        type: 'object',
        properties: {
          partNumber: {
            type: 'string',
            description: 'Specific part number to search for',
          },
          description: {
            type: 'string',
            description: 'Description of the part',
          },
          vehicle: {
            type: 'string',
            description: 'Vehicle make/model/year the part is for',
          },
        },
        required: [],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'getDepartmentHours',
      description: 'Get operating hours for dealership departments',
      parameters: {
        type: 'object',
        properties: {
          department: {
            type: 'string',
            enum: ['sales', 'service', 'parts', 'finance'],
            description: 'The department to check hours for',
          },
          day: {
            type: 'string',
            enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
            description: 'Specific day to check hours for',
          },
        },
        required: [],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'getCurrentPromotions',
      description: 'Get information about current dealership promotions and special offers',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Type of promotion to filter by (e.g., "sales", "service", "financing")',
          },
        },
        required: [],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'calculateFinancing',
      description: 'Calculate monthly payments and financing details for a vehicle purchase',
      parameters: {
        type: 'object',
        properties: {
          vehiclePrice: {
            type: 'string',
            description: 'Total price of the vehicle',
          },
          downPayment: {
            type: 'string',
            description: 'Amount of down payment',
          },
          tradeInValue: {
            type: 'string',
            description: 'Value of trade-in vehicle if applicable',
          },
          interestRate: {
            type: 'string',
            description: 'Annual interest rate (in percentage, e.g., 3.9)',
          },
          termMonths: {
            type: 'string',
            description: 'Loan term in months (e.g., 36, 48, 60)',
          },
        },
        required: ['vehiclePrice'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'searchCustomerDatabase',
      description: 'Search the dealership customer database for customer information',
      parameters: {
        type: 'object',
        properties: {
          customerId: {
            type: 'string',
            description: 'Unique customer ID',
          },
          name: {
            type: 'string',
            description: 'Customer name (first or last)',
          },
          email: {
            type: 'string',
            description: 'Customer email address',
          },
          phone: {
            type: 'string',
            description: 'Customer phone number',
          },
          vehicleVin: {
            type: 'string',
            description: 'Vehicle identification number (VIN)',
          },
        },
        required: [],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'getSalesLeads',
      description: 'Retrieve information about current sales leads',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['New', 'Contacted', 'Qualified', 'Proposal', 'Closed Won', 'Closed Lost'],
            description: 'Filter leads by status',
          },
          source: {
            type: 'string',
            description: 'Filter leads by source (e.g., "Website Form", "Phone Inquiry")',
          },
          assignedTo: {
            type: 'string',
            description: 'Filter leads by assigned salesperson',
          },
        },
        required: [],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'lookupEmployee',
      description: 'Look up employee information in the dealership directory',
      parameters: {
        type: 'object',
        properties: {
          employeeId: {
            type: 'string',
            description: 'Employee ID',
          },
          name: {
            type: 'string',
            description: 'Employee name (first or last)',
          },
          department: {
            type: 'string',
            enum: ['Sales', 'Service', 'Parts', 'Finance', 'Management', 'Administration'],
            description: 'Filter employees by department',
          },
        },
        required: [],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'checkInventoryAllocations',
      description: 'Check incoming vehicle allocations and factory orders',
      parameters: {
        type: 'object',
        properties: {
          allocationId: {
            type: 'string',
            description: 'Specific allocation ID',
          },
          model: {
            type: 'string',
            description: 'Filter by vehicle model',
          },
          status: {
            type: 'string',
            enum: ['Allocated', 'In Transit', 'Arrived', 'Delivered', 'Canceled'],
            description: 'Filter by allocation status',
          },
        },
        required: [],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'getSalesPerformance',
      description: 'Get sales performance metrics for the dealership',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['currentMonth', 'ytd', 'all'],
            description: 'Time period for the performance metrics',
          },
        },
        required: [],
      },
    },
  },
];

// Export mock data, functions, and tool definitions
module.exports = {
  // Mock data
  dealershipInfo,
  vehicleInventory,
  appointments,
  maintenanceRecords,
  serviceStatus,
  partsInventory,
  departmentHours,
  currentPromotions,
  customerDatabase,
  salesLeads,
  employeeDirectory,
  inventoryAllocations,
  salesPerformance,

  // Function implementations
  toolFunctions,

  // Tool definitions for OpenAI API
  toolDefinitions,
};
