import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import type { FastifyInstance } from 'fastify';

import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Replace template placeholders in skill.md with environment-specific values.
 * The source file uses {BASE_URL} and {WS_URL} as placeholders so each
 * deployment serves concrete URLs agents can use directly.
 */
function resolveTemplateVars(raw: string): string {
  return raw
    .replace(/\{BASE_URL\}/g, config.publicBaseUrl)
    .replace(/\{WS_URL\}/g, config.wsUrl)
}

export function registerSkillRoutes(fastify: FastifyInstance): void {
  /**
   * GET /skill.md - Serve skill documentation with resolved URLs
   */
  fastify.get('/skill.md', async (_request, reply) => {
    // Try multiple paths to find skill.md
    const possiblePaths = [
      join(__dirname, '../../../../public/skill.md'),
      join(__dirname, '../../../public/skill.md'),
      join(process.cwd(), 'public/skill.md'),
    ];

    for (const skillPath of possiblePaths) {
      if (existsSync(skillPath)) {
        const raw = readFileSync(skillPath, 'utf-8');
        const content = resolveTemplateVars(raw);
        return reply
          .header('Content-Type', 'text/markdown; charset=utf-8')
          .send(content);
      }
    }

    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Skill documentation not found',
      },
    });
  });
}
