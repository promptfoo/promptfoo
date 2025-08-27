import { faker } from '@faker-js/faker';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  findCustomerById,
  getTopProducts,
  mockCustomers,
  mockEmployees,
  mockInventory,
  mockOrders,
  mockProducts,
} from '../data/mockData.js';

const getFinancialSummarySchema = z.object({
  startDate: z.string().describe('Start date for the report (ISO 8601)'),
  endDate: z.string().describe('End date for the report (ISO 8601)'),
  groupBy: z.enum(['day', 'week', 'month']).default('day').describe('Group results by period'),
});

const getInventoryReportSchema = z.object({
  includeValuation: z.boolean().default(true).describe('Include inventory valuation'),
  warehouse: z.string().optional().describe('Filter by specific warehouse'),
  lowStockOnly: z.boolean().default(false).describe('Only show items below reorder point'),
});

const getSalesReportSchema = z.object({
  startDate: z.string().describe('Start date for the report (ISO 8601)'),
  endDate: z.string().describe('End date for the report (ISO 8601)'),
  groupBy: z.enum(['product', 'customer', 'category']).describe('Group sales data by'),
  limit: z.number().min(1).max(50).default(10).describe('Number of top results to return'),
});

const getEmployeeReportSchema = z.object({
  department: z.string().optional().describe('Filter by department'),
  includePayroll: z.boolean().default(false).describe('Include payroll information'),
  activeOnly: z.boolean().default(true).describe('Only include active employees'),
});

const getKPIMetricsSchema = z.object({
  period: z
    .enum(['today', 'week', 'month', 'quarter', 'year'])
    .default('month')
    .describe('Period for KPI calculation'),
});

// Helper function to generate historical data
function generateHistoricalSummaries(startDate, endDate) {
  const summaries = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayOfWeek = currentDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Generate realistic daily revenue based on day of week
    const baseRevenue = faker.number.float({ min: 15000, max: 35000, fractionDigits: 2 });
    const revenue = isWeekend ? baseRevenue * 0.6 : baseRevenue;

    // Expenses are typically 60-80% of revenue
    const expenseRatio = faker.number.float({ min: 0.6, max: 0.8, fractionDigits: 2 });
    const expenses = revenue * expenseRatio;

    const orderCount = faker.number.int({ min: isWeekend ? 5 : 15, max: isWeekend ? 15 : 40 });

    const summary = {
      date: dateStr,
      revenue: revenue,
      expenses: expenses,
      profit: revenue - expenses,
      orderCount: orderCount,
      averageOrderValue: revenue / orderCount,
      topProducts: getTopProducts(3).map((p) => ({
        productId: p.product.id,
        name: p.product.name,
        revenue: p.revenue * faker.number.float({ min: 0.05, max: 0.15, fractionDigits: 2 }),
        quantity: faker.number.int({ min: 1, max: 10 }),
      })),
      topCustomers: mockCustomers.slice(0, 3).map((c) => ({
        customerId: c.id,
        name: c.companyName,
        revenue: faker.number.float({ min: 1000, max: 5000, fractionDigits: 2 }),
        orderCount: faker.number.int({ min: 1, max: 5 }),
      })),
    };

    summaries.push(summary);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return summaries;
}

export const analyticsTools = [
  {
    name: 'get_financial_summary',
    description: 'Get financial summary report for a date range',
    inputSchema: zodToJsonSchema(getFinancialSummarySchema),
  },
  {
    name: 'get_inventory_report',
    description: 'Get detailed inventory report with valuation',
    inputSchema: zodToJsonSchema(getInventoryReportSchema),
  },
  {
    name: 'get_sales_report',
    description: 'Get sales analytics report grouped by various dimensions',
    inputSchema: zodToJsonSchema(getSalesReportSchema),
  },
  {
    name: 'get_employee_report',
    description: 'Get employee analytics and payroll report',
    inputSchema: zodToJsonSchema(getEmployeeReportSchema),
  },
  {
    name: 'get_kpi_metrics',
    description: 'Get key performance indicators for the business',
    inputSchema: zodToJsonSchema(getKPIMetricsSchema),
  },
];

