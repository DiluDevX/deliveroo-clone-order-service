import { ActorContext } from '../middleware/actor-context.middleware';

declare global {
  namespace Express {
    interface Request {
      actor?: ActorContext;
    }
  }
}
