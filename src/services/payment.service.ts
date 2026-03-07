import { environment } from '../config/environment';
import { logger } from '../utils/logger';

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

export interface PaymentIntent {
  id: string;
  clientSecret: string;
  status: string;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  clientSecret?: string;
  error?: string;
}

const PAYMENT_SERVICE_URL = environment.paymentServiceUrl;

export const paymentService = {
  async createPaymentIntent(
    amount: number,
    currency: string,
    metadata: Record<string, string>
  ): Promise<PaymentResult> {
    try {
      logger.info({ amount, currency, metadata }, 'Creating payment intent');

      const response = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/create-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': environment.paymentServiceApiKey,
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100),
          currency,
          metadata,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'Payment service error');
        return { success: false, error: `Payment service error: ${response.status}` };
      }

      const data = (await response.json()) as PaymentIntent;

      logger.info({ paymentId: data.id }, 'Payment intent created');

      return {
        success: true,
        paymentId: data.id,
        clientSecret: data.clientSecret,
      };
    } catch (error) {
      logger.error(error, 'Failed to create payment intent');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  async confirmPayment(paymentId: string): Promise<PaymentResult> {
    try {
      logger.info({ paymentId }, 'Confirming payment');

      const response = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/${paymentId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': environment.paymentServiceApiKey,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'Payment confirmation error');
        return { success: false, error: `Payment confirmation error: ${response.status}` };
      }

      const data = (await response.json()) as { id: string; status: string };

      logger.info({ paymentId: data.id, status: data.status }, 'Payment confirmed');

      return {
        success: true,
        paymentId: data.id,
      };
    } catch (error) {
      logger.error(error, 'Failed to confirm payment');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  async refundPayment(paymentId: string, amount?: number): Promise<PaymentResult> {
    try {
      logger.info({ paymentId, amount }, 'Processing refund');

      const response = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': environment.paymentServiceApiKey,
        },
        body: JSON.stringify(amount ? { amount: Math.round(amount * 100) } : {}),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'Refund error');
        return { success: false, error: `Refund error: ${response.status}` };
      }

      const data = (await response.json()) as { id: string };

      logger.info({ paymentId: data.id }, 'Refund processed');

      return {
        success: true,
        paymentId: data.id,
      };
    } catch (error) {
      logger.error(error, 'Failed to process refund');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus | null> {
    try {
      const response = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/${paymentId}`, {
        headers: {
          'X-Api-Key': environment.paymentServiceApiKey,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { status: string };

      const statusMap: Record<string, PaymentStatus> = {
        succeeded: PaymentStatus.SUCCEEDED,
        failed: PaymentStatus.FAILED,
        cancelled: PaymentStatus.CANCELLED,
        refunded: PaymentStatus.REFUNDED,
        processing: PaymentStatus.PROCESSING,
        pending: PaymentStatus.PENDING,
      };

      return statusMap[data.status] || null;
    } catch (error) {
      logger.error(error, 'Failed to get payment status');
      return null;
    }
  },
};

export default paymentService;
