import jwt from 'jsonwebtoken';

import { ErrorCodes, SESSION_EXPIRATION_SECONDS } from '@moltpoker/shared';

import { config } from '../config.js';
import { getSession } from '../db.js';

export interface SessionPayload {
  sessionId: string;
  agentId: string;
  tableId: string;
  seatId: number;
  exp: number;
}

/**
 * Generate a session JWT token
 */
export function generateSessionToken(
  sessionId: string,
  agentId: string,
  tableId: string,
  seatId: number
): string {
  const payload: Omit<SessionPayload, 'exp'> = {
    sessionId,
    agentId,
    tableId,
    seatId,
  };

  return jwt.sign(payload, config.sessionJwtSecret, {
    expiresIn: SESSION_EXPIRATION_SECONDS,
  });
}

/**
 * Verify and decode a session token
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, config.sessionJwtSecret) as SessionPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Validate a session token and check database
 */
export async function validateSession(
  token: string
): Promise<
  | { valid: true; payload: SessionPayload }
  | { valid: false; error: { code: string; message: string } }
> {
  const payload = verifySessionToken(token);

  if (!payload) {
    return {
      valid: false,
      error: {
        code: ErrorCodes.INVALID_SESSION,
        message: 'Invalid or malformed session token',
      },
    };
  }

  // Check if session still exists in database
  const session = await getSession(payload.sessionId);

  if (!session) {
    return {
      valid: false,
      error: {
        code: ErrorCodes.SESSION_EXPIRED,
        message: 'Session has been invalidated',
      },
    };
  }

  // Check expiration
  const expiresAt = new Date(session.expires_at);
  if (expiresAt < new Date()) {
    return {
      valid: false,
      error: {
        code: ErrorCodes.SESSION_EXPIRED,
        message: 'Session has expired',
      },
    };
  }

  return { valid: true, payload };
}
