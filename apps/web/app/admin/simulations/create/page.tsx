'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { simulationApi, type AgentSlotConfig, type AgentType } from '@/lib/api'

const SCHEDULE_TYPES = [
  { value: 'one_off', label: 'One-off (run once)' },
  { value: 'periodic', label: 'Periodic (repeat)' },
]

function createDefaultSlot(): AgentSlotConfig {
  return { type: 'random' }
}

export default function CreateSimulationPage() {
  const router = useRouter()

  const [agentTypes, setAgentTypes] = useState<AgentType[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [agentCount, setAgentCount] = useState(3)
  const [maxHands, setMaxHands] = useState(20)
  const [maxRunMinutes, setMaxRunMinutes] = useState(2)
  const [scheduleType, setScheduleType] = useState<'one_off' | 'periodic'>('one_off')
  const [intervalMinutes, setIntervalMinutes] = useState(10)
  const [cooldownMinutes, setCooldownMinutes] = useState(5)
  const [blindsSmall, setBlindsSmall] = useState(1)
  const [blindsBig, setBlindsBig] = useState(2)
  const [initialStack, setInitialStack] = useState(1000)
  const [actionTimeoutMs, setActionTimeoutMs] = useState(10000)
  const [slots, setSlots] = useState<AgentSlotConfig[]>([
    { type: 'random' },
    { type: 'tight' },
    { type: 'callstation' },
  ])

  useEffect(() => {
    simulationApi.getAgentTypes().then((data) => setAgentTypes(data.agent_types)).catch(() => {})
  }, [])

  useEffect(() => {
    setSlots((currentSlots) => {
      if (currentSlots.length === agentCount) return currentSlots
      if (currentSlots.length > agentCount) return currentSlots.slice(0, agentCount)
      return [...currentSlots, ...Array.from({ length: agentCount - currentSlots.length }, () => createDefaultSlot())]
    })
  }, [agentCount])

  function handleSlotTypeChange(idx: number, type: string) {
    const agentTypeDef = agentTypes.find((t) => t.type === type)
    setSlots(
      slots.map((s, i) =>
        i === idx
          ? { type, model: agentTypeDef?.requires_model ? (s.model ?? '') : undefined }
          : s
      )
    )
  }

  function handleSlotModelChange(idx: number, model: string) {
    setSlots(slots.map((s, i) => (i === idx ? { ...s, model } : s)))
  }

  function handleAgentCountChange(value: string) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    const nextCount = Math.max(2, Math.min(9, Math.floor(parsed)))
    setAgentCount(nextCount)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (slots.length !== agentCount) {
      setError(`Agent slots must match agent count (${agentCount})`)
      return
    }

    // Validate models for LLM agents
    for (const slot of slots) {
      const typeDef = agentTypes.find((t) => t.type === slot.type)
      if (typeDef?.requires_model && !slot.model?.trim()) {
        setError(`Agent type '${slot.type}' requires a model (e.g. openai:gpt-4.1)`)
        return
      }
    }

    setSubmitting(true)
    try {
      const sim = await simulationApi.createSimulation({
        name: name.trim(),
        agent_count: agentCount,
        agent_slots: slots,
        table_config: {
          blinds: { small: blindsSmall, big: blindsBig },
          initialStack,
          actionTimeoutMs,
        },
        max_hands: maxHands,
        max_run_minutes: maxRunMinutes,
        schedule_type: scheduleType,
        interval_minutes: scheduleType === 'periodic' ? intervalMinutes : undefined,
        cooldown_minutes: cooldownMinutes,
      })
      router.push(`/admin/simulations/${sim.id}`)
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } }
      setError(apiErr?.error?.message ?? 'Failed to create simulation')
    } finally {
      setSubmitting(false)
    }
  }

  const requiresModel = (type: string) => agentTypes.find((t) => t.type === type)?.requires_model ?? false

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New Simulation</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure a bot game simulation to run on the platform.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Basic Info</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Simulation Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekend Grinders"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Max Hands Per Run</label>
              <input
                type="number"
                value={maxHands}
                onChange={(e) => setMaxHands(Number(e.target.value))}
                min={1}
                max={500}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Agent Count</label>
              <input
                type="number"
                value={agentCount}
                onChange={(e) => handleAgentCountChange(e.target.value)}
                min={2}
                max={9}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Run Duration (minutes)</label>
              <input
                type="number"
                value={maxRunMinutes}
                onChange={(e) => setMaxRunMinutes(Number(e.target.value))}
                min={1}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              />
            </div>
          </div>
        </Card>

        {/* Table config */}
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Table Configuration</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Small Blind</label>
              <input
                type="number"
                value={blindsSmall}
                onChange={(e) => setBlindsSmall(Number(e.target.value))}
                min={1}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Big Blind</label>
              <input
                type="number"
                value={blindsBig}
                onChange={(e) => setBlindsBig(Number(e.target.value))}
                min={2}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Initial Stack</label>
              <input
                type="number"
                value={initialStack}
                onChange={(e) => setInitialStack(Number(e.target.value))}
                min={100}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Action Timeout (ms)</label>
              <input
                type="number"
                value={actionTimeoutMs}
                onChange={(e) => setActionTimeoutMs(Number(e.target.value))}
                min={1000}
                step={1000}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              />
            </div>
          </div>
        </Card>

        {/* Agent slots */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Agent Slots</h2>
          </div>
          <p className="text-sm text-gray-500">
            One slot per configured agent ({agentCount} total). Agents get random display names at runtime.
          </p>
          <div className="space-y-3">
            {slots.map((slot, idx) => (
              <div key={idx} className="flex items-start gap-3 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-500">Type</label>
                    <select
                      value={slot.type}
                      onChange={(e) => handleSlotTypeChange(idx, e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                    >
                      {agentTypes.map((t) => (
                        <option key={t.type} value={t.type}>{t.type}</option>
                      ))}
                      {agentTypes.length === 0 && <option value="random">random</option>}
                    </select>
                  </div>
                  {requiresModel(slot.type) && (
                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-500">Model *</label>
                      <input
                        type="text"
                        value={slot.model ?? ''}
                        onChange={(e) => handleSlotModelChange(idx, e.target.value)}
                        placeholder="openai:gpt-4.1"
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Schedule */}
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Schedule</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Schedule Type</label>
            <select
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as 'one_off' | 'periodic')}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            >
              {SCHEDULE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {scheduleType === 'periodic' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Interval (minutes)</label>
                <input
                  type="number"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  min={1}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cooldown (minutes)</label>
                <input
                  type="number"
                  value={cooldownMinutes}
                  onChange={(e) => setCooldownMinutes(Number(e.target.value))}
                  min={0}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
            </div>
          )}
        </Card>

        {error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting || !name.trim()}>
            {submitting ? 'Creating...' : 'Create Simulation'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push('/admin/simulations')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
