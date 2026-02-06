import type { NextFunction, Request, Response } from "express";

const ADMIN_HEADER = "x-user-role";

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role === "admin") {
    return next();
  }

  // Backward compatibility: allow header-based admin until all clients use JWT.
  const header = req.header(ADMIN_HEADER) ?? req.header(ADMIN_HEADER.toUpperCase());
  if ((header ?? "").toLowerCase() !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
};
