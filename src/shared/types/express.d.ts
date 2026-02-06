import "express";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      role: "student" | "teacher" | "admin";
      email?: string;
    };
    authError?: Error;
  }
}
