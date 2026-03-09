import { faker } from '@faker-js/faker';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  addCustomer,
  addOrder,
  addProduct,
  findCustomerById,
  findProductById,
  mockEmployees,
  mockInventory,
  mockOrders,
  mockProducts,
} from '../data/mockData.js';

const createProductSchema = z.object({
  name: z.string().describe('Product name'),
  sku: z.string().describe('Stock Keeping Unit'),
  category: z
    .enum(['electronics', 'furniture', 'office-supplies', 'software', 'services'])
    .describe('Product category'),
  price: z.number().positive().describe('Product price'),
  description: z.string().describe('Product description'),
  supplier: z.string().describe('Supplier name'),
  unitOfMeasure: z.string().default('unit').describe('Unit of measure (unit, kg, meter, etc.)'),
});

const createCustomerSchema = z.object({
  companyName: z.string().describe('Company name'),
  contactName: z.string().describe('Primary contact name'),
  email: z.string().email().describe('Contact email'),
  phone: z.string().describe('Contact phone'),
  address: z.object({
    street: z.string().describe('Street address'),
    city: z.string().describe('City'),
    state: z.string().describe('State/Province'),
    zipCode: z.string().describe('ZIP/Postal code'),
    country: z.string().describe('Country'),
  }),
  creditLimit: z.number().positive().describe('Credit limit'),
  paymentTerms: z.enum(['net30', 'net60', 'net90', 'prepaid']).describe('Payment terms'),
});

const createOrderSchema = z.object({
  customerId: z.string().describe('Customer ID'),
  items: z
    .array(
      z.object({
        productId: z.string().describe('Product ID'),
        quantity: z.number().positive().describe('Quantity'),
        unitPrice: z.number().positive().describe('Unit price'),
        discount: z.number().min(0).max(100).default(0).describe('Discount percentage'),
      }),
    )
    .describe('Order items'),
  shippingAddress: z
    .object({
      street: z.string().describe('Street address'),
      city: z.string().describe('City'),
      state: z.string().describe('State/Province'),
      zipCode: z.string().describe('ZIP/Postal code'),
      country: z.string().describe('Country'),
    })
    .optional()
    .describe('Shipping address (optional, defaults to customer address)'),
  priority: z
    .enum(['low', 'normal', 'high', 'urgent'])
    .default('normal')
    .describe('Order priority'),
});

const updateInventorySchema = z.object({
  productId: z.string().describe('Product ID'),
  adjustment: z.number().describe('Quantity adjustment (+/- value)'),
  reason: z
    .enum(['purchase', 'sale', 'return', 'damage', 'theft', 'correction'])
    .describe('Reason for adjustment'),
  notes: z.string().optional().describe('Additional notes'),
});

const queryInventorySchema = z.object({
  productId: z.string().optional().describe('Filter by product ID'),
  warehouse: z.string().optional().describe('Filter by warehouse'),
  belowReorderPoint: z.boolean().optional().describe('Only show items below reorder point'),
  category: z.string().optional().describe('Filter by product category'),
});

const queryOrdersSchema = z.object({
  customerId: z.string().optional().describe('Filter by customer ID'),
  status: z
    .enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
    .optional()
    .describe('Filter by status'),
  startDate: z.string().optional().describe('Start date for filtering (ISO 8601)'),
  endDate: z.string().optional().describe('End date for filtering (ISO 8601)'),
  limit: z.number().min(1).max(100).default(10).describe('Number of results to return'),
});

const queryEmployeesSchema = z.object({
  department: z.string().optional().describe('Filter by department'),
  role: z.string().optional().describe('Filter by role'),
  location: z.string().optional().describe('Filter by location'),
  status: z.enum(['active', 'on-leave', 'terminated']).optional().describe('Filter by status'),
});