export async function handleAnalyticsTool(name, args) {
  switch (name) {
    case 'get_financial_summary': {
      const input = getFinancialSummarySchema.parse(args);

      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);

      // Generate financial summaries for the date range
      const dailySummaries = generateHistoricalSummaries(startDate, endDate);

      // Group by period if requested
      let groupedSummaries = dailySummaries;

      if (input.groupBy === 'week') {
        // Group by week logic
        const weeklyMap = new Map();

        dailySummaries.forEach((summary) => {
          const date = new Date(summary.date);
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          const weekKey = weekStart.toISOString().split('T')[0];

          if (!weeklyMap.has(weekKey)) {
            weeklyMap.set(weekKey, []);
          }
          weeklyMap.get(weekKey).push(summary);
        });

        groupedSummaries = Array.from(weeklyMap.entries()).map(([weekStart, summaries]) => ({
          date: weekStart,
          revenue: summaries.reduce((sum, s) => sum + s.revenue, 0),
          expenses: summaries.reduce((sum, s) => sum + s.expenses, 0),
          profit: summaries.reduce((sum, s) => sum + s.profit, 0),
          orderCount: summaries.reduce((sum, s) => sum + s.orderCount, 0),
          averageOrderValue:
            summaries.reduce((sum, s) => sum + s.revenue, 0) /
            summaries.reduce((sum, s) => sum + s.orderCount, 0),
          topProducts: summaries[0].topProducts, // Simplified
          topCustomers: summaries[0].topCustomers, // Simplified
        }));
      }

      const totalRevenue = groupedSummaries.reduce((sum, s) => sum + s.revenue, 0);
      const totalExpenses = groupedSummaries.reduce((sum, s) => sum + s.expenses, 0);
      const totalProfit = groupedSummaries.reduce((sum, s) => sum + s.profit, 0);
      const totalOrders = groupedSummaries.reduce((sum, s) => sum + s.orderCount, 0);

      return {
        period: {
          start: input.startDate,
          end: input.endDate,
          days: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
        },
        summary: {
          totalRevenue,
          totalExpenses,
          totalProfit,
          profitMargin: ((totalProfit / totalRevenue) * 100).toFixed(2) + '%',
          totalOrders,
          averageOrderValue: totalRevenue / totalOrders,
          averageDailyRevenue: totalRevenue / groupedSummaries.length,
        },
        data: groupedSummaries,
        trends: {
          revenueGrowth: faker.number.float({ min: -5, max: 15, fractionDigits: 2 }),
          orderGrowth: faker.number.float({ min: -3, max: 12, fractionDigits: 2 }),
          profitGrowth: faker.number.float({ min: -8, max: 20, fractionDigits: 2 }),
        },
      };
    }

    case 'get_inventory_report': {
      const input = getInventoryReportSchema.parse(args);

      let inventoryItems = [...mockInventory];

      if (input.warehouse) {
        inventoryItems = inventoryItems.filter((item) => item.warehouse === input.warehouse);
      }

      if (input.lowStockOnly) {
        inventoryItems = inventoryItems.filter((item) => item.quantity < item.reorderPoint);
      }

      // Enrich with product data and calculate values
      const enrichedInventory = inventoryItems.map((item) => {
        const product = mockProducts.find((p) => p.id === item.productId);
        const stockValue = product ? item.quantity * product.price : 0;
        const reorderValue = product ? item.reorderQuantity * product.price : 0;

        return {
          ...item,
          productName: product?.name || 'Unknown',
          productSku: product?.sku || 'Unknown',
          category: product?.category || 'Unknown',
          unitPrice: product?.price || 0,
          stockValue,
          reorderValue,
          daysUntilStockout:
            item.quantity > 0
              ? Math.floor(
                  item.quantity / faker.number.float({ min: 5, max: 20, fractionDigits: 1 }),
                )
              : 0,
          needsReorder: item.quantity < item.reorderPoint,
        };
      });

      const totalValue = enrichedInventory.reduce((sum, item) => sum + item.stockValue, 0);
      const itemsBelowReorderPoint = enrichedInventory.filter((item) => item.needsReorder).length;
      const totalReorderCost = enrichedInventory
        .filter((item) => item.needsReorder)
        .reduce((sum, item) => sum + item.reorderValue, 0);

      return {
        inventory: enrichedInventory,
        summary: {
          totalItems: enrichedInventory.length,
          totalValue: input.includeValuation ? totalValue : undefined,
          itemsBelowReorderPoint,
          totalReorderCost: input.includeValuation ? totalReorderCost : undefined,
          warehouses: [...new Set(enrichedInventory.map((item) => item.warehouse))],
          categorySummary: Object.entries(
            enrichedInventory.reduce((acc, item) => {
              if (!acc[item.category]) {
                acc[item.category] = { count: 0, value: 0 };
              }
              acc[item.category].count++;
              acc[item.category].value += item.stockValue;
              return acc;
            }, {}),
          ).map(([category, data]) => ({
            category,
            itemCount: data.count,
            totalValue: input.includeValuation ? data.value : undefined,
          })),
        },
        recommendations: enrichedInventory
          .filter((item) => item.needsReorder)
          .slice(0, 5)
          .map((item) => ({
            productId: item.productId,
            productName: item.productName,
            currentStock: item.quantity,
            reorderPoint: item.reorderPoint,
            recommendedOrderQuantity: item.reorderQuantity,
            estimatedCost: item.reorderValue,
            urgency:
              item.quantity === 0 ? 'critical' : item.daysUntilStockout < 7 ? 'high' : 'medium',
          })),
      };
    }

    case 'get_sales_report': {
      const input = getSalesReportSchema.parse(args);

      // Filter orders by date range
      const filteredOrders = mockOrders.filter(
        (order) =>
          order.orderDate >= input.startDate &&
          order.orderDate <= input.endDate &&
          order.status !== 'cancelled',
      );

      let reportData = [];

      switch (input.groupBy) {
        case 'product': {
          const productSales = new Map();

          filteredOrders.forEach((order) => {
            order.items.forEach((item) => {
              const current = productSales.get(item.productId) || {
                revenue: 0,
                quantity: 0,
                orderCount: 0,
              };
              productSales.set(item.productId, {
                revenue: current.revenue + item.lineTotal,
                quantity: current.quantity + item.quantity,
                orderCount: current.orderCount + 1,
                product: mockProducts.find((p) => p.id === item.productId),
              });
            });
          });

          reportData = Array.from(productSales.entries())
            .map(([productId, data]) => ({
              productId,
              productName: data.product?.name || 'Unknown',
              sku: data.product?.sku || 'Unknown',
              category: data.product?.category || 'Unknown',
              revenue: data.revenue,
              quantity: data.quantity,
              orderCount: data.orderCount,
              averageOrderSize: data.quantity / data.orderCount,
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, input.limit);
          break;
        }

        case 'customer': {
          const customerSales = new Map();

          filteredOrders.forEach((order) => {
            const current = customerSales.get(order.customerId) || {
              revenue: 0,
              orderCount: 0,
            };
            customerSales.set(order.customerId, {
              revenue: current.revenue + order.totalAmount,
              orderCount: current.orderCount + 1,
              customer: findCustomerById(order.customerId),
            });
          });

          reportData = Array.from(customerSales.entries())
            .map(([customerId, data]) => ({
              customerId,
              customerName: data.customer?.companyName || 'Unknown',
              contactName: data.customer?.contactName || 'Unknown',
              revenue: data.revenue,
              orderCount: data.orderCount,
              averageOrderValue: data.revenue / data.orderCount,
              lastOrderDate: filteredOrders
                .filter((o) => o.customerId === customerId)
                .sort((a, b) => b.orderDate.localeCompare(a.orderDate))[0]?.orderDate,
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, input.limit);
          break;
        }

        case 'category': {
          const categorySales = new Map();

          filteredOrders.forEach((order) => {
            order.items.forEach((item) => {
              const product = mockProducts.find((p) => p.id === item.productId);
              if (product) {
                const current = categorySales.get(product.category) || {
                  revenue: 0,
                  quantity: 0,
                  orderCount: 0,
                };
                categorySales.set(product.category, {
                  revenue: current.revenue + item.lineTotal,
                  quantity: current.quantity + item.quantity,
                  orderCount: current.orderCount + 1,
                });
              }
            });
          });

          reportData = Array.from(categorySales.entries())
            .map(([category, data]) => ({
              category,
              revenue: data.revenue,
              quantity: data.quantity,
              orderCount: data.orderCount,
              averageOrderValue: data.revenue / data.orderCount,
              productCount: mockProducts.filter((p) => p.category === category).length,
            }))
            .sort((a, b) => b.revenue - a.revenue);
          break;
        }
      }

      const totalRevenue = filteredOrders.reduce((sum, order) => sum + order.totalAmount, 0);
      const totalOrders = filteredOrders.length;

      return {
        period: {
          start: input.startDate,
          end: input.endDate,
        },
        groupBy: input.groupBy,
        data: reportData,
        summary: {
          totalRevenue,
          totalOrders,
          averageOrderValue: totalRevenue / totalOrders,
          topPerformers: reportData.slice(0, 3).map((item) => ({
            name: item.productName || item.customerName || item.category,
            revenue: item.revenue,
            percentage: ((item.revenue / totalRevenue) * 100).toFixed(2) + '%',
          })),
        },
      };
    }

    case 'get_employee_report': {
      const input = getEmployeeReportSchema.parse(args);

      let employees = [...mockEmployees];

      if (input.department) {
        employees = employees.filter(
          (e) => e.department.toLowerCase() === input.department.toLowerCase(),
        );
      }

      if (input.activeOnly) {
        employees = employees.filter((e) => e.status === 'active');
      }

      // Group by department
      const departmentStats = employees.reduce((acc, emp) => {
        if (!acc[emp.department]) {
          acc[emp.department] = {
            count: 0,
            totalSalary: 0,
            avgSalary: 0,
            roles: new Set(),
          };
        }
        acc[emp.department].count++;
        acc[emp.department].totalSalary += emp.salary;
        acc[emp.department].roles.add(emp.role);
        return acc;
      }, {});

      // Calculate averages
      Object.keys(departmentStats).forEach((dept) => {
        departmentStats[dept].avgSalary =
          departmentStats[dept].totalSalary / departmentStats[dept].count;
        departmentStats[dept].roles = Array.from(departmentStats[dept].roles);
      });

      const totalPayroll = employees.reduce((sum, emp) => sum + emp.salary, 0);
      const averageSalary = totalPayroll / employees.length;

      return {
        employees: employees.map((emp) => ({
          ...emp,
          salary: input.includePayroll ? emp.salary : undefined,
          yearsOfService: new Date().getFullYear() - new Date(emp.hireDate).getFullYear(),
        })),
        summary: {
          totalEmployees: employees.length,
          byStatus: {
            active: employees.filter((e) => e.status === 'active').length,
            onLeave: employees.filter((e) => e.status === 'on-leave').length,
            terminated: employees.filter((e) => e.status === 'terminated').length,
          },
          byDepartment: Object.entries(departmentStats).map(([dept, stats]) => ({
            department: dept,
            employeeCount: stats.count,
            totalPayroll: input.includePayroll ? stats.totalSalary : undefined,
            averageSalary: input.includePayroll ? stats.avgSalary : undefined,
            roles: stats.roles,
          })),
          totalPayroll: input.includePayroll ? totalPayroll : undefined,
          averageSalary: input.includePayroll ? averageSalary : undefined,
          locations: [...new Set(employees.map((e) => e.location))],
        },
      };
    }

    case 'get_kpi_metrics': {
      const input = getKPIMetricsSchema.parse(args);

      // Calculate date range based on period
      const endDate = new Date();
      const startDate = new Date();

      switch (input.period) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        case 'quarter':
          startDate.setMonth(endDate.getMonth() - 3);
          break;
        case 'year':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
      }

      // Filter orders for the period
      const periodOrders = mockOrders.filter((order) => {
        const orderDate = new Date(order.orderDate);
        return orderDate >= startDate && orderDate <= endDate;
      });

      // Calculate KPIs
      const revenue = periodOrders
        .filter((o) => o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.totalAmount, 0);

      const orderCount = periodOrders.filter((o) => o.status !== 'cancelled').length;
      const averageOrderValue = revenue / orderCount;

      // Customer metrics
      const uniqueCustomers = new Set(periodOrders.map((o) => o.customerId)).size;
      const repeatCustomers = periodOrders.reduce((acc, order) => {
        const customerOrders = periodOrders.filter((o) => o.customerId === order.customerId).length;
        if (customerOrders > 1) {
          acc.add(order.customerId);
        }
        return acc;
      }, new Set()).size;

      // Inventory metrics
      const stockTurnover = faker.number.float({ min: 2, max: 8, fractionDigits: 2 });
      const inventoryValue = mockInventory.reduce((sum, item) => {
        const product = mockProducts.find((p) => p.id === item.productId);
        return sum + (product ? item.quantity * product.price : 0);
      }, 0);

      // Employee productivity
      const activeEmployees = mockEmployees.filter((e) => e.status === 'active').length;
      const revenuePerEmployee = revenue / activeEmployees;

      return {
        period: input.period,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        salesMetrics: {
          revenue,
          orderCount,
          averageOrderValue,
          growthRate: faker.number.float({ min: -10, max: 25, fractionDigits: 2 }),
          conversionRate: faker.number.float({ min: 15, max: 35, fractionDigits: 2 }),
        },
        customerMetrics: {
          totalCustomers: mockCustomers.length,
          newCustomers: Math.floor(uniqueCustomers * 0.3),
          repeatCustomers,
          customerRetentionRate: ((repeatCustomers / uniqueCustomers) * 100).toFixed(2) + '%',
          customerLifetimeValue: faker.number.float({ min: 5000, max: 25000, fractionDigits: 2 }),
        },
        inventoryMetrics: {
          totalValue: inventoryValue,
          stockTurnoverRate: stockTurnover,
          itemsBelowReorderPoint: mockInventory.filter((i) => i.quantity < i.reorderPoint).length,
          stockoutRisk: mockInventory.filter((i) => i.quantity === 0).length,
          averageDaysToSell: faker.number.int({ min: 15, max: 45 }),
        },
        operationalMetrics: {
          orderFulfillmentRate: faker.number.float({ min: 94, max: 99, fractionDigits: 2 }) + '%',
          averageShippingTime:
            faker.number.float({ min: 1.5, max: 3.5, fractionDigits: 1 }) + ' days',
          onTimeDeliveryRate: faker.number.float({ min: 92, max: 98, fractionDigits: 2 }) + '%',
          returnRate: faker.number.float({ min: 2, max: 8, fractionDigits: 2 }) + '%',
        },
        employeeMetrics: {
          totalEmployees: mockEmployees.length,
          activeEmployees,
          revenuePerEmployee,
          averageProductivity: faker.number.float({ min: 85, max: 95, fractionDigits: 2 }) + '%',
          employeeSatisfactionScore:
            faker.number.float({ min: 3.5, max: 4.8, fractionDigits: 1 }) + '/5',
        },
        financialHealth: {
          profitMargin: faker.number.float({ min: 15, max: 35, fractionDigits: 2 }) + '%',
          cashFlowStatus: faker.helpers.arrayElement(['positive', 'stable', 'improving']),
          debtToEquityRatio: faker.number.float({ min: 0.2, max: 0.8, fractionDigits: 2 }),
          workingCapitalRatio: faker.number.float({ min: 1.2, max: 2.5, fractionDigits: 2 }),
        },
      };
    }

    default:
      throw new Error(`Unknown analytics tool: ${name}`);
  }
}
