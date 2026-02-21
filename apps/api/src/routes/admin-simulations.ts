import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import type { FastifyInstance } from 'fastify';
import { ErrorCodes, generateBucketKey } from '@moltpoker/shared';

const NOT_FOUND = 'NOT_FOUND';
import {
  createSimulationConfig,
  listSimulationConfigs,
  getSimulationConfig,
  updateSimulationConfig,
  deleteSimulationConfig,
  listSimulationRuns,
  getSimulationRun,
} from '../simulation/store.js';
import { getSimulationRunner } from '../simulation/runner.js';

const SUPPORTED_AGENT_TYPES = [
  { type: 'random', requires_model: false },
  { type: 'tight', requires_model: false },
  { type: 'callstation', requires_model: false },
  { type: 'autonomous', requires_model: true },
  { type: 'protocol', requires_model: true },
];

const MODEL_REQUIRED_TYPES = new Set(['autonomous', 'protocol']);

export function registerAdminSimulationRoutes(fastify: FastifyInstance): void {
  /**
   * GET /v1/admin/simulations/agent-types — List supported agent types
   * MUST be registered before /:id to prevent param capture
   */
  fastify.get('/v1/admin/simulations/agent-types', async (_request, reply) => {
    return reply.status(200).send({ agent_types: SUPPORTED_AGENT_TYPES });
  });

  /**
   * POST /v1/admin/simulations/emergency-stop — Stop active run + pause all periodic configs
   * MUST be registered before /:id
   */
  fastify.post('/v1/admin/simulations/emergency-stop', async (_request, reply) => {
    try {
      const runner = getSimulationRunner();
      await runner.emergencyStop();
      return reply.status(200).send({ success: true, message: 'Emergency stop executed' });
    } catch (err) {
      fastify.log.error(err, 'Emergency stop failed');
      return reply.status(500).send({
        error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Emergency stop failed' },
      });
    }
  });

  /**
   * GET /v1/admin/simulations — List all simulation configs with latest run status
   */
  fastify.get('/v1/admin/simulations', async (_request, reply) => {
    try {
      const configs = await listSimulationConfigs();
      const runner = getSimulationRunner();

      const result = await Promise.all(
        configs.map(async (c) => {
          const runs = await listSimulationRuns(c.id);
          const latestRun = runs[0] ?? null;
          return {
            ...c,
            latest_run: latestRun
              ? {
                  id: latestRun.id,
                  status: latestRun.status,
                  hands_played: latestRun.hands_played,
                  started_at: latestRun.started_at,
                  completed_at: latestRun.completed_at,
                }
              : null,
            is_running: runner.getActiveRunId() !== null && latestRun?.status === 'running',
          };
        })
      );

      return reply.status(200).send({ simulations: result });
    } catch (err) {
      fastify.log.error(err, 'Failed to list simulations');
      return reply.status(500).send({
        error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to list simulations' },
      });
    }
  });

  /**
   * POST /v1/admin/simulations — Create a simulation config
   */
  fastify.post('/v1/admin/simulations', async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    const {
      name,
      agent_count,
      agent_slots,
      table_config,
      max_hands,
      max_run_minutes,
      schedule_type,
      interval_minutes,
      cooldown_minutes,
    } = body;

    if (!name || typeof name !== 'string') {
      return reply.status(400).send({
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'name is required' },
      });
    }
    if (!agent_count || typeof agent_count !== 'number' || agent_count < 2) {
      return reply.status(400).send({
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'agent_count must be >= 2' },
      });
    }
    if (!Array.isArray(agent_slots) || agent_slots.length === 0) {
      return reply.status(400).send({
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'agent_slots must be a non-empty array' },
      });
    }
    if (agent_slots.length !== agent_count) {
      return reply.status(400).send({
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `agent_slots length (${agent_slots.length}) must equal agent_count (${agent_count})`,
        },
      });
    }

    // Validate agent slots
    for (const slot of agent_slots as Array<{ type?: string; model?: string }>) {
      if (!slot.type || !SUPPORTED_AGENT_TYPES.some((t) => t.type === slot.type)) {
        return reply.status(400).send({
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Unsupported agent type: ${slot.type}. Supported: ${SUPPORTED_AGENT_TYPES.map((t) => t.type).join(', ')}`,
          },
        });
      }
      if (MODEL_REQUIRED_TYPES.has(slot.type) && !slot.model) {
        return reply.status(400).send({
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Agent type '${slot.type}' requires a model (e.g. 'openai:gpt-4.1')`,
          },
        });
      }
    }

    const tc = (table_config as Record<string, unknown>) ?? {};
    const blinds = (tc.blinds as { small?: number; big?: number }) ?? {};
    const tableConfigResolved = {
      blinds: { small: (blinds.small as number) ?? 1, big: (blinds.big as number) ?? 2 },
      initialStack: (tc.initialStack as number) ?? 1000,
      actionTimeoutMs: (tc.actionTimeoutMs as number) ?? 10000,
    };

    const bucketKey = generateBucketKey({
      blinds: tableConfigResolved.blinds,
      maxSeats: agent_count as number,
      actionTimeoutMs: tableConfigResolved.actionTimeoutMs,
    });

    try {
      const simConfig = await createSimulationConfig({
        name: name as string,
        status: 'paused',
        schedule_type: (schedule_type as 'one_off' | 'periodic') ?? 'one_off',
        interval_minutes: (interval_minutes as number) ?? null,
        cooldown_minutes: (cooldown_minutes as number) ?? 5,
        max_hands: (max_hands as number) ?? 20,
        max_run_minutes: (max_run_minutes as number) ?? 2,
        agent_count: agent_count as number,
        agent_slots: agent_slots as Array<{ type: string; model?: string }>,
        table_config: tableConfigResolved,
        bucket_key: bucketKey,
      });

      return reply.status(201).send(simConfig);
    } catch (err) {
      fastify.log.error(err, 'Failed to create simulation config');
      return reply.status(500).send({
        error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to create simulation config' },
      });
    }
  });

  /**
   * GET /v1/admin/simulations/:id — Get config + run history
   */
  fastify.get<{ Params: { id: string } }>('/v1/admin/simulations/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      const simConfig = await getSimulationConfig(id);
      if (!simConfig) {
        return reply.status(404).send({
          error: { code: NOT_FOUND, message: 'Simulation not found' },
        });
      }
      const runs = await listSimulationRuns(id);
      const runner = getSimulationRunner();
      return reply.status(200).send({
        ...simConfig,
        runs,
        active_run_id: runner.getActiveRunId(),
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to get simulation');
      return reply.status(500).send({
        error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to get simulation' },
      });
    }
  });

  /**
   * PATCH /v1/admin/simulations/:id — Update config (name, schedule, pause/resume)
   */
  fastify.patch<{ Params: { id: string } }>('/v1/admin/simulations/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as Record<string, unknown>;

    try {
      const simConfig = await getSimulationConfig(id);
      if (!simConfig) {
        return reply.status(404).send({
          error: { code: NOT_FOUND, message: 'Simulation not found' },
        });
      }

      const allowed = ['name', 'status', 'interval_minutes', 'cooldown_minutes', 'max_hands', 'max_run_minutes', 'schedule_type'] as const;
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updates[key] = body[key];
      }

      const updated = await updateSimulationConfig(id, updates as Parameters<typeof updateSimulationConfig>[1]);
      return reply.status(200).send(updated);
    } catch (err) {
      fastify.log.error(err, 'Failed to update simulation');
      return reply.status(500).send({
        error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to update simulation' },
      });
    }
  });

  /**
   * DELETE /v1/admin/simulations/:id — Delete config (stops active run first)
   */
  fastify.delete<{ Params: { id: string } }>('/v1/admin/simulations/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      const simConfig = await getSimulationConfig(id);
      if (!simConfig) {
        return reply.status(404).send({
          error: { code: NOT_FOUND, message: 'Simulation not found' },
        });
      }

      const runner = getSimulationRunner();
      // Stop active run if it belongs to this config
      const activeRunId = runner.getActiveRunId();
      if (activeRunId) {
        const run = await getSimulationRun(activeRunId);
        if (run?.config_id === id) {
          await runner.stopActiveRun('config_deleted');
        }
      }

      await deleteSimulationConfig(id);
      return reply.status(200).send({ success: true });
    } catch (err) {
      fastify.log.error(err, 'Failed to delete simulation');
      return reply.status(500).send({
        error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to delete simulation' },
      });
    }
  });

  /**
   * POST /v1/admin/simulations/:id/start — Trigger a run immediately
   */
  fastify.post<{ Params: { id: string } }>('/v1/admin/simulations/:id/start', async (request, reply) => {
    const { id } = request.params;
    try {
      const simConfig = await getSimulationConfig(id);
      if (!simConfig) {
        return reply.status(404).send({
          error: { code: NOT_FOUND, message: 'Simulation not found' },
        });
      }

      const runner = getSimulationRunner();
      if (runner.isRunning()) {
        return reply.status(409).send({
          error: { code: 'SIMULATION_RUNNING', message: 'A simulation is already running' },
        });
      }

      // Mark config as active if it's one_off
      let activeConfig = simConfig;
      if (simConfig.status === 'paused') {
        activeConfig = await updateSimulationConfig(id, { status: 'active' });
      }

      const runId = await runner.startRun(activeConfig);
      if (!runId) {
        return reply.status(409).send({
          error: { code: 'SIMULATION_RUNNING', message: 'A simulation is already running' },
        });
      }

      return reply.status(200).send({ success: true, run_id: runId });
    } catch (err) {
      fastify.log.error(err, 'Failed to start simulation');
      return reply.status(500).send({
        error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to start simulation' },
      });
    }
  });

  /**
   * POST /v1/admin/simulations/:id/stop — Stop active run + pause config
   */
  fastify.post<{ Params: { id: string } }>('/v1/admin/simulations/:id/stop', async (request, reply) => {
    const { id } = request.params;
    try {
      const simConfig = await getSimulationConfig(id);
      if (!simConfig) {
        return reply.status(404).send({
          error: { code: NOT_FOUND, message: 'Simulation not found' },
        });
      }

      const runner = getSimulationRunner();
      const activeRunId = runner.getActiveRunId();
      if (activeRunId) {
        const run = await getSimulationRun(activeRunId);
        if (run?.config_id === id) {
          await runner.stopActiveRun('admin_stopped');
        }
      }

      await updateSimulationConfig(id, { status: 'paused' });
      return reply.status(200).send({ success: true });
    } catch (err) {
      fastify.log.error(err, 'Failed to stop simulation');
      return reply.status(500).send({
        error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to stop simulation' },
      });
    }
  });

  /**
   * GET /v1/admin/simulations/runs/:id/logs — Get log files for a run
   */
  fastify.get<{ Params: { id: string } }>('/v1/admin/simulations/runs/:id/logs', async (request, reply) => {
    const { id } = request.params;
    try {
      const run = await getSimulationRun(id);
      if (!run) {
        return reply.status(404).send({
          error: { code: NOT_FOUND, message: 'Run not found' },
        });
      }

      if (!run.log_dir || !existsSync(run.log_dir)) {
        return reply.status(404).send({
          error: { code: 'LOGS_EXPIRED', message: 'Logs have been rotated or the container restarted' },
        });
      }

      const files: Array<{ name: string; entries: unknown[] }> = [];
      try {
        const filenames = readdirSync(run.log_dir).filter((f) => f.endsWith('.jsonl'));
        for (const filename of filenames) {
          const filePath = path.join(run.log_dir, filename);
          const raw = readFileSync(filePath, 'utf-8');
          const entries = raw
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch {
                return { raw: line };
              }
            });
          files.push({ name: filename, entries });
        }
      } catch (err) {
        fastify.log.warn({ err, logDir: run.log_dir }, 'Failed to read log files');
      }

      return reply.status(200).send({ run_id: id, log_dir: run.log_dir, files });
    } catch (err) {
      fastify.log.error(err, 'Failed to get run logs');
      return reply.status(500).send({
        error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to get run logs' },
      });
    }
  });
}
