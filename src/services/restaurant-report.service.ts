import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import {
  ReportTrendPointDTO,
  RestaurantAnalyticsResponseDTO,
  RestaurantDashboardSummaryResponseDTO,
  TopItemReportDTO,
} from '../dtos/order.dto';
import {
  RestaurantOrderWithRelations,
  RestaurantReportOrder,
  countActiveOrders,
  countRecognizedCustomers,
  findRecentOrders,
  findRecognizedOrders,
} from './restaurant-report.database.service';

dayjs.extend(utc);

export type RestaurantDashboardSummaryResult = Omit<
  RestaurantDashboardSummaryResponseDTO,
  'recentOrders'
> & {
  recentOrders: RestaurantOrderWithRelations[];
};

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

const sumRevenue = (orders: RestaurantReportOrder[]): number =>
  roundMoney(orders.reduce((sum, order) => sum + order.totalAmount, 0));

const percentageChange = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

const isWithin = (date: Date, from: Dayjs, to: Dayjs): boolean => {
  const value = date.getTime();
  return value >= from.valueOf() && value <= to.valueOf();
};

const buildDailyTrend = (
  orders: RestaurantReportOrder[],
  firstDay: Dayjs,
  numberOfDays: number
): ReportTrendPointDTO[] =>
  Array.from({ length: numberOfDays }, (_, index) => {
    const day = firstDay.add(index, 'day');
    const periodOrders = orders.filter((order) =>
      isWithin(order.createdAt, day.startOf('day'), day.endOf('day'))
    );

    return {
      label: day.format('ddd'),
      periodStart: day.startOf('day').toISOString(),
      revenue: sumRevenue(periodOrders),
      orders: periodOrders.length,
    };
  });

const buildWeeklyTrend = (
  orders: RestaurantReportOrder[],
  firstWeek: Dayjs,
  numberOfWeeks: number
): ReportTrendPointDTO[] =>
  Array.from({ length: numberOfWeeks }, (_, index) => {
    const week = firstWeek.add(index, 'week');
    const periodOrders = orders.filter((order) =>
      isWithin(order.createdAt, week.startOf('week'), week.endOf('week'))
    );

    return {
      label: `Week ${index + 1}`,
      periodStart: week.startOf('week').toISOString(),
      revenue: sumRevenue(periodOrders),
      orders: periodOrders.length,
    };
  });

const buildMonthlyTrend = (
  orders: RestaurantReportOrder[],
  firstMonth: Dayjs,
  numberOfMonths: number
): ReportTrendPointDTO[] =>
  Array.from({ length: numberOfMonths }, (_, index) => {
    const month = firstMonth.add(index, 'month');
    const periodOrders = orders.filter((order) =>
      isWithin(order.createdAt, month.startOf('month'), month.endOf('month'))
    );

    return {
      label: month.format('MMM'),
      periodStart: month.startOf('month').toISOString(),
      revenue: sumRevenue(periodOrders),
      orders: periodOrders.length,
    };
  });

