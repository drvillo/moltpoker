#!/usr/bin/env node

import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { program } from 'commander';
import dotenv from 'dotenv';

import { LiveSimulator } from './live.js';
import { ReplaySimulator } from './replay.js';

function findRepoRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(__dirname);
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });

const defaultPort = process.env.API_PORT || '3000';
const defaultServerUrl = `http://localhost:${defaultPort}`;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

program
  .name('molt-sim')
  .description('MoltPoker simulation and replay tools')
  .version('0.1.0');

// Live simulation command
program
  .command('live')
  .description('Run a live simulation with multiple agents')
  .option('-a, --agents <count>', 'Number of agents', '4')
  .option('-t, --types <types>', 'Agent types (comma-separated): random, tight, callstation, llm, autonomous', 'random,tight,callstation')
  .option('-n, --hands <count>', 'Number of hands to play', '10')
  .option('-s, --server <url>', 'Server URL', defaultServerUrl)
  .option('--blinds <blinds>', 'Blinds (small/big)', '1/2')
  .option('--stack <stack>', 'Initial stack', '1000')
  .option('--timeout <ms>', 'Action timeout in ms', '5000')
  .option('--model <provider:model>', 'LLM model for llm/autonomous agents (e.g. openai:gpt-4.1)')
  .option('--skill-doc <path>', 'Path to skill.md for LLM agents', 'public/skill.md')
  .option('--skill-url <url>', 'URL to skill.md for autonomous agents (e.g. http://localhost:3000/skill.md)')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      const blinds = options.blinds.split('/').map(Number);
      const agentTypes = options.types.split(',').map((t: string) => t.trim());

      // Validate LLM/autonomous requirements
      if (agentTypes.includes('llm') && !options.model) {
        console.error('Error: --model is required when using LLM agents (e.g. --model openai:gpt-4.1)');
        process.exit(1);
      }
      if (agentTypes.includes('autonomous')) {
        if (!options.model) {
          console.error('Error: --model is required when using autonomous agents (e.g. --model openai:gpt-4.1)');
          process.exit(1);
        }
        if (!options.skillUrl) {
          console.error('Error: --skill-url is required when using autonomous agents (e.g. --skill-url http://localhost:3000/skill.md)');
          process.exit(1);
        }
      }

      const simulator = new LiveSimulator({
        serverUrl: options.server,
        agentCount: parseInt(options.agents, 10),
        agentTypes,
        handsToPlay: parseInt(options.hands, 10),
        tableConfig: {
          blinds: { small: blinds[0]!, big: blinds[1]! },
          initialStack: parseInt(options.stack, 10),
          actionTimeoutMs: parseInt(options.timeout, 10),
        },
        verbose: options.verbose,
        serviceRoleKey,
        llmModel: options.model,
        skillDocPath: options.skillDoc,
        skillUrl: options.skillUrl,
      });

      console.log('Starting live simulation...');
      console.log(`Agents: ${options.agents} (${options.types})`);
      if (options.model) console.log(`LLM model: ${options.model}`);
      if (options.skillUrl) console.log(`Skill URL (autonomous): ${options.skillUrl}`);
      console.log(`Hands: ${options.hands}`);
      console.log(`Server: ${options.server}`);

      const result = await simulator.run();

      console.log('\n=== Simulation Complete ===');
      console.log(`Hands played: ${result.handsPlayed}`);
      console.log(`Duration: ${result.duration}ms`);

      if (result.errors.length > 0) {
        console.log(`Errors: ${result.errors.length}`);
        for (const error of result.errors) {
          console.log(`  - ${error}`);
        }
      }
    } catch (err) {
      console.error('Simulation failed:', err);
      process.exit(1);
    }
  });

// Replay command
program
  .command('replay')
  .description('Replay events from a log file')
  .argument('<file>', 'Event log file (JSON or JSONL)')
  .option('--verify', 'Verify chip conservation and state transitions')
  .option('-v, --verbose', 'Verbose output')
  .action((file, options) => {
    try {
      const simulator = new ReplaySimulator({
        eventsPath: file,
        verify: options.verify,
        verbose: options.verbose,
      });

      console.log(`Replaying events from ${file}...`);

      const result = simulator.run();

      console.log('\n=== Replay Complete ===');
      console.log(`Hands replayed: ${result.handsReplayed}`);
      console.log(`Success: ${result.success}`);

      if (result.errors.length > 0) {
        console.log(`\nErrors (${result.errors.length}):`);
        for (const error of result.errors) {
          console.log(`  - ${error}`);
        }
      }

      if (result.chipConservationViolations.length > 0) {
        console.log(`\nChip Conservation Violations (${result.chipConservationViolations.length}):`);
        for (const violation of result.chipConservationViolations) {
          console.log(`  - ${violation}`);
        }
      }

      if (result.illegalStateTransitions.length > 0) {
        console.log(`\nIllegal State Transitions (${result.illegalStateTransitions.length}):`);
        for (const transition of result.illegalStateTransitions) {
          console.log(`  - ${transition}`);
        }
      }

      if (!result.success) {
        process.exit(1);
      }
    } catch (err) {
      console.error('Replay failed:', err);
      process.exit(1);
    }
  });

program.parse();
