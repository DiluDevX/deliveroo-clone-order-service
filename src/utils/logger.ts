import pino from 'pino';
import { environment } from '../config/environment';
import { EnvironmentEnum } from './constants';

export const logger = pino({
  level: environment.logging.level,
  ...(environment.env !== EnvironmentEnum.Production && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
  base: {
    service: environment.serviceName,
    env: environment.env,
  },
});
