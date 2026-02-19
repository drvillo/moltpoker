import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastify from 'fastify';

import { config } from './config.js';
import * as db from './db.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerAutoJoinRoutes } from './routes/autoJoin.js';
import { registerSkillRoutes } from './routes/skill.js';
import { registerTableRoutes } from './routes/tables.js';
import { registerWebSocketRoutes } from './ws/connectionHandler.js';
import { initializePaymentAdapter } from './payments/paymentService.js';
import { startEventListener, stopEventListener } from './payments/eventListener.js';
import { validatePaymentConfig } from './config/validation.js';

/**
 * Clean up stale "running" tables on startup.
 * After a server restart, any tables marked as "running" in the database
 * no longer have active runtimes, so they should be marked as "ended".
 */
async function cleanupStaleTables(): Promise<number> {
  try {
    const runningTables = await db.listTables('running');
    let cleaned = 0;
    for (const table of runningTables) {
      await db.updateTableStatus(table.id, 'ended');
      cleaned++;
    }
    return cleaned;
  } catch (err) {
    // Don't fail startup if cleanup fails (DB might not be initialized yet)
    console.warn('Failed to cleanup stale tables:', err);
    return 0;
  }
}

async function main() {
  const usePrettyLogs =
    config.nodeEnv === 'development' || config.logLevel === 'debug';
  const app = fastify({
    logger: {
      level: config.logLevel,
      transport: usePrettyLogs
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
  registerAutoJoinRoutes(app);
  registerAdminRoutes(app);
  registerSkillRoutes(app);
  registerWebSocketRoutes(app);

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      stopEventListener();
      await app.close();
      process.exit(0);
    });
  }

  // Clean up stale tables before starting
  const cleanedCount = await cleanupStaleTables();
  if (cleanedCount > 0) {
    app.log.info(`Cleaned up ${cleanedCount} stale running table(s) from previous session`);
  }

  // Initialize payment adapter if real money is enabled
  if (config.realMoneyEnabled) {
    app.log.info('Real money mode enabled');
    app.log.info(`Payment adapter: ${config.paymentAdapter}`);
    
    // Validate configuration
    const validation = validatePaymentConfig();
    
    if (!validation.valid) {
      app.log.error('Payment configuration validation failed:');
      for (const error of validation.errors) {
        app.log.error(`  - ${error}`);
      }
      app.log.error('Real money tables will not function. Please fix configuration and restart.');
    } else {
      // Log warnings
      for (const warning of validation.warnings) {
        app.log.warn(`  - ${warning}`);
      }
      
      const adapter = initializePaymentAdapter();
      if (adapter) {
        app.log.info('Payment adapter initialized successfully');
        
        // Start event listener
        startEventListener(app.log);
      } else {
        app.log.warn('Failed to initialize payment adapter - real money tables may not function correctly');
      }
    }
  } else {
    app.log.info('Real money mode disabled (free-to-play only)');
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
