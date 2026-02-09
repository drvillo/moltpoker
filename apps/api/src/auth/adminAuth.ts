import { ErrorCodes, isAdminEmail } from '@moltpoker/shared';
import { createClient } from '@supabase/supabase-js';
import type { FastifyRequest, FastifyReply } from 'fastify';

import { config } from '../config.js';


let supabaseAdmin: ReturnType<typeof createClient> | null = null;

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    if (!config.supabaseServiceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin auth');
    }
    supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseAdmin;
}

export interface AdminUser {
  email: string;
  id: string;
}

/**
 * Extract JWT token from Authorization header
 */
function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  return parts[1] ?? null;
}

/**
 * Check if token is the service role key (for internal tools like simulator)
 */
function isServiceRoleKey(token: string): boolean {
  return token === config.supabaseServiceRoleKey;
}

/**
 * Verify Supabase JWT and check admin email allowlist.
 * When ADMIN_AUTH_ENABLED is false the check is skipped entirely.
 */
export async function verifyAdminAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AdminUser | null> {
  // Feature-flag short-circuit: auth disabled → allow all
  if (!config.adminAuthEnabled) {
    return { email: 'auth-disabled@local', id: 'auth-disabled' };
  }

  const token = extractToken(request);

  if (!token) {
    reply.status(401).send({
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Authorization header required',
      },
    });
    return null;
  }

  // Allow service role key for internal tools (simulator, scripts)
  if (isServiceRoleKey(token)) {
    return {
      email: 'service-role@internal',
      id: 'service-role',
    };
  }

  try {
    const supabase = getSupabaseAdmin();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user || !user.email) {
      reply.status(401).send({
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'Invalid or expired token',
        },
      });
      return null;
    }

    // Check if email is in admin allowlist (blocks all when list is empty)
    if (!isAdminEmail(user.email, config.adminEmails)) {
      reply.status(403).send({
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'Access denied. Admin privileges required.',
        },
      });
      return null;
    }

    return {
      email: user.email,
      id: user.id,
    };
  } catch (err) {
    reply.status(401).send({
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Failed to verify authentication',
      },
    });
    return null;
  }
}

/**
 * Admin auth middleware for Fastify routes.
 * Only applies to routes starting with /v1/admin.
 */
export async function adminAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Only apply admin auth to /v1/admin routes
  if (!request.url.startsWith('/v1/admin')) {
    return;
  }

  const admin = await verifyAdminAuth(request, reply);
  if (!admin) {
    return; // Error already sent
  }
  // Attach admin info to request for use in route handlers
  (request as FastifyRequest & { admin?: AdminUser }).admin = admin;
}
