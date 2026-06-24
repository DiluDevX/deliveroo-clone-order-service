export interface EventEnvelope<TData> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  producer: string;
  data: TData;
}

export interface OrderCreatedEventData {
  orderId: string;
  orderNumber: string;
  userId: string;
  restaurantId: string;
  totalAmount: number;
  paymentMethod: string | null;
  status: string;
}