// Helper function to generate mock orders for any customer
function generateMockOrders(customerId, count = 5) {
  const orders = [];

  // Set a seed for consistent data for the same customer ID
  faker.seed(customerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0));

  for (let i = 0; i < count; i++) {
    const itemCount = faker.number.int({ min: 1, max: 5 });
    const items = [];
    let totalAmount = 0;

    for (let j = 0; j < itemCount; j++) {
      const product = faker.helpers.arrayElement(mockProducts);
      const quantity = faker.number.int({ min: 1, max: 20 });
      const discount = faker.helpers.weightedArrayElement([
        { value: 0, weight: 7 },
        { value: 5, weight: 2 },
        { value: 10, weight: 1 },
      ]);
      const unitPrice = product.price;
      const lineTotal = quantity * unitPrice * (1 - discount / 100);

      items.push({
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice,
        discount,
        lineTotal,
      });

      totalAmount += lineTotal;
    }

    const order = {
      id: `ORD-${Date.now()}-${faker.string.alphanumeric(6).toUpperCase()}`,
      customerId: customerId,
      orderDate: faker.date.recent({ days: 60 }).toISOString(),
      status: faker.helpers.weightedArrayElement([
        { value: 'delivered', weight: 5 },
        { value: 'shipped', weight: 2 },
        { value: 'processing', weight: 2 },
        { value: 'pending', weight: 1 },
      ]),
      items,
      subtotal: totalAmount,
      tax: totalAmount * 0.08,
      shipping: faker.number.float({ min: 10, max: 50, fractionDigits: 2 }),
      totalAmount: totalAmount * 1.08 + faker.number.float({ min: 10, max: 50, fractionDigits: 2 }),
      shippingAddress: {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        zipCode: faker.location.zipCode(),
        country: 'USA',
      },
      priority: faker.helpers.weightedArrayElement([
        { value: 'normal', weight: 7 },
        { value: 'high', weight: 2 },
        { value: 'urgent', weight: 1 },
      ]),
    };

    orders.push(order);
  }

  // Reset faker seed to avoid affecting other operations
  faker.seed();

  return orders.sort((a, b) => b.orderDate.localeCompare(a.orderDate));
}

export const erpTools = [
  {
    name: 'create_product',
    description: 'Create a new product in the ERP system',
    inputSchema: zodToJsonSchema(createProductSchema),
  },
  {
    name: 'create_customer',
    description: 'Create a new customer account',
    inputSchema: zodToJsonSchema(createCustomerSchema),
  },
  {
    name: 'create_order',
    description: 'Create a new sales order',
    inputSchema: zodToJsonSchema(createOrderSchema),
  },
  {
    name: 'update_inventory',
    description: 'Update inventory levels for a product',
    inputSchema: zodToJsonSchema(updateInventorySchema),
  },
  {
    name: 'query_inventory',
    description: 'Query current inventory status',
    inputSchema: zodToJsonSchema(queryInventorySchema),
  },
  {
    name: 'query_orders',
    description: 'Query sales orders with filters',
    inputSchema: zodToJsonSchema(queryOrdersSchema),
  },
  {
    name: 'query_employees',
    description: 'Query employee information',
    inputSchema: zodToJsonSchema(queryEmployeesSchema),
  },
];

function createInventoryRecord(productId) {
  const warehouse = faker.helpers.arrayElement([
    'main-warehouse',
    'east-warehouse',
    'west-warehouse',
  ]);
  const initialQuantity = faker.number.int({ min: 100, max: 1000 });
  const reorderPoint = Math.floor(initialQuantity * 0.2);

  mockInventory.push({
    id: `INV-${productId}`,
    productId,
    warehouse,
    quantity: initialQuantity,
    reorderPoint,
    reorderQuantity: Math.floor(initialQuantity * 0.5),
    lastRestocked: new Date().toISOString(),
  });

  return { warehouse, initialQuantity, reorderPoint };
}

function handleCreateProduct(args) {
  const input = createProductSchema.parse(args);
  const product = addProduct({
    name: input.name,
    sku: input.sku,
    category: input.category,
    price: input.price,
    description: input.description,
    supplier: input.supplier,
    unitOfMeasure: input.unitOfMeasure,
    status: 'active',
    createdDate: new Date().toISOString(),
  });
  const inventory = createInventoryRecord(product.id);

  return {
    success: true,
    product,
    message: `Product ${product.name} created successfully`,
    inventory,
  };
}

function handleCreateCustomer(args) {
  const input = createCustomerSchema.parse(args);
  const customer = addCustomer({
    companyName: input.companyName,
    contactName: input.contactName,
    email: input.email,
    phone: input.phone,
    address: input.address,
    creditLimit: input.creditLimit,
    currentBalance: 0,
    paymentTerms: input.paymentTerms,
    status: 'active',
    createdDate: new Date().toISOString(),
  });

  return {
    success: true,
    customer,
    message: `Customer ${customer.companyName} created successfully`,
  };
}

