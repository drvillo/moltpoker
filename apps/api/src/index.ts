import fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';

import { config } from './config.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerTableRoutes } from './routes/tables.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerSkillRoutes } from './routes/skill.js';
import { registerWebSocketRoutes } from './ws/connectionHandler.js';

async function main() {
  const app = fastify({
    logger: {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
      transport:
        config.nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: { colorize: true },
            }
          : undefined,
    },
  });

  // Register CORS
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Register WebSocket plugin
  await app.register(websocket);

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  }));

  // Register routes
  registerAgentRoutes(app);
  registerTableRoutes(app);
  registerAdminRoutes(app);
  registerSkillRoutes(app);
  registerWebSocketRoutes(app);

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      await app.close();
      process.exit(0);
    });
  }

  // Start server
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Server running at http://${config.host}:${config.port}`);
    app.log.info(`WebSocket URL: ${config.wsUrl}`);
    app.log.info(`Skill doc URL: ${config.skillDocUrl}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
