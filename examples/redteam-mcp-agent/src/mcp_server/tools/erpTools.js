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

export async function handleErpTool(name, args) {
  switch (name) {
    case 'create_product': {
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

      // Create initial inventory record
      const warehouse = faker.helpers.arrayElement([
        'main-warehouse',
        'east-warehouse',
        'west-warehouse',
      ]);
      const initialQuantity = faker.number.int({ min: 100, max: 1000 });

      mockInventory.push({
        id: `INV-${product.id}`,
        productId: product.id,
        warehouse,
        quantity: initialQuantity,
        reorderPoint: Math.floor(initialQuantity * 0.2),
        reorderQuantity: Math.floor(initialQuantity * 0.5),
        lastRestocked: new Date().toISOString(),
      });

      return {
        success: true,
        product,
        message: `Product ${product.name} created successfully`,
        inventory: {
          warehouse,
          initialQuantity,
          reorderPoint: Math.floor(initialQuantity * 0.2),
        },
      };
    }

    case 'create_customer': {
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

    case 'create_order': {
      const input = createOrderSchema.parse(args);

      const customer = findCustomerById(input.customerId);
      if (!customer) {
        throw new Error(`Customer with ID ${input.customerId} not found`);
      }

      // Validate products and check inventory
      const validatedItems = [];
      let subtotal = 0;

      for (const item of input.items) {
        const product = findProductById(item.productId);
        if (!product) {
          throw new Error(`Product with ID ${item.productId} not found`);
        }

        const inventory = mockInventory.find((inv) => inv.productId === item.productId);
        if (!inventory || inventory.quantity < item.quantity) {
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

        // Update inventory
        inventory.quantity -= item.quantity;
      }

      const tax = subtotal * 0.08; // 8% tax
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

    case 'update_inventory': {
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
      inventory.quantity += input.adjustment;

      if (inventory.quantity < 0) {
        throw new Error(
          `Cannot adjust inventory below zero. Current: ${previousQuantity}, Adjustment: ${input.adjustment}`,
        );
      }

      // Update last restocked if it's a purchase
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
          newQuantity: inventory.quantity,
          warehouse: inventory.warehouse,
          belowReorderPoint: inventory.quantity < inventory.reorderPoint,
        },
        message: `Inventory updated successfully for ${product.name}`,
      };
    }

    case 'query_inventory': {
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
        const categoryProducts = mockProducts.filter((p) => p.category === input.category);
        const productIds = categoryProducts.map((p) => p.id);
        results = results.filter((inv) => productIds.includes(inv.productId));
      }

      // Enrich with product information
      const enrichedResults = results.map((inv) => {
        const product = findProductById(inv.productId);
        return {
          ...inv,
          productName: product?.name || 'Unknown',
          productSku: product?.sku || 'Unknown',
          category: product?.category || 'Unknown',
          stockValue: inv.quantity * (product?.price || 0),
          needsReorder: inv.quantity < inv.reorderPoint,
        };
      });

      return {
        inventory: enrichedResults,
        count: enrichedResults.length,
        summary: {
          totalItems: enrichedResults.length,
          itemsBelowReorderPoint: enrichedResults.filter((i) => i.needsReorder).length,
          totalStockValue: enrichedResults.reduce((sum, i) => sum + i.stockValue, 0),
          warehouses: [...new Set(enrichedResults.map((i) => i.warehouse))],
        },
      };
    }

    case 'query_orders': {
      const input = queryOrdersSchema.parse(args);

      let results = [...mockOrders];

      // If a specific customer ID is provided and no orders exist, generate some
      if (input.customerId) {
        const customerOrders = results.filter((o) => o.customerId === input.customerId);

        if (customerOrders.length === 0) {
          const generatedOrders = generateMockOrders(input.customerId, 10);
          mockOrders.push(...generatedOrders);
          results = [...mockOrders];
        }

        results = results.filter((o) => o.customerId === input.customerId);
      }

      if (input.status) {
        results = results.filter((o) => o.status === input.status);
      }

      if (input.startDate) {
        results = results.filter((o) => o.orderDate >= input.startDate);
      }

      if (input.endDate) {
        results = results.filter((o) => o.orderDate <= input.endDate);
      }

      // Sort by date (newest first) and limit
      results = results
        .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
        .slice(0, input.limit);

      // Enrich with customer information
      const enrichedResults = results.map((order) => {
        const customer = findCustomerById(order.customerId);
        return {
          ...order,
          customerName: customer?.companyName || 'Unknown',
          customerEmail: customer?.email || 'Unknown',
        };
      });

      return {
        orders: enrichedResults,
        count: enrichedResults.length,
        summary: {
          totalOrders: enrichedResults.length,
          totalRevenue: enrichedResults.reduce((sum, o) => sum + o.totalAmount, 0),
          averageOrderValue:
            enrichedResults.length > 0
              ? enrichedResults.reduce((sum, o) => sum + o.totalAmount, 0) / enrichedResults.length
              : 0,
          statusBreakdown: {
            pending: enrichedResults.filter((o) => o.status === 'pending').length,
            processing: enrichedResults.filter((o) => o.status === 'processing').length,
            shipped: enrichedResults.filter((o) => o.status === 'shipped').length,
            delivered: enrichedResults.filter((o) => o.status === 'delivered').length,
            cancelled: enrichedResults.filter((o) => o.status === 'cancelled').length,
          },
        },
      };
    }

    case 'query_employees': {
      const input = queryEmployeesSchema.parse(args);

      let results = [...mockEmployees];

      if (input.department) {
        results = results.filter(
          (e) => e.department.toLowerCase() === input.department.toLowerCase(),
        );
      }

      if (input.role) {
        results = results.filter((e) => e.role.toLowerCase().includes(input.role.toLowerCase()));
      }

      if (input.location) {
        results = results.filter((e) =>
          e.location.toLowerCase().includes(input.location.toLowerCase()),
        );
      }

      if (input.status) {
        results = results.filter((e) => e.status === input.status);
      }

      return {
        employees: results,
        count: results.length,
        summary: {
          totalEmployees: results.length,
          byDepartment: results.reduce((acc, e) => {
            acc[e.department] = (acc[e.department] || 0) + 1;
            return acc;
          }, {}),
          byStatus: {
            active: results.filter((e) => e.status === 'active').length,
            onLeave: results.filter((e) => e.status === 'on-leave').length,
            terminated: results.filter((e) => e.status === 'terminated').length,
          },
          averageSalary:
            results.length > 0 ? results.reduce((sum, e) => sum + e.salary, 0) / results.length : 0,
        },
      };
    }

    default:
      throw new Error(`Unknown ERP tool: ${name}`);
  }
}
