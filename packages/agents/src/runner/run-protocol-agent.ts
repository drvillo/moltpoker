import { join } from 'path'

import { ProtocolAgent } from '../agents/protocol.js'
import { PokerWsDisplay } from '../display/poker-display.js'
import { resolveModel } from '../lib/model-resolver.js'

/**
 * Run a protocol agent (YAML-contract-driven, domain-agnostic).
 */
export async function runProtocolAgent(options: {
  server: string
  tableId?: string
  name?: string
  model?: string
  skillUrl?: string
  llmLog?: boolean
  llmLogPath?: string
}): Promise<void> {
  if (!options.model)
    throw new Error('--model is required for protocol agent (e.g. openai:gpt-4.1)')
  if (!options.skillUrl) throw new Error('--skill-url is required for protocol agent')

  const model = await resolveModel(options.model)

  const logPath = options.llmLogPath
    ?? (options.llmLog
      ? join(process.cwd(), 'logs', `protocol-${Date.now()}.jsonl`)
      : undefined)

  const displayName = options.name ?? `ProtocolAgent-${options.model.split(':').pop()}`
  const display = new PokerWsDisplay(displayName)

  // Adapter: extract messages from protocol step events and route to display
  const onStep = (step: unknown) => {
    const event = step as Record<string, unknown>
    if (event.type !== 'ws_message') {
      // Bootstrap events
      if (event.type === 'bootstrap') {
        const id = event.stepId as string
        const result = event.result as Record<string, unknown> | null
        if (id === 'register') {
          display.handleBootstrap({ type: 'register', data: result ?? {} })
        } else if (id === 'join') {
          display.handleBootstrap({ type: 'join', data: result ?? {} })
        }
      }
      return
    }

    const msg = event.message as Record<string, unknown>
    if (!msg) return
    display.handleMessage(msg)
  }

  const agent = new ProtocolAgent({
    model,
    temperature: 0.3,
    logPath,
    onStep,
  })

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nStopping protocol agent...')
    agent.stop()
  })

  console.log(`Starting ${displayName}...`)
  if (logPath) console.log(`LLM logging enabled: ${logPath}`)
  console.log('Agent running. Press Ctrl+C to stop.')
  await agent.run(options.skillUrl, displayName, { tableId: options.tableId })
}
