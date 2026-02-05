import { faker } from '@faker-js/faker';

// ID Generation
const generateProductId = () => `PRD-${faker.string.alphanumeric(8).toUpperCase()}`;
const generateCustomerId = () => `CUST-${faker.string.alphanumeric(6).toUpperCase()}`;
const generateOrderId = () => `ORD-${Date.now()}-${faker.string.alphanumeric(6).toUpperCase()}`;

// Mock Data Arrays
export const mockProducts = [
  {
    id: 'PRD-ELEC001',
    name: 'Enterprise Server Rack 42U',
    sku: 'SR-42U-ENT',
    category: 'electronics',
    price: 2499.99,
    description: 'Professional-grade 42U server rack with cooling system',
    supplier: 'TechPro Solutions',
    unitOfMeasure: 'unit',
    status: 'active',
    createdDate: '2023-01-15T10:00:00Z',
  },
  {
    id: 'PRD-FURN001',
    name: 'Executive Desk - Mahogany',
    sku: 'DSK-EXC-MAH',
    category: 'furniture',
    price: 1299.99,
    description: 'Premium mahogany executive desk with built-in cable management',
    supplier: 'Office Furnishings Inc',
    unitOfMeasure: 'unit',
    status: 'active',
    createdDate: '2023-02-20T14:30:00Z',
  },
  {
    id: 'PRD-SOFT001',
    name: 'ERP Software License - Professional',
    sku: 'ERP-PRO-LIC',
    category: 'software',
    price: 999.0,
    description: 'Annual license for ERP Professional Edition',
    supplier: 'Software Solutions Corp',
    unitOfMeasure: 'license',
    status: 'active',
    createdDate: '2023-03-10T09:00:00Z',
  },
  {
    id: 'PRD-SUPP001',
    name: 'A4 Paper - Premium Quality',
    sku: 'PAP-A4-PREM',
    category: 'office-supplies',
    price: 45.99,
    description: 'Premium quality A4 paper, 80gsm, 500 sheets per ream',
    supplier: 'Paper Products Ltd',
    unitOfMeasure: 'ream',
    status: 'active',
    createdDate: '2023-04-05T11:15:00Z',
  },
  {
    id: 'PRD-SERV001',
    name: 'IT Support Services - Monthly',
    sku: 'IT-SUP-MON',
    category: 'services',
    price: 2500.0,
    description: 'Monthly IT support and maintenance services',
    supplier: 'Tech Support Pros',
    unitOfMeasure: 'month',
    status: 'active',
    createdDate: '2023-05-12T13:45:00Z',
  },
];

export const mockCustomers = [
  {
    id: 'CUST-ABC123',
    companyName: 'Acme Corporation',
    contactName: 'John Smith',
    email: 'john.smith@acmecorp.com',
    phone: '+1-555-123-4567',
    address: {
      street: '123 Business Ave',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'USA',
    },
    creditLimit: 50000,
    currentBalance: 12500,
    paymentTerms: 'net30',
    status: 'active',
    createdDate: '2023-01-10T08:00:00Z',
  },
  {
    id: 'CUST-DEF456',
    companyName: 'Global Industries Ltd',
    contactName: 'Sarah Johnson',
    email: 'sarah.j@globalind.com',
    phone: '+1-555-987-6543',
    address: {
      street: '456 Industrial Blvd',
      city: 'Chicago',
      state: 'IL',
      zipCode: '60601',
      country: 'USA',
    },
    creditLimit: 75000,
    currentBalance: 8900,
    paymentTerms: 'net60',
    status: 'active',
    createdDate: '2023-02-15T09:30:00Z',
  },
  {
    id: 'CUST-GHI789',
    companyName: 'Tech Startups Inc',
    contactName: 'Mike Chen',
    email: 'mchen@techstartups.io',
    phone: '+1-555-555-5555',
    address: {
      street: '789 Innovation Way',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94105',
      country: 'USA',
    },
    creditLimit: 25000,
    currentBalance: 22000,
    paymentTerms: 'prepaid',
    status: 'active',
    createdDate: '2023-03-20T14:00:00Z',
  },
];

export const mockOrders = [
  {
    id: 'ORD-20240101-ABC123',
    customerId: 'CUST-ABC123',
    orderDate: '2024-01-01T10:30:00Z',
    status: 'delivered',
    items: [
      {
        productId: 'PRD-ELEC001',
        productName: 'Enterprise Server Rack 42U',
        quantity: 2,
        unitPrice: 2499.99,
        discount: 5,
        lineTotal: 4749.98,
      },
      {
        productId: 'PRD-SOFT001',
        productName: 'ERP Software License - Professional',
        quantity: 10,
        unitPrice: 999.0,
        discount: 10,
        lineTotal: 8991.0,
      },
    ],
    subtotal: 13740.98,
    tax: 1099.28,
    shipping: 150.0,
    totalAmount: 14990.26,
    shippingAddress: {
      street: '123 Business Ave',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'USA',
    },
    priority: 'high',
  },
  {
    id: 'ORD-20240102-DEF456',
    customerId: 'CUST-DEF456',
    orderDate: '2024-01-02T14:15:00Z',
    status: 'shipped',
    items: [
      {
        productId: 'PRD-FURN001',
        productName: 'Executive Desk - Mahogany',
        quantity: 5,
        unitPrice: 1299.99,
        discount: 0,
        lineTotal: 6499.95,
      },
    ],
    subtotal: 6499.95,
    tax: 519.96,
    shipping: 200.0,
    totalAmount: 7219.91,
    shippingAddress: {
      street: '456 Industrial Blvd',
      city: 'Chicago',
      state: 'IL',
      zipCode: '60601',
      country: 'USA',
    },
    priority: 'normal',
  },
];

