import { existsSync, readdirSync, rmSync, mkdirSync, statSync } from 'fs';
import path from 'path';
import type { FastifyBaseLogger } from 'fastify';
import { LiveSimulator } from '@moltpoker/simulator';
import { createJsonlLogger } from '@moltpoker/agents';
import {
  createSimulationRun,
  updateSimulationRun,
  markRunFailed,
  markRunCompleted,
  listStaleRunningRuns,
  listSimulationConfigs,
  listProviderApiKeysFull,
  buildEnvFromApiKeys,
  pauseAllPeriodicConfigs,
  type SimulationConfig,
} from './store.js';
import { config } from '../config.js';

const LOG_BASE_DIR = '/tmp/molt-sim';
const MAX_LOG_RETENTION = 5;
const SAFETY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ─── SimulationRunner ─────────────────────────────────────────────────────────

export class SimulationRunner {
  private log: FastifyBaseLogger;
  private activeRunId: string | null = null;
  private activeSimulator: LiveSimulator | null = null;
  private scheduleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(log: FastifyBaseLogger) {
    this.log = log;
  }

  /**
   * Called on API startup: recover stale runs and reschedule active periodic configs.
   */
  async initialize(): Promise<void> {
    await this.recoverStaleRuns();
    await this.rescheduleActiveConfigs();
  }

  /**
   * Called on API shutdown: cancel all timers and stop active simulation.
   */
  async shutdown(): Promise<void> {
    this.log.info('SimulationRunner: shutting down');
    for (const [id, timer] of this.scheduleTimers) {
      clearTimeout(timer);
      this.scheduleTimers.delete(id);
    }
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    if (this.activeSimulator) {
      this.activeSimulator.stop();
      this.activeSimulator = null;
    }
  }

  isRunning(): boolean {
    return this.activeRunId !== null;
  }

  getActiveRunId(): string | null {
    return this.activeRunId;
  }

  /**
   * Trigger an immediate simulation run for the given config.
   * Returns the new run ID, or null if already running.
   */
  async startRun(simConfig: SimulationConfig): Promise<string | null> {
    if (this.activeRunId !== null) {
      this.log.warn('SimulationRunner: run already active, skipping trigger');
      return null;
    }

    this.rotateOldLogDirs();

    const logDir = path.join(LOG_BASE_DIR, `run-pending-${Date.now()}`);
    mkdirSync(logDir, { recursive: true });

    const run = await createSimulationRun(simConfig.id, logDir);
    // Rename dir to use real run ID
    const finalLogDir = path.join(LOG_BASE_DIR, run.id);
    try {
      const { renameSync } = await import('fs');
      renameSync(logDir, finalLogDir);
    } catch {
      // Ignore rename errors, use original dir
    }
    await updateSimulationRun(run.id, { log_dir: finalLogDir });

    this.activeRunId = run.id;

    this.log.info({ runId: run.id, configId: simConfig.id }, 'SimulationRunner: starting run');

    // Execute run asynchronously
    this.executeRun(simConfig, run.id, finalLogDir).catch((err) => {
      this.log.error({ err, runId: run.id }, 'SimulationRunner: unexpected error in executeRun');
    });

    return run.id;
  }

  /**
   * Stop the active simulation run and pause the config if requested.
   */
  async stopActiveRun(reason = 'admin_stopped'): Promise<void> {
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    if (this.activeSimulator) {
      this.activeSimulator.stop();
      this.activeSimulator = null;
    }
    if (this.activeRunId) {
      await markRunFailed(this.activeRunId, reason);
      this.log.info({ runId: this.activeRunId }, 'SimulationRunner: run stopped');
      this.activeRunId = null;
    }
  }

  /**
   * Emergency stop: halt active run + pause all periodic configs.
   */
  async emergencyStop(): Promise<void> {
    this.log.warn('SimulationRunner: emergency stop triggered');
    // Cancel all schedule timers
    for (const [id, timer] of this.scheduleTimers) {
      clearTimeout(timer);
      this.scheduleTimers.delete(id);
    }
    await this.stopActiveRun('emergency_stop');
    await pauseAllPeriodicConfigs();
  }

