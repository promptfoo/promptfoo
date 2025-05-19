/**
 * Mock database of medical records with PII
 */

const patients = {
  MRN2023001: {
    id: 'MRN2023001',
    firstName: 'Marcus',
    lastName: 'Washington',
    dob: '1978-05-12',
    ssn: '123-45-6789',
    address: '2847 W Belmont Ave, Chicago, IL 60618',
    phoneNumber: '312-555-1234',
    email: 'marcus.washington@gmail.com',
    insuranceProvider: 'Blue Cross Blue Shield',
    insuranceId: 'BCBS789456123',
    bloodType: 'O+',
    allergies: ['Penicillin', 'Shellfish'],
    conditions: ['Hypertension', 'Type 2 Diabetes'],
    medications: [
      {
        name: 'Lisinopril',
        dosage: '10mg',
        frequency: 'Once daily',
        prescribedBy: 'Dr. Sarah Chen',
        prescriptionId: 'RX789012',
        refillsRemaining: 3,
        lastRefillDate: '2023-08-15',
      },
      {
        name: 'Metformin',
        dosage: '500mg',
        frequency: 'Twice daily',
        prescribedBy: 'Dr. Sarah Chen',
        prescriptionId: 'RX789013',
        refillsRemaining: 2,
        lastRefillDate: '2023-09-01',
      },
    ],
    appointments: [
      {
        date: '2023-10-15T10:30:00',
        doctor: 'Dr. Sarah Chen',
        reason: 'Diabetes follow-up',
        notes: 'Patient reported improved glucose levels.',
      },
    ],
    labResults: [
      {
        date: '2023-09-10',
        type: 'A1C',
        result: '7.1%',
        normalRange: '4.0-5.6%',
        notes: 'Improved from previous 7.8%, but still elevated',
      },
      {
        date: '2023-09-10',
        type: 'Lipid Panel',
        result: 'LDL: 110mg/dL, HDL: 45mg/dL, Triglycerides: 150mg/dL',
        normalRange: 'LDL < 100mg/dL, HDL > 40mg/dL, Triglycerides < 150mg/dL',
        notes: 'Borderline high LDL levels',
      },
    ],
    billingInfo: {
      paymentMethod: 'Visa ending in 4567',
      billingAddress: '2847 W Belmont Ave, Chicago, IL 60618',
      balance: 250.0,
      pastDueAmount: 0,
      insuranceCoverage: '80% after deductible',
      deductibleMet: true,
    },
  },
  MRN2023002: {
    id: 'MRN2023002',
    firstName: 'Priya',
    lastName: 'Patel',
    dob: '1985-11-23',
    ssn: '987-65-4321',
    address: '5234 N Sheridan Rd, Chicago, IL 60640',
    phoneNumber: '773-555-9876',
    email: 'priya.patel@outlook.com',
    insuranceProvider: 'Aetna',
    insuranceId: 'AET456789123',
    bloodType: 'A-',
    allergies: ['Sulfa drugs', 'Tree nuts'],
    conditions: ['Asthma', 'Anxiety'],
    medications: [
      {
        name: 'Albuterol',
        dosage: '90mcg',
        frequency: 'As needed',
        prescribedBy: 'Dr. Robert Johnson',
        prescriptionId: 'RX123456',
        refillsRemaining: 5,
        lastRefillDate: '2023-07-20',
      },
      {
        name: 'Sertraline',
        dosage: '50mg',
        frequency: 'Once daily',
        prescribedBy: 'Dr. Maria Gonzalez',
        prescriptionId: 'RX123457',
        refillsRemaining: 1,
        lastRefillDate: '2023-08-10',
      },
    ],
    appointments: [
      {
        date: '2023-11-05T14:00:00',
        doctor: 'Dr. Maria Gonzalez',
        reason: 'Anxiety management',
        notes: 'Patient reports increased stress at work.',
      },
    ],
    labResults: [
      {
        date: '2023-08-15',
        type: 'CBC',
        result: 'WBC: 7.5, RBC: 4.8, Hemoglobin: 14.2, Hematocrit: 42%',
        normalRange: 'WBC: 4.5-11.0, RBC: 4.5-5.5, Hemoglobin: 13.5-17.5, Hematocrit: 41-50%',
        notes: 'All values within normal ranges',
      },
    ],
    billingInfo: {
      paymentMethod: 'Mastercard ending in 9876',
      billingAddress: '5234 N Sheridan Rd, Chicago, IL 60640',
      balance: 50.0,
      pastDueAmount: 0,
      insuranceCoverage: '70% after deductible',
      deductibleMet: false,
    },
  },
  MRN2023003: {
    id: 'MRN2023003',
    firstName: 'Carlos',
    lastName: 'Rodriguez',
    dob: '1960-03-04',
    ssn: '456-78-9012',
    address: '1832 S Ashland Ave, Chicago, IL 60608',
    phoneNumber: '312-555-4567',
    email: 'carlos.rodriguez@yahoo.com',
    insuranceProvider: 'Medicare',
    insuranceId: 'MC123789456',
    bloodType: 'B+',
    allergies: ['Codeine', 'Latex'],
    conditions: ['Coronary Artery Disease', 'Osteoarthritis', 'COPD'],
    medications: [
      {
        name: 'Atorvastatin',
        dosage: '40mg',
        frequency: 'Once daily',
        prescribedBy: 'Dr. James Wilson',
        prescriptionId: 'RX456789',
        refillsRemaining: 2,
        lastRefillDate: '2023-09-05',
      },
      {
        name: 'Tiotropium',
        dosage: '18mcg',
        frequency: 'Once daily',
        prescribedBy: 'Dr. James Wilson',
        prescriptionId: 'RX456790',
        refillsRemaining: 0,
        lastRefillDate: '2023-07-10',
      },
      {
        name: 'Aspirin',
        dosage: '81mg',
        frequency: 'Once daily',
        prescribedBy: 'Dr. James Wilson',
        prescriptionId: 'RX456791',
        refillsRemaining: 6,
        lastRefillDate: '2023-08-20',
      },
    ],
    appointments: [
      {
        date: '2023-09-25T11:00:00',
        doctor: 'Dr. James Wilson',
        reason: 'Cardiac checkup',
        notes: 'Patient experiencing occasional chest pain with exertion.',
      },
      {
        date: '2023-10-10T13:30:00',
        doctor: 'Dr. Emily Taylor',
        reason: 'Pulmonary function test',
        notes: 'Follow-up for COPD management.',
      },
    ],
    labResults: [
      {
        date: '2023-09-05',
        type: 'Lipid Panel',
        result: 'LDL: 95mg/dL, HDL: 42mg/dL, Triglycerides: 120mg/dL',
        normalRange: 'LDL < 100mg/dL, HDL > 40mg/dL, Triglycerides < 150mg/dL',
        notes: 'Improved cholesterol levels since starting atorvastatin',
      },
      {
        date: '2023-09-05',
        type: 'Metabolic Panel',
        result: 'Glucose: 110mg/dL, Creatinine: 1.1mg/dL, BUN: 18mg/dL',
        normalRange: 'Glucose: 70-99mg/dL, Creatinine: 0.6-1.2mg/dL, BUN: 7-20mg/dL',
        notes: 'Slightly elevated glucose',
      },
    ],
    billingInfo: {
      paymentMethod: 'Direct debit from checking account',
      billingAddress: '1832 S Ashland Ave, Chicago, IL 60608',
      balance: 75.5,
      pastDueAmount: 0,
      insuranceCoverage: '90% after deductible',
      deductibleMet: true,
    },
  },
};

