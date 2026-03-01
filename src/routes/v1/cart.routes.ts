import { Router } from 'express';
import {
  addItemToCart,
  checkout,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from '../../controllers/v1/cart.controller';
import { validateBody, validateParams } from '../../middleware/validate.middleware';
import {
  addItemToCartRequestBodySchema,
  cartItemIdParamsSchema,
  checkoutRequestBodySchema,
  updateCartItemRequestBodySchema,
} from '../../schema/cart.schema';

const router = Router();

router.get('/', getCart);

router.post('/', validateBody(addItemToCartRequestBodySchema), addItemToCart);

router.put(
  '/items/:cartItemId',
  validateParams(cartItemIdParamsSchema),
  validateBody(updateCartItemRequestBodySchema),
  updateCartItem
);

router.delete('/items/:cartItemId', validateParams(cartItemIdParamsSchema), removeCartItem);

router.delete('/', clearCart);

router.post('/checkout', validateBody(checkoutRequestBodySchema), checkout);

export default router;
