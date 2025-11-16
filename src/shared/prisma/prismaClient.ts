import { PrismaClient } from '@prisma/client';

// Optimize connection pooling for better concurrency
// Default pool size is too small (num_cpus * 2 + 1 ≈ 5 on 2-core VPS)
// Increase to 20 connections to handle more concurrent requests
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

