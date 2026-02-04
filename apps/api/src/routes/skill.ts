import type { FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function registerSkillRoutes(fastify: FastifyInstance): void {
  /**
   * GET /skill.md - Serve skill documentation
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
        const content = readFileSync(skillPath, 'utf-8');
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
