import { spawn, type ChildProcess } from 'child_process';

export interface LiveSimulatorOptions {
  serverUrl: string;
  agentCount: number;
  agentTypes: string[];
  handsToPlay: number;
  tableConfig?: {
    blinds?: { small: number; big: number };
    initialStack?: number;
    actionTimeoutMs?: number;
  };
  verbose?: boolean;
  /** Service role key for admin API authentication */
  serviceRoleKey?: string;
}

export interface LiveSimulatorResult {
  handsPlayed: number;
  duration: number;
  agentResults: Array<{
    agentId: string;
    agentType: string;
    finalStack: number;
    handsWon: number;
  }>;
  errors: string[];
}

/**
 * Live simulator - spawns multiple agents to play against each other
 */
export class LiveSimulator {
  private options: LiveSimulatorOptions;
  private processes: ChildProcess[] = [];

  constructor(options: LiveSimulatorOptions) {
    this.options = options;
  }

  /**
   * Get headers for admin API requests
   */
  private getAdminHeaders(hasBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {};
    // Only set Content-Type if there's a body to send
    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.options.serviceRoleKey) {
      headers['Authorization'] = `Bearer ${this.options.serviceRoleKey}`;
    }
    return headers;
  }

  /**
   * Run the simulation
   */
  async run(): Promise<LiveSimulatorResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    // Create a table via admin API
    const tableResponse = await fetch(`${this.options.serverUrl}/v1/admin/tables`, {
      method: 'POST',
      headers: this.getAdminHeaders(true),
      body: JSON.stringify({
        config: {
          blinds: this.options.tableConfig?.blinds ?? { small: 1, big: 2 },
          initialStack: this.options.tableConfig?.initialStack ?? 1000,
          actionTimeoutMs: this.options.tableConfig?.actionTimeoutMs ?? 5000,
          maxSeats: Math.min(this.options.agentCount, 9),
        },
      }),
    });

    if (!tableResponse.ok) {
      const error = await tableResponse.text();
      throw new Error(`Failed to create table: ${error}`);
    }

    const table = (await tableResponse.json()) as { id: string };
    const tableId = table.id;

    if (this.options.verbose) {
      console.log(`Created table: ${tableId}`);
    }

    // Spawn agent processes
    const agentPromises: Promise<void>[] = [];

    for (let i = 0; i < this.options.agentCount; i++) {
      const agentType = this.options.agentTypes[i % this.options.agentTypes.length]!;

      const promise = this.spawnAgent(tableId, agentType, i);
      agentPromises.push(promise);

      // Small delay between spawns to avoid race conditions
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Start the table
    if (this.options.verbose) {
      console.log('Starting table...');
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const startResponse = await fetch(`${this.options.serverUrl}/v1/admin/tables/${tableId}/start`, {
      method: 'POST',
      headers: this.getAdminHeaders(false),
    });

    if (!startResponse.ok) {
      const error = await startResponse.text();
      throw new Error(`Failed to start table: ${error}`);
    }

    if (this.options.verbose) {
      console.log('Table started, playing hands...');
    }

    // Wait for hands to complete
    // In a real implementation, we'd poll for hand completion
    // For now, just wait a reasonable amount of time
    const estimatedTimePerHand = (this.options.tableConfig?.actionTimeoutMs ?? 5000) * 4;
    const totalWaitTime = this.options.handsToPlay * estimatedTimePerHand;

    await new Promise((resolve) => setTimeout(resolve, Math.min(totalWaitTime, 60000)));

    // Stop the table
    if (this.options.verbose) {
      console.log('Stopping table...');
    }

    await fetch(`${this.options.serverUrl}/v1/admin/tables/${tableId}/stop`, {
      method: 'POST',
      headers: this.getAdminHeaders(false),
    });

    // Kill agent processes
    for (const proc of this.processes) {
      proc.kill('SIGTERM');
    }

    const duration = Date.now() - startTime;

    return {
      handsPlayed: this.options.handsToPlay, // Approximate
      duration,
      agentResults: [], // Would need to track this properly
      errors,
    };
  }

  /**
   * Spawn an agent process
   */
  private async spawnAgent(tableId: string, agentType: string, index: number): Promise<void> {
    const args = [
      'packages/agents/dist/runner.js',
      '--type', agentType,
      '--server', this.options.serverUrl,
      '--table-id', tableId,
      '--name', `${agentType}-${index}`,
    ];

    const proc = spawn('node', args, {
      stdio: this.options.verbose ? 'inherit' : 'ignore',
      cwd: process.cwd(),
    });

    this.processes.push(proc);

    return new Promise((resolve, reject) => {
      proc.on('error', reject);
      proc.on('spawn', resolve);
    });
  }

  /**
   * Stop all processes
   */
  stop(): void {
    for (const proc of this.processes) {
      proc.kill('SIGTERM');
    }
    this.processes = [];
  }
}