const buildTopItems = (orders: RestaurantReportOrder[]): TopItemReportDTO[] => {
  const itemTotals = new Map<string, TopItemReportDTO>();

  for (const order of orders) {
    for (const item of order.items) {
      const current = itemTotals.get(item.dishId) ?? {
        dishId: item.dishId,
        name: item.dishName,
        quantity: 0,
        revenue: 0,
      };
      current.quantity += item.quantity;
      current.revenue = roundMoney(current.revenue + item.lineTotal);
      itemTotals.set(item.dishId, current);
    }
  }

  return [...itemTotals.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
};

export const getRestaurantDashboardSummary = async (
  restaurantId: string
): Promise<RestaurantDashboardSummaryResult> => {
  const now = dayjs.utc();
  const reportStart = now.startOf('day').subtract(29, 'day');
  const [orders, activeOrders, totalCustomers, recentOrders] = await Promise.all([
    findRecognizedOrders(restaurantId, reportStart.toDate(), now.endOf('day').toDate()),
    countActiveOrders(restaurantId),
    countRecognizedCustomers(restaurantId),
    findRecentOrders(restaurantId, 5),
  ]);

  const todayOrders = orders.filter((order) =>
    isWithin(order.createdAt, now.startOf('day'), now.endOf('day'))
  );
  const yesterday = now.subtract(1, 'day');
  const yesterdayOrders = orders.filter((order) =>
    isWithin(order.createdAt, yesterday.startOf('day'), yesterday.endOf('day'))
  );
  const todaySales = sumRevenue(todayOrders);
  const yesterdaySales = sumRevenue(yesterdayOrders);
  const weekStart = now.startOf('day').subtract(6, 'day');
  const weeklyOrders = orders.filter((order) => order.createdAt >= weekStart.toDate());

  return {
    timezone: 'UTC',
    generatedAt: now.toISOString(),
    todaySales,
    todayOrders: todayOrders.length,
    salesChangePercent: percentageChange(todaySales, yesterdaySales),
    activeOrders,
    averageOrderValue: todayOrders.length > 0 ? roundMoney(todaySales / todayOrders.length) : 0,
    totalCustomers,
    weeklyTrend: buildDailyTrend(weeklyOrders, weekStart, 7),
    topItems: buildTopItems(orders),
    recentOrders,
  };
};

export const getRestaurantAnalytics = async (
  restaurantId: string
): Promise<RestaurantAnalyticsResponseDTO> => {
  const now = dayjs.utc();
  const firstMonth = now.startOf('month').subtract(5, 'month');
  const orders = await findRecognizedOrders(
    restaurantId,
    firstMonth.toDate(),
    now.endOf('month').toDate()
  );
  const currentMonthOrders = orders.filter((order) =>
    isWithin(order.createdAt, now.startOf('month'), now.endOf('month'))
  );
  const previousMonth = now.subtract(1, 'month');
  const previousMonthOrders = orders.filter((order) =>
    isWithin(order.createdAt, previousMonth.startOf('month'), previousMonth.endOf('month'))
  );
  const currentRevenue = sumRevenue(currentMonthOrders);
  const previousRevenue = sumRevenue(previousMonthOrders);
  const currentAverage =
    currentMonthOrders.length > 0 ? roundMoney(currentRevenue / currentMonthOrders.length) : 0;
  const previousAverage =
    previousMonthOrders.length > 0 ? roundMoney(previousRevenue / previousMonthOrders.length) : 0;

  const categoryTotals = new Map<string, number>();
  for (const order of currentMonthOrders) {
    for (const item of order.items) {
      const categoryId = item.dishCategory ?? 'uncategorized';
      categoryTotals.set(categoryId, (categoryTotals.get(categoryId) ?? 0) + item.quantity);
    }
  }
  const totalItems = [...categoryTotals.values()].reduce((sum, quantity) => sum + quantity, 0);
  const categoryBreakdown = [...categoryTotals.entries()]
    .map(([categoryId, quantity]) => ({
      categoryId,
      quantity,
      percentage: totalItems > 0 ? Math.round((quantity / totalItems) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.quantity - a.quantity);

  const hourTotals = new Map<number, number>();
  for (const order of currentMonthOrders) {
    const hour = order.createdAt.getUTCHours();
    hourTotals.set(hour, (hourTotals.get(hour) ?? 0) + 1);
  }
  const peakHours = [...hourTotals.entries()]
    .map(([hour, orderCount]) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      orders: orderCount,
    }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  const firstWeek = now.startOf('week').subtract(4, 'week');
  const weeklyOrders = orders.filter((order) => order.createdAt >= firstWeek.toDate());

  return {
    timezone: 'UTC',
    generatedAt: now.toISOString(),
    currentMonth: {
      revenue: currentRevenue,
      orders: currentMonthOrders.length,
      averageOrderValue: currentAverage,
      uniqueCustomers: new Set(currentMonthOrders.map((order) => order.userId)).size,
      revenueChangePercent: percentageChange(currentRevenue, previousRevenue),
      ordersChangePercent: percentageChange(currentMonthOrders.length, previousMonthOrders.length),
      averageOrderValueChangePercent: percentageChange(currentAverage, previousAverage),
    },
    weeklyTrend: buildWeeklyTrend(weeklyOrders, firstWeek, 5),
    monthlyTrend: buildMonthlyTrend(orders, firstMonth, 6),
    categoryBreakdown,
    peakHours,
  };
};