export const mockInventory = [
  {
    id: 'INV-PRD-ELEC001',
    productId: 'PRD-ELEC001',
    warehouse: 'main-warehouse',
    quantity: 45,
    reorderPoint: 10,
    reorderQuantity: 50,
    lastRestocked: '2024-01-01T08:00:00Z',
  },
  {
    id: 'INV-PRD-FURN001',
    productId: 'PRD-FURN001',
    warehouse: 'main-warehouse',
    quantity: 8,
    reorderPoint: 5,
    reorderQuantity: 20,
    lastRestocked: '2023-12-20T10:00:00Z',
  },
  {
    id: 'INV-PRD-SOFT001',
    productId: 'PRD-SOFT001',
    warehouse: 'digital-warehouse',
    quantity: 1000,
    reorderPoint: 100,
    reorderQuantity: 500,
    lastRestocked: '2024-01-01T00:00:00Z',
  },
  {
    id: 'INV-PRD-SUPP001',
    productId: 'PRD-SUPP001',
    warehouse: 'east-warehouse',
    quantity: 250,
    reorderPoint: 100,
    reorderQuantity: 500,
    lastRestocked: '2023-12-15T14:00:00Z',
  },
];

export const mockEmployees = [
  {
    id: 'EMP-000001',
    employeeNumber: 'E001',
    firstName: 'Alice',
    lastName: 'Anderson',
    email: 'alice.anderson@company.com',
    department: 'Sales',
    role: 'Sales Manager',
    location: 'New York',
    hireDate: '2020-03-15T09:00:00Z',
    status: 'active',
    salary: 85000,
  },
  {
    id: 'EMP-000002',
    employeeNumber: 'E002',
    firstName: 'Bob',
    lastName: 'Brown',
    email: 'bob.brown@company.com',
    department: 'IT',
    role: 'Senior Developer',
    location: 'San Francisco',
    hireDate: '2021-06-01T09:00:00Z',
    status: 'active',
    salary: 120000,
    reportsTo: 'EMP-000010',
  },
  {
    id: 'EMP-000003',
    employeeNumber: 'E003',
    firstName: 'Carol',
    lastName: 'Chen',
    email: 'carol.chen@company.com',
    department: 'Finance',
    role: 'Financial Analyst',
    location: 'Chicago',
    hireDate: '2022-01-10T09:00:00Z',
    status: 'active',
    salary: 75000,
    reportsTo: 'EMP-000008',
  },
  {
    id: 'EMP-000004',
    employeeNumber: 'E004',
    firstName: 'David',
    lastName: 'Davis',
    email: 'david.davis@company.com',
    department: 'Operations',
    role: 'Operations Coordinator',
    location: 'Dallas',
    hireDate: '2021-09-20T09:00:00Z',
    status: 'on-leave',
    salary: 65000,
    reportsTo: 'EMP-000009',
  },
];

// Helper functions
export const addProduct = (product) => {
  const newProduct = {
    ...product,
    id: generateProductId(),
  };
  mockProducts.push(newProduct);
  return newProduct;
};

export const addCustomer = (customer) => {
  const newCustomer = {
    ...customer,
    id: generateCustomerId(),
  };
  mockCustomers.push(newCustomer);
  return newCustomer;
};

export const addOrder = (order) => {
  const newOrder = {
    ...order,
    id: generateOrderId(),
  };
  mockOrders.unshift(newOrder);
  return newOrder;
};

export const updateInventory = (productId, adjustment) => {
  const inventory = mockInventory.find((inv) => inv.productId === productId);
  if (inventory) {
    inventory.quantity += adjustment;
    if (adjustment > 0) {
      inventory.lastRestocked = new Date().toISOString();
    }
  }
  return inventory;
};

export const findProductById = (id) => {
  return mockProducts.find((p) => p.id === id);
};

export const findCustomerById = (id) => {
  return mockCustomers.find((c) => c.id === id);
};

export const findOrderById = (id) => {
  return mockOrders.find((o) => o.id === id);
};

export const getProductsByCategory = (category) => {
  return mockProducts.filter((p) => p.category === category);
};

export const getOrdersByCustomer = (customerId) => {
  return mockOrders.filter((o) => o.customerId === customerId);
};

export const getInventoryStatus = () => {
  return mockInventory;
};

export const getEmployeesByDepartment = (department) => {
  return mockEmployees.filter((e) => e.department === department);
};

// Financial calculations
export const calculateDailyRevenue = () => {
  const today = new Date().toISOString().split('T')[0];
  return mockOrders
    .filter((o) => o.orderDate.startsWith(today) && o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.totalAmount, 0);
};

export const getTopProducts = (limit = 5) => {
  const productRevenue = new Map();

  mockOrders.forEach((order) => {
    if (order.status !== 'cancelled') {
      order.items.forEach((item) => {
        const current = productRevenue.get(item.productId) || {
          revenue: 0,
          quantity: 0,
        };
        productRevenue.set(item.productId, {
          revenue: current.revenue + item.lineTotal,
          quantity: current.quantity + item.quantity,
        });
      });
    }
  });

  return Array.from(productRevenue.entries())
    .map(([productId, data]) => ({
      product: findProductById(productId),
      revenue: data.revenue,
      quantity: data.quantity,
    }))
    .filter((item) => item.product)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
};
