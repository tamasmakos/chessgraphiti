import { os } from "@orpc/server";
import type { Session, User } from "better-auth";

/**
 * Error map for `.errors()` — ORPC turns each entry into callable constructors on the
 * `errors` argument in middleware and handlers (do not call these plain objects directly).
 */
const procedureErrorMap = {
  UNAUTHORIZED: {
    message: "Unauthorized",
    status: 401,
  },
  BAD_REQUEST: {
    message: "Bad request",
    status: 400,
  },
  FORBIDDEN: {
    message: "Forbidden",
    status: 403,
  },
  NOT_FOUND: {
    message: "Not found",
    status: 404,
  },
  INTERNAL_SERVER_ERROR: {
    message: "Internal server error",
    status: 500,
  },
  NO_DATA: {
    message: "No data",
    status: 204,
  },
} as const;

export const orpc = os
  .$context<{
    headers: Headers;
    user:
      | (User & {
          role: string;
          permissions: string[];
          banned: boolean;
          banReason: string | null;
          bannedAt: Date | null;
        })
      | null;
    session: Session | null;
    clientIp?: string;
    clientUserAgent?: string;
  }>()
  .errors(procedureErrorMap);