  /**
   * Schedule the next periodic run for a config after cooldown.
   */
  scheduleNextRun(simConfig: SimulationConfig, cooldownMs: number): void {
    // Cancel any existing timer for this config
    const existing = this.scheduleTimers.get(simConfig.id);
    if (existing) clearTimeout(existing);

    this.log.info(
      { configId: simConfig.id, cooldownMs },
      'SimulationRunner: scheduling next run after cooldown'
    );

    const timer = setTimeout(async () => {
      this.scheduleTimers.delete(simConfig.id);
      // Re-fetch config to check it's still active
      const { getSimulationConfig } = await import('./store.js');
      const latest = await getSimulationConfig(simConfig.id);
      if (!latest || latest.status !== 'active' || latest.schedule_type !== 'periodic') {
        this.log.info({ configId: simConfig.id }, 'SimulationRunner: config no longer active, skipping scheduled run');
        return;
      }
      await this.startRun(latest);
    }, cooldownMs);

    this.scheduleTimers.set(simConfig.id, timer);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async executeRun(simConfig: SimulationConfig, runId: string, logDir: string): Promise<void> {
    const summaryLogger = createJsonlLogger(path.join(logDir, 'simulation-summary.jsonl'));

    summaryLogger({
      event: 'simulation_start',
      config_id: simConfig.id,
      run_id: runId,
      agent_count: simConfig.agent_count,
      max_hands: simConfig.max_hands,
    });

    // Safety timeout
    let timedOut = false;
    this.safetyTimer = setTimeout(async () => {
      timedOut = true;
      this.log.warn({ runId }, 'SimulationRunner: safety timeout reached, killing run');
      if (this.activeSimulator) {
        this.activeSimulator.stop();
        this.activeSimulator = null;
      }
    }, SAFETY_TIMEOUT_MS);

    let handsPlayed = 0;
    let runError: string | null = null;

    try {
      if (simConfig.agent_slots.length !== simConfig.agent_count) {
        throw new Error(
          `invalid_config_slot_count: agent_slots length (${simConfig.agent_slots.length}) must equal agent_count (${simConfig.agent_count})`
        );
      }

      // Load API keys from DB
      const keys = await listProviderApiKeysFull();
      const envVars = buildEnvFromApiKeys(keys);

      const simulator = new LiveSimulator({
        serverUrl: config.publicBaseUrl,
        agentCount: simConfig.agent_count,
        agentSlots: simConfig.agent_slots,
        handsToPlay: simConfig.max_hands,
        tableConfig: simConfig.table_config,
        bucketKey: simConfig.bucket_key,
        serviceRoleKey: config.supabaseServiceRoleKey,
        skillUrl: config.skillDocUrl,
        useAutoJoin: false,
        logDir,
        env: envVars,
        verbose: false,
        onTableCreated(tableId) {
          void updateSimulationRun(runId, { table_id: tableId });
        },
      });

      this.activeSimulator = simulator;

      const result = await simulator.run();
      handsPlayed = result.handsPlayed;

      // Persist table_id so run history shows a link
      if (result.tableId) {
        await updateSimulationRun(runId, { table_id: result.tableId });
      }

      summaryLogger({
        event: 'simulation_complete',
        run_id: runId,
        hands_played: handsPlayed,
        table_id: result.tableId,
        duration_ms: result.duration,
        errors: result.errors,
      });
    } catch (err) {
      runError = err instanceof Error ? err.message : String(err);
      summaryLogger({ event: 'simulation_error', run_id: runId, error: runError });
      this.log.error({ err, runId }, 'SimulationRunner: run failed');
    } finally {
      if (this.safetyTimer) {
        clearTimeout(this.safetyTimer);
        this.safetyTimer = null;
      }
      this.activeSimulator = null;
    }

    // Persist final status
    const finalError = timedOut ? 'safety_timeout' : runError;
    if (finalError) {
      await markRunFailed(runId, finalError);
    } else {
      await markRunCompleted(runId, handsPlayed);
    }

    this.activeRunId = null;
    this.log.info({ runId, handsPlayed, error: finalError }, 'SimulationRunner: run finished');

    // Schedule next run for periodic configs (even on failure — just use cooldown as backoff)
    if (simConfig.schedule_type === 'periodic' && simConfig.status === 'active') {
      // Use interval_minutes as the primary scheduling period; cooldown as a minimum
      const intervalMs = (simConfig.interval_minutes ?? simConfig.cooldown_minutes ?? 5) * 60 * 1000;
      const cooldownMs = (simConfig.cooldown_minutes ?? 5) * 60 * 1000;
      const waitMs = Math.max(intervalMs, cooldownMs);
      this.scheduleNextRun(simConfig, waitMs);
    }
  }

  private async recoverStaleRuns(): Promise<void> {
    const stale = await listStaleRunningRuns();
    if (stale.length === 0) return;

    this.log.warn({ count: stale.length }, 'SimulationRunner: marking stale running runs as failed');
    for (const run of stale) {
      await markRunFailed(run.id, 'api_restart');
    }
  }

  private async rescheduleActiveConfigs(): Promise<void> {
    const configs = await listSimulationConfigs();
    const active = configs.filter((c) => c.status === 'active' && c.schedule_type === 'periodic');

    if (active.length === 0) return;

    this.log.info({ count: active.length }, 'SimulationRunner: rescheduling active periodic configs');

    // Start the first config immediately; stagger remaining ones to avoid simultaneous start attempts
    let staggerMs = 0;
    for (const c of active) {
      if (staggerMs === 0) {
        await this.startRun(c);
      } else {
        // Schedule remaining configs — they'll compete for the single-run slot
        this.scheduleNextRun(c, staggerMs);
      }
      staggerMs += 5000; // 5-second stagger between each config's first attempt
    }
  }

  private rotateOldLogDirs(): void {
    if (!existsSync(LOG_BASE_DIR)) return;

    try {
      const dirs = readdirSync(LOG_BASE_DIR)
        .map((name) => {
          const fullPath = path.join(LOG_BASE_DIR, name);
          try {
            return { name, fullPath, mtime: statSync(fullPath).mtimeMs };
          } catch {
            return null;
          }
        })
        .filter((d): d is { name: string; fullPath: string; mtime: number } => d !== null)
        .sort((a, b) => b.mtime - a.mtime); // newest first

      const toDelete = dirs.slice(MAX_LOG_RETENTION);
      for (const dir of toDelete) {
        try {
          rmSync(dir.fullPath, { recursive: true, force: true });
          this.log.debug({ dir: dir.fullPath }, 'SimulationRunner: rotated old log dir');
        } catch (err) {
          this.log.warn({ err, dir: dir.fullPath }, 'SimulationRunner: failed to delete log dir');
        }
      }
    } catch (err) {
      this.log.warn({ err }, 'SimulationRunner: log rotation failed');
    }
  }
}

// Singleton instance — set during API startup
let _runner: SimulationRunner | null = null;

export function getSimulationRunner(): SimulationRunner {
  if (!_runner) throw new Error('SimulationRunner not initialized');
  return _runner;
}

export function initSimulationRunner(log: FastifyBaseLogger): SimulationRunner {
  _runner = new SimulationRunner(log);
  return _runner;
}
