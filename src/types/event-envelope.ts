export interface EventEnvelope<TData> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  producer: string;
  data: TData;
}

export interface OrderEventDeliveryAddress {
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  instructions: string | null;
  label: string | null;
}

export interface OrderEventItemModifier {
  id: string;
  name: string;
  option: string;
  extraPrice: number;
}

export interface OrderEventItem {
  id: string;
  dishId: string;
  dishName: string;
  dishImageUrl: string | null;
  dishCategory: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  modifiers: OrderEventItemModifier[];
}

export interface OrderCreatedEventData {
  orderId: string;
  orderNumber: string;
  userId: string;
  userEmail?: string;
  userFirstName?: string;
  userLastName?: string;
  restaurantId: string;
  restaurantName: string;
  restaurantAddress: string;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: string | null;
  paymentStatus: string;
  status: string;
  deliveryAddress: OrderEventDeliveryAddress;
  items: OrderEventItem[];
  estimatedDeliveryAt: string | null;
  createdAt: string;
}
