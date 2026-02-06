import jwt from "jsonwebtoken";

import { env } from "../../config/env";
import type { UserRole } from "../types";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";

export type JwtPayload = {
  sub: string;
  role: UserRole;
  email?: string;
};

export const signAccessToken = (payload: JwtPayload) => {
  if (!env.jwtSecret) {
    throw Object.assign(new Error("Missing JWT_SECRET"), { status: 500 });
  }
  return jwt.sign(payload, env.jwtSecret, { expiresIn: ACCESS_TOKEN_TTL });
};

export const signRefreshToken = (payload: JwtPayload) => {
  if (!env.jwtSecret) {
    throw Object.assign(new Error("Missing JWT_SECRET"), { status: 500 });
  }
  return jwt.sign(payload, env.jwtSecret, { expiresIn: REFRESH_TOKEN_TTL });
};

export const verifyToken = (token: string): JwtPayload => {
  if (!env.jwtSecret) {
    throw Object.assign(new Error("Missing JWT_SECRET"), { status: 500 });
  }
  const decoded = jwt.verify(token, env.jwtSecret);
  if (!decoded || typeof decoded !== "object") {
    throw Object.assign(new Error("Invalid token"), { status: 401 });
  }
  const payload = decoded as JwtPayload;
  if (!payload.sub || !payload.role) {
    throw Object.assign(new Error("Invalid token payload"), { status: 401 });
  }
  return payload;
};
