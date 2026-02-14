import { join } from 'path'

import { AutonomousAgent, type StepEvent } from '../agents/autonomous.js'
import { PokerWsDisplay } from '../display/poker-display.js'
import { safeParseJson } from '../display/normalizers.js'
import { resolveModel } from '../lib/model-resolver.js'

/**
 * Run an autonomous agent (domain-agnostic, discovers APIs at runtime).
 */
export async function runAutonomousAgent(options: {
  server: string
  name?: string
  model?: string
  skillUrl?: string
  skillDoc?: string
  llmLog?: boolean
}): Promise<void> {
  if (!options.model)
    throw new Error('--model is required for autonomous agent (e.g. openai:gpt-4.1)')
  if (!options.skillUrl)
    throw new Error(
      '--skill-url is required for autonomous agent' +
        (options.skillDoc ? ' (did you mean --skill-url instead of --skill-doc?)' : '')
    )

  const model = await resolveModel(options.model)

  const logPath = options.llmLog
    ? join(process.cwd(), 'logs', `autonomous-${Date.now()}.jsonl`)
    : undefined

  // Create a temporary agent to get the generated name with model ID
  const tempAgent = new AutonomousAgent({ model, temperature: 0.3 })

  // Use custom name if provided, otherwise use the agent's generated name (which includes model ID)
  const displayName = options.name ?? tempAgent.name
  const display = new PokerWsDisplay(displayName)

  // Adapter: extract messages from StepEvent and route to display
  const onStep = (step: StepEvent) => {
    for (const t of step.tools) {
      switch (t.toolName) {
        case 'fetch_document':
          // Silent – the skill doc fetch is an internal bootstrap step
          break

        case 'http_request': {
          const input = t.input as Record<string, unknown> | null
          const output = t.output as Record<string, unknown> | null
          const body = safeParseJson(output?.body)

          if (
            input?.method === 'POST' &&
            typeof input.url === 'string' &&
            input.url.endsWith('/v1/agents')
          ) {
            display.handleBootstrap({ type: 'register', data: body ?? {} })
          } else if (
            input?.method === 'GET' &&
            typeof input.url === 'string' &&
            input.url.endsWith('/v1/tables')
          ) {
            console.log('Looking for available table...')
            const tables = (body?.tables ?? []) as Array<Record<string, unknown>>
            const table = tables.find(
              (tb) => tb.status === 'waiting' && (tb.availableSeats as number) > 0
            )
            if (table) console.log(`Found table ${table.id}`)
          } else if (
            input?.method === 'POST' &&
            typeof input.url === 'string' &&
            input.url.includes('/auto-join')
          ) {
            display.handleBootstrap({ type: 'join', data: body ?? {} })
          } else if (
            input?.method === 'POST' &&
            typeof input.url === 'string' &&
            input.url.includes('/join')
          ) {
            // Extract table ID from URL
            const tableMatch = (input.url as string).match(/tables\/([^/]+)\/join/)
            const tableId = tableMatch?.[1] ?? 'unknown'
            console.log(`Joining table ${tableId}...`)
            display.handleBootstrap({ type: 'join', data: body ?? {} })
          }
          break
        }

        case 'websocket_connect': {
          const output = t.output as Record<string, unknown> | null
          if (output?.connectionId) console.log('Connecting WebSocket...')
          break
        }

        case 'websocket_read': {
          const output = t.output as Record<string, unknown> | null
          const msgs = (output?.messages ?? []) as Array<Record<string, unknown>>
          for (const msg of msgs) display.handleMessage(msg)
          if (output?.connectionClosed) console.log('WebSocket connection closed.')
          break
        }

        case 'websocket_send': {
          const input = t.input as Record<string, unknown> | null
          const parsed = safeParseJson(input?.message)
          if (parsed?.type === 'action' && parsed.action)
            display.handleAction(parsed.action as { kind: string; amount?: number })
          break
        }

        // generate_uuid: silent
      }
    }

    // Show agent text output (conclusions, end-of-game messages)
    if (step.text) {
      display.displayText(step.text)
    }
  }

  // Create the actual agent with the onStep callback
  const agent = new AutonomousAgent({ model, temperature: 0.3, logPath, onStep })

  const task =
    `First, fetch the skill document from ${options.skillUrl} using fetch_document with documentRole: "skill" to learn how to interact with this platform. ` +
    `The server base URL is ${options.server}. ` +
    `After reading the skill document, register as an agent${options.name ? ` named "${options.name}"` : ` named "${displayName}"`}, ` +
    `use the auto-join endpoint to join a game, and play. Continue playing until the table ends or you are told to stop.`

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nStopping autonomous agent...')
    agent.stop()
  })

  console.log(`Starting ${displayName}...`)
  if (logPath) console.log(`LLM logging enabled: ${logPath}`)
  console.log('Agent running. Press Ctrl+C to stop.')
  await agent.run(task)
}
