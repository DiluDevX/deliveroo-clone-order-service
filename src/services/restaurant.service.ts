import { environment } from '../config/environment';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

interface CommonResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface RestaurantSnapshot {
  id: string;
  name: string;
  deliveryCharge: number;
  minimumValue: number;
  status: string;
}

export interface DishSnapshot {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  price: number;
  image: string | null;
  isAvailable: boolean;
}

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  'x-api-key': environment.restaurantServiceApiKey,
  'x-actor-type': 'SYSTEM',
});

async function fetchRestaurantService<T>(path: string): Promise<T> {
  const url = `${environment.restaurantServiceUrl}${path}`;

  const response = await fetch(url, { headers: buildHeaders() });

  if (!response.ok) {
    const body = await response.text();
    logger.error({ status: response.status, body, path }, 'Restaurant service request failed');

    if (response.status === 404) {
      throw new NotFoundError('Restaurant service resource not found');
    }

    throw new BadRequestError(`Restaurant service request failed: ${response.status}`);
  }

  const payload = (await response.json()) as CommonResponse<T>;
  if (!payload.success || payload.data === undefined) {
    throw new BadRequestError(payload.message ?? 'Restaurant service returned invalid response');
  }

  return payload.data;
}

export const getRestaurant = async (restaurantId: string): Promise<RestaurantSnapshot> => {
  return fetchRestaurantService<RestaurantSnapshot>(`/v1/restaurants/${restaurantId}`);
};

export const getDish = async (dishId: string): Promise<DishSnapshot> => {
  return fetchRestaurantService<DishSnapshot>(`/v1/dishes/${dishId}`);
};

export const assertDishCanBeOrdered = (dish: DishSnapshot, restaurantId: string): void => {
  if (dish.restaurantId !== restaurantId) {
    throw new BadRequestError('Dish does not belong to the selected restaurant');
  }

  if (!dish.isAvailable) {
    throw new BadRequestError(`Dish ${dish.name} is currently unavailable`);
  }
};
