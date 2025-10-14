import { z } from 'zod';
import { UserRole } from '../../shared/types';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = loginSchema
  .extend({
    fullName: z.string().min(2),
    role: z.nativeEnum(UserRole),
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

