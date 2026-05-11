export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

export interface PaymentIntent {
  paymentId: string;
  clientSecret?: string | null;
  status: string;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  clientSecret?: string | null;
  status?: string;
  error?: string;
}

export interface CreatePaymentIntentPayload {
  orderId: string;
  userId: string;
  restaurantId: string;
  amount: number;
  currency: 'GBP';
  paymentMethod: 'CARD';
  commissionPercentage: number;
}
