import { spawn, type ChildProcess } from 'child_process';
import WebSocket from 'ws';

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
  /** LLM model spec for agents of type "llm" or "autonomous" (e.g. "openai:gpt-4.1") */
  llmModel?: string;
  /** Path to skill.md file for LLM agents */
  skillDocPath?: string;
  /** URL to skill.md for autonomous agents (e.g. "http://localhost:3000/skill.md") */
  skillUrl?: string;
  /** Use auto-join instead of admin table creation (default: true) */
  useAutoJoin?: boolean;
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
    const useAutoJoin = this.options.useAutoJoin !== false;

    if (useAutoJoin) {
      return this.runWithAutoJoin(startTime, errors);
    }
    return this.runWithAdminCreate(startTime, errors);
  }

  /**
   * Run simulation using auto-join (agents self-organize)
   */
  private async runWithAutoJoin(startTime: number, errors: string[]): Promise<LiveSimulatorResult> {
    if (this.options.verbose) {
      console.log('Using auto-join mode: agents will self-organize');
    }

    // Spawn agents without a table ID (they will auto-join)
    for (let i = 0; i < this.options.agentCount; i++) {
      const agentType = this.options.agentTypes[i % this.options.agentTypes.length]!;
      await this.spawnAgent(null, agentType, i);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (this.options.verbose) {
      console.log(`Spawned ${this.options.agentCount} agents, waiting for auto-join and auto-start...`);
    }

    // Wait for agents to finish (they should auto-start when enough join)
    // Use a timeout-based approach since we don't have a table ID up front
    await new Promise((resolve) => setTimeout(resolve, this.options.handsToPlay * 15000 + 10000));

    // Kill agent processes
    for (const proc of this.processes) {
      proc.kill('SIGTERM');
    }

    const duration = Date.now() - startTime;

    return {
      handsPlayed: this.options.handsToPlay,
      duration,
      agentResults: [],
      errors,
    };
  }

  /**
   * Run simulation using admin table creation (traditional flow)
   */
  private async runWithAdminCreate(startTime: number, errors: string[]): Promise<LiveSimulatorResult> {
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
    const handsPlayed = await this.waitForHandCompletion(tableId);

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
      handsPlayed,
      duration,
      agentResults: [], // Would need to track this properly
      errors,
    };
  }

  /**
   * Wait for hands to complete by observing via WebSocket
   */
  private async waitForHandCompletion(tableId: string): Promise<number> {
    const wsUrl = this.options.serverUrl.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsUrl}/v1/ws/observe/${tableId}`);

    let handsCompleted = 0;
    const targetHands = this.options.handsToPlay;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve(handsCompleted); // Return what we got
      }, 120000); // 2 minute safety timeout

      ws.onopen = () => {};

      ws.onmessage = (event: WebSocket.MessageEvent) => {
        const message = JSON.parse(event.data.toString());
        if (message.type === 'hand_complete') {
          handsCompleted++;
          if (this.options.verbose) {
            console.log(`Hand ${handsCompleted}/${targetHands} complete`);
          }
          if (handsCompleted >= targetHands) {
            clearTimeout(timeout);
            ws.close();
            resolve(handsCompleted);
          }
        }
      };

      ws.onclose = () => {};

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('WebSocket connection error'));
      };
    });
  }

  /**
   * Spawn an agent process
   */
  private async spawnAgent(tableId: string | null, agentType: string, index: number): Promise<void> {
    const args = [
      'packages/agents/dist/runner.js',
      '--type', agentType,
      '--server', this.options.serverUrl,
      '--name', `${agentType}-${index}`,
    ];

    // Only pass --table-id if explicitly provided (otherwise agent uses auto-join)
    if (tableId) {
      args.push('--table-id', tableId);
    }

    // LLM agents need --model and --skill-doc
    if (agentType === 'llm') {
      if (!this.options.llmModel)
        throw new Error('llmModel is required in LiveSimulatorOptions when using LLM agents');
      if (!this.options.skillDocPath)
        throw new Error('skillDocPath is required in LiveSimulatorOptions when using LLM agents');
      args.push('--model', this.options.llmModel);
      args.push('--skill-doc', this.options.skillDocPath);
    }

    // Autonomous agents need --model and --skill-url (they discover the table from the API)
    if (agentType === 'autonomous') {
      if (!this.options.llmModel)
        throw new Error('llmModel is required in LiveSimulatorOptions when using autonomous agents');
      if (!this.options.skillUrl)
        throw new Error('skillUrl is required in LiveSimulatorOptions when using autonomous agents');
      args.push('--model', this.options.llmModel);
      args.push('--skill-url', this.options.skillUrl);
    }

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