function validateOrderItems(items) {
  const validatedItems = [];
  const inventoryAdjustments = new Map();
  let subtotal = 0;

  for (const item of items) {
    const product = findProductById(item.productId);
    if (!product) {
      throw new Error(`Product with ID ${item.productId} not found`);
    }

    const inventory = mockInventory.find((inv) => inv.productId === item.productId);
    const reservedQuantity = inventoryAdjustments.get(item.productId) || 0;
    const remainingQuantity = inventory ? inventory.quantity - reservedQuantity : 0;
    if (!inventory || remainingQuantity < item.quantity) {
      throw new Error(
        `Insufficient inventory for product ${product.name}. Available: ${inventory?.quantity || 0}, Requested: ${item.quantity}`,
      );
    }

    const lineTotal = item.quantity * item.unitPrice * (1 - item.discount / 100);
    validatedItems.push({
      productId: item.productId,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      lineTotal,
    });

    subtotal += lineTotal;
    inventoryAdjustments.set(item.productId, reservedQuantity + item.quantity);
  }

  return { inventoryAdjustments, validatedItems, subtotal };
}

function handleCreateOrder(args) {
  const input = createOrderSchema.parse(args);
  const customer = findCustomerById(input.customerId);
  if (!customer) {
    throw new Error(`Customer with ID ${input.customerId} not found`);
  }

  const { inventoryAdjustments, validatedItems, subtotal } = validateOrderItems(input.items);
  const tax = subtotal * 0.08;
  const shipping = faker.number.float({ min: 10, max: 50, fractionDigits: 2 });
  const order = addOrder({
    customerId: input.customerId,
    orderDate: new Date().toISOString(),
    status: 'pending',
    items: validatedItems,
    subtotal,
    tax,
    shipping,
    totalAmount: subtotal + tax + shipping,
    shippingAddress: input.shippingAddress || customer.address,
    priority: input.priority,
  });

  for (const [productId, quantity] of inventoryAdjustments.entries()) {
    const inventory = mockInventory.find((inv) => inv.productId === productId);
    if (inventory) {
      inventory.quantity -= quantity;
    }
  }

  return {
    success: true,
    order,
    message: `Order ${order.id} created successfully`,
    summary: {
      itemCount: validatedItems.length,
      totalQuantity: validatedItems.reduce((sum, item) => sum + item.quantity, 0),
      totalAmount: order.totalAmount,
    },
  };
}

function handleUpdateInventory(args) {
  const input = updateInventorySchema.parse(args);
  const product = findProductById(input.productId);
  if (!product) {
    throw new Error(`Product with ID ${input.productId} not found`);
  }

  const inventory = mockInventory.find((inv) => inv.productId === input.productId);
  if (!inventory) {
    throw new Error(`No inventory record found for product ${product.name}`);
  }

  const previousQuantity = inventory.quantity;
  const newQuantity = previousQuantity + input.adjustment;

  if (newQuantity < 0) {
    throw new Error(
      `Cannot adjust inventory below zero. Current: ${previousQuantity}, Adjustment: ${input.adjustment}`,
    );
  }

  inventory.quantity = newQuantity;

  if (input.reason === 'purchase' && input.adjustment > 0) {
    inventory.lastRestocked = new Date().toISOString();
  }

  return {
    success: true,
    inventory: {
      productId: input.productId,
      productName: product.name,
      previousQuantity,
      adjustment: input.adjustment,
      newQuantity,
      warehouse: inventory.warehouse,
      belowReorderPoint: newQuantity < inventory.reorderPoint,
    },
    message: `Inventory updated successfully for ${product.name}`,
  };
}

function handleQueryInventory(args) {
  const input = queryInventorySchema.parse(args);
  let results = [...mockInventory];

  if (input.productId) {
    results = results.filter((inv) => inv.productId === input.productId);
  }

  if (input.warehouse) {
    results = results.filter((inv) => inv.warehouse === input.warehouse);
  }

  if (input.belowReorderPoint) {
    results = results.filter((inv) => inv.quantity < inv.reorderPoint);
  }

  if (input.category) {
    const categoryProducts = mockProducts.filter((product) => product.category === input.category);
    const productIds = categoryProducts.map((product) => product.id);
    results = results.filter((inv) => productIds.includes(inv.productId));
  }

  const enrichedResults = results.map((inventory) => {
    const product = findProductById(inventory.productId);
    return {
      ...inventory,
      productName: product?.name || 'Unknown',
      productSku: product?.sku || 'Unknown',
      category: product?.category || 'Unknown',
      stockValue: inventory.quantity * (product?.price || 0),
      needsReorder: inventory.quantity < inventory.reorderPoint,
    };
  });

  return {
    inventory: enrichedResults,
    count: enrichedResults.length,
    summary: {
      totalItems: enrichedResults.length,
      itemsBelowReorderPoint: enrichedResults.filter((item) => item.needsReorder).length,
      totalStockValue: enrichedResults.reduce((sum, item) => sum + item.stockValue, 0),
      warehouses: [...new Set(enrichedResults.map((item) => item.warehouse))],
    },
  };
}

