import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { environment } from './environment';
import { EnvironmentEnum, PRISMA_CODE } from '../utils/constants';

declare global {
  var prisma: PrismaClient | undefined;
}

// Prevent multiple instances during hot reload in development
export const prisma = globalThis.prisma || new PrismaClient();

if (environment.env !== EnvironmentEnum.Production) {
  globalThis.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to database');
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to disconnect from database');
    throw error;
  }
}

export async function checkDatabaseConnection(): Promise<'connected' | 'disconnected'> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'connected';
  } catch {
    return 'disconnected';
  }
}

export const isPrismaErrorWithCode = (
  error: unknown,
  code: (typeof PRISMA_CODE)[keyof typeof PRISMA_CODE]
): error is Prisma.PrismaClientKnownRequestError => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
};
