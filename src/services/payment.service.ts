import { PaymentStatus } from '@prisma/client';
import { environment } from '../config/environment';
import { CreatePaymentIntentPayload, PaymentResult, PaymentIntent } from '../types/payment.types';
import { logger } from '../utils/logger';

const PAYMENT_SERVICE_URL = environment.paymentServiceUrl;

export const createPaymentIntent = async (
  payload: CreatePaymentIntentPayload
): Promise<PaymentResult> => {
  try {
    logger.info(
      { orderId: payload.orderId, amount: payload.amount, currency: payload.currency },
      'Creating payment intent'
    );

    const response = await fetch(`${PAYMENT_SERVICE_URL}/v1/payments/create-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': environment.paymentServiceApiKey,
        'x-user-id': payload.userId,
        'x-actor-id': payload.userId,
        'x-actor-user-id': payload.userId,
        'x-actor-type': 'SYSTEM',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ status: response.status, error }, 'Payment service error');
      return { success: false, error: `Payment service error: ${response.status}` };
    }

    const result = (await response.json()) as { data?: PaymentIntent };
    const data = result.data;

    if (!data?.paymentId) {
      logger.error({ result }, 'Payment service response missing paymentId');
      return { success: false, error: 'Payment service response missing paymentId' };
    }

    logger.info({ paymentId: data.paymentId, orderId: payload.orderId }, 'Payment intent created');

    return {
      success: true,
      paymentId: data.paymentId,
      clientSecret: data.clientSecret,
      status: data.status,
    };
  } catch (error) {
    logger.error(error, 'Failed to create payment intent');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

export const confirmPayment = async (paymentId: string): Promise<PaymentResult> => {
  try {
    logger.info({ paymentId }, 'Confirming payment');

    const response = await fetch(`${PAYMENT_SERVICE_URL}/v1/payments/${paymentId}/confirm`, {
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
};

export const refundPayment = async (paymentId: string, amount?: number): Promise<PaymentResult> => {
  try {
    logger.info({ paymentId, amount }, 'Processing refund');

    const response = await fetch(`${PAYMENT_SERVICE_URL}/v1/payments/${paymentId}/refund`, {
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
};

export const getPaymentStatus = async (paymentId: string): Promise<PaymentStatus | null> => {
  try {
    const response = await fetch(`${PAYMENT_SERVICE_URL}/v1/payments/${paymentId}`, {
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
};

export const paymentService = {
  createPaymentIntent,
  confirmPayment,
  refundPayment,
  getPaymentStatus,
};