function getOrdersForCustomer(customerId, results) {
  const customerOrders = results.filter((order) => order.customerId === customerId);
  if (customerOrders.length > 0) {
    return customerOrders;
  }

  const generatedOrders = generateMockOrders(customerId, 10);
  mockOrders.push(...generatedOrders);
  return [...mockOrders].filter((order) => order.customerId === customerId);
}

function handleQueryOrders(args) {
  const input = queryOrdersSchema.parse(args);
  let results = [...mockOrders];

  if (input.customerId) {
    results = getOrdersForCustomer(input.customerId, results);
  }

  if (input.status) {
    results = results.filter((order) => order.status === input.status);
  }

  if (input.startDate) {
    results = results.filter((order) => order.orderDate >= input.startDate);
  }

  if (input.endDate) {
    results = results.filter((order) => order.orderDate <= input.endDate);
  }

  const enrichedResults = results
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
    .slice(0, input.limit)
    .map((order) => {
      const customer = findCustomerById(order.customerId);
      return {
        ...order,
        customerName: customer?.companyName || 'Unknown',
        customerEmail: customer?.email || 'Unknown',
      };
    });

  const totalRevenue = enrichedResults.reduce((sum, order) => sum + order.totalAmount, 0);
  return {
    orders: enrichedResults,
    count: enrichedResults.length,
    summary: {
      totalOrders: enrichedResults.length,
      totalRevenue,
      averageOrderValue: enrichedResults.length > 0 ? totalRevenue / enrichedResults.length : 0,
      statusBreakdown: {
        pending: enrichedResults.filter((order) => order.status === 'pending').length,
        processing: enrichedResults.filter((order) => order.status === 'processing').length,
        shipped: enrichedResults.filter((order) => order.status === 'shipped').length,
        delivered: enrichedResults.filter((order) => order.status === 'delivered').length,
        cancelled: enrichedResults.filter((order) => order.status === 'cancelled').length,
      },
    },
  };
}

function handleQueryEmployees(args) {
  const input = queryEmployeesSchema.parse(args);
  let results = [...mockEmployees];

  if (input.department) {
    results = results.filter(
      (employee) => employee.department.toLowerCase() === input.department.toLowerCase(),
    );
  }

  if (input.role) {
    results = results.filter((employee) =>
      employee.role.toLowerCase().includes(input.role.toLowerCase()),
    );
  }

  if (input.location) {
    results = results.filter((employee) =>
      employee.location.toLowerCase().includes(input.location.toLowerCase()),
    );
  }

  if (input.status) {
    results = results.filter((employee) => employee.status === input.status);
  }

  return {
    employees: results,
    count: results.length,
    summary: {
      totalEmployees: results.length,
      byDepartment: results.reduce((acc, employee) => {
        acc[employee.department] = (acc[employee.department] || 0) + 1;
        return acc;
      }, {}),
      byStatus: {
        active: results.filter((employee) => employee.status === 'active').length,
        onLeave: results.filter((employee) => employee.status === 'on-leave').length,
        terminated: results.filter((employee) => employee.status === 'terminated').length,
      },
      averageSalary:
        results.length > 0
          ? results.reduce((sum, employee) => sum + employee.salary, 0) / results.length
          : 0,
    },
  };
}

const erpToolHandlers = {
  create_product: handleCreateProduct,
  create_customer: handleCreateCustomer,
  create_order: handleCreateOrder,
  update_inventory: handleUpdateInventory,
  query_inventory: handleQueryInventory,
  query_orders: handleQueryOrders,
  query_employees: handleQueryEmployees,
};

export async function handleErpTool(name, args) {
  const handler = Object.hasOwn(erpToolHandlers, name) ? erpToolHandlers[name] : undefined;
  if (!handler) {
    throw new Error(`Unknown ERP tool: ${name}`);
  }

  return handler(args);
}