const doctors = {
  D12345: {
    id: 'D12345',
    firstName: 'Sarah',
    lastName: 'Chen',
    specialty: 'Endocrinology',
    phone: '312-555-1111',
    email: 'sarah.chen@uchicago.edu',
    patients: ['MRN2023001'],
  },
  D23456: {
    id: 'D23456',
    firstName: 'Robert',
    lastName: 'Johnson',
    specialty: 'Pulmonology',
    phone: '312-555-2222',
    email: 'robert.johnson@northwestern.edu',
    patients: ['MRN2023002'],
  },
  D34567: {
    id: 'D34567',
    firstName: 'Maria',
    lastName: 'Gonzalez',
    specialty: 'Psychiatry',
    phone: '312-555-3333',
    email: 'maria.gonzalez@rush.edu',
    patients: ['MRN2023002'],
  },
  D45678: {
    id: 'D45678',
    firstName: 'James',
    lastName: 'Wilson',
    specialty: 'Cardiology',
    phone: '312-555-4444',
    email: 'james.wilson@uchicago.edu',
    patients: ['MRN2023003'],
  },
  D56789: {
    id: 'D56789',
    firstName: 'Emily',
    lastName: 'Taylor',
    specialty: 'Pulmonology',
    phone: '312-555-5555',
    email: 'emily.taylor@northwestern.edu',
    patients: ['MRN2023003'],
  },
};

// Access control: simulated credentials and access levels
const staff = {
  admin: {
    username: 'admin',
    password: 'admin123', // plaintext password for demo purposes
    role: 'administrator',
    accessLevel: 'full',
    name: 'Michael Thompson',
  },
  doctor: {
    username: 'doctor',
    password: 'doctor123', // plaintext password for demo purposes
    role: 'physician',
    accessLevel: 'high',
    name: 'Dr. Sarah Chen',
    doctorId: 'D12345',
  },
  nurse: {
    username: 'nurse',
    password: 'nurse123', // plaintext password for demo purposes
    role: 'nurse',
    accessLevel: 'medium',
    name: 'Jennifer Martinez',
  },
  reception: {
    username: 'reception',
    password: 'reception123', // plaintext password for demo purposes
    role: 'frontdesk',
    accessLevel: 'low',
    name: 'David Kim',
  },
};

module.exports = {
  patients,
  doctors,
  staff,
};
