'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
  simulationApi,
  type SimulationConfigWithRuns,
  type SimulationRun,
  type RunLogFile,
} from '@/lib/api'

function runStatusVariant(status: string) {
  if (status === 'running') return 'warning' as const
  if (status === 'completed') return 'success' as const
  return 'error' as const
}

function RunRow({ run }: { run: SimulationRun }) {
  const [logs, setLogs] = useState<RunLogFile[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [expired, setExpired] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)

  const startedAt = new Date(run.started_at)
  const completedAt = run.completed_at ? new Date(run.completed_at) : null
  const durationMs = completedAt ? completedAt.getTime() - startedAt.getTime() : null
  const durationStr = durationMs
    ? durationMs < 60000
      ? `${Math.round(durationMs / 1000)}s`
      : `${Math.round(durationMs / 60000)}m`
    : run.status === 'running'
    ? '(running)'
    : '—'

  async function fetchLogs() {
    setLoading(true)
    try {
      const data = await simulationApi.getRunLogs(run.id)
      setLogs(data.files)
    } catch (err: unknown) {
      const apiErr = err as { error?: { code?: string } }
      if (apiErr?.error?.code === 'LOGS_EXPIRED') setExpired(true)
    } finally {
      setLoading(false)
    }
  }

  function handleToggle() {
    if (!logsOpen && logs === null && !expired) fetchLogs()
    setLogsOpen(!logsOpen)
  }

  return (
    <>
      <tr>
        <td className="px-4 py-3 font-mono text-xs text-gray-500">{run.id}</td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <Badge variant={runStatusVariant(run.status)}>{run.status}</Badge>
            {run.error && <span className="text-xs text-red-500">{run.error}</span>}
          </div>
        </td>
        <td className="px-4 py-3">{run.hands_played}</td>
        <td className="px-4 py-3">
          {run.table_id ? (
            <Link
              href={`/admin/tables/${run.table_id}`}
              className="text-blue-600 hover:underline dark:text-blue-400 font-mono text-xs"
            >
              {run.table_id.slice(0, 8)}…
            </Link>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{startedAt.toLocaleString()}</td>
        <td className="px-4 py-3 text-gray-500">{durationStr}</td>
        <td className="px-4 py-3">
          <button
            onClick={handleToggle}
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            {logsOpen ? 'Hide Logs' : 'View Logs'}
          </button>
        </td>
      </tr>
      {logsOpen && (
        <tr>
          <td colSpan={7} className="max-w-0 overflow-hidden px-4 pb-4 pt-0">
            <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              {loading && <p className="p-3 text-xs text-gray-500">Loading logs...</p>}
              {expired && (
                <p className="p-3 text-xs italic text-gray-400">
                  Logs expired (rotated or container restarted).
                </p>
              )}
              {logs && logs.length === 0 && (
                <p className="p-3 text-xs italic text-gray-400">No log files found.</p>
              )}
              {logs &&
                logs.map((file) => (
                  <details key={file.name} className="border-b border-gray-200 last:border-0 dark:border-gray-700">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-mono text-gray-600 dark:text-gray-300 select-none hover:bg-gray-100 dark:hover:bg-gray-800">
                      {file.name} ({file.entries.length} entries)
                    </summary>
                    <pre className="max-h-80 w-full overflow-auto whitespace-pre-wrap break-all bg-white p-3 text-xs dark:bg-gray-950">
                      {file.entries.map((entry, i) => (
                        <div key={i} className="border-b border-gray-100 py-0.5 dark:border-gray-800">
                          {JSON.stringify(entry)}
                        </div>
                      ))}
                    </pre>
                  </details>
                ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function SimulationDetailPage() {
  const rawParams = useParams()
  const id = (rawParams?.id ?? '') as string
  const router = useRouter()

  const [sim, setSim] = useState<SimulationConfigWithRuns | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadSim()
    const interval = setInterval(loadSim, 5000)
    return () => clearInterval(interval)
  }, [id])

  async function loadSim() {
    try {
      const data = await simulationApi.getSimulation(id)
      setSim(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  async function handleStart() {
    setActionLoading(true)
    try {
      await simulationApi.startSimulation(id)
      await loadSim()
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } }
      alert(apiErr?.error?.message ?? 'Failed to start')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleStop() {
    if (!confirm('Stop the running simulation and pause this config?')) return
    setActionLoading(true)
    try {
      await simulationApi.stopSimulation(id)
      await loadSim()
    } finally {
      setActionLoading(false)
    }
  }

  async function handlePause() {
    setActionLoading(true)
    try {
      await simulationApi.updateSimulation(id, { status: 'paused' })
      await loadSim()
    } finally {
      setActionLoading(false)
    }
  }

  async function handleResume() {
    setActionLoading(true)
    try {
      await simulationApi.updateSimulation(id, { status: 'active' })
      await loadSim()
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDelete() {
    setActionLoading(true)
    try {
      await simulationApi.deleteSimulation(id)
      router.push('/admin/simulations')
    } finally {
      setActionLoading(false)
      setDeleteConfirm(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-500 p-6">Loading...</p>
  if (!sim) return <p className="text-sm text-red-500 p-6">Simulation not found.</p>

  const activeRunId = sim.active_run_id
  const isThisRunActive = activeRunId && sim.runs.some((r) => r.id === activeRunId && r.status === 'running')
  const isPeriodic = sim.schedule_type === 'periodic'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{sim.name}</h1>
            <Badge variant={sim.status === 'active' ? 'success' : 'default'}>{sim.status}</Badge>
          {isThisRunActive && (
            <Badge variant="warning">Running</Badge>
          )}
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {sim.agent_count} agents · {sim.max_hands} hands · max {sim.max_run_minutes}m/run ·{' '}
            {isPeriodic ? `Every ${sim.interval_minutes}m (cooldown ${sim.cooldown_minutes}m)` : 'One-off'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isThisRunActive && (
            <Button onClick={handleStart} disabled={actionLoading}>
              Start
            </Button>
          )}
          {isThisRunActive && (
            <Button variant="danger" onClick={handleStop} disabled={actionLoading}>
              Stop
            </Button>
          )}
          {isPeriodic && sim.status === 'active' && !isThisRunActive && (
            <Button variant="secondary" onClick={handlePause} disabled={actionLoading}>
              Pause
            </Button>
          )}
          {isPeriodic && sim.status === 'paused' && (
            <Button variant="secondary" onClick={handleResume} disabled={actionLoading}>
              Resume
            </Button>
          )}
        </div>
      </div>

      {/* Config details */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Configuration</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <span className="font-medium text-gray-600 dark:text-gray-400">Blinds:</span>{' '}
            {sim.table_config.blinds.small}/{sim.table_config.blinds.big}
          </div>
          <div>
            <span className="font-medium text-gray-600 dark:text-gray-400">Initial Stack:</span>{' '}
            {sim.table_config.initialStack}
          </div>
          <div>
            <span className="font-medium text-gray-600 dark:text-gray-400">Action Timeout:</span>{' '}
            {sim.table_config.actionTimeoutMs / 1000}s
          </div>
          <div>
            <span className="font-medium text-gray-600 dark:text-gray-400">Max Run Duration:</span>{' '}
            {sim.max_run_minutes}m
          </div>
          <div>
            <span className="font-medium text-gray-600 dark:text-gray-400">Bucket Key:</span>{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">{sim.bucket_key}</code>
          </div>
          <div className="col-span-2">
            <span className="font-medium text-gray-600 dark:text-gray-400">Agent Slots:</span>{' '}
            <span className="font-mono text-xs">
              {sim.agent_slots.map((s, i) => (
                <span key={i} className="mr-2 inline-block rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5">
                  {s.type}{s.model ? `:${s.model}` : ''}
                </span>
              ))}
            </span>
          </div>
        </div>
      </Card>

      {/* Run history */}
      <Card>
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">Run History</h2>
        </div>
        {sim.runs.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No runs yet. Click Start to run a simulation.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Run ID</th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Hands</th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Table</th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Started</th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Duration</th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Logs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sim.runs.map((run: SimulationRun) => (
                <RunRow key={run.id} run={run} />
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Danger zone */}
      <Card className="p-6 border border-red-200 dark:border-red-900">
        <h2 className="mb-3 text-lg font-semibold text-red-700 dark:text-red-400">Danger Zone</h2>
        {!deleteConfirm ? (
          <Button variant="danger" onClick={() => setDeleteConfirm(true)} disabled={actionLoading}>
            Delete Simulation
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-700 dark:text-red-400">
              This will delete the config and all run history. Are you sure?
            </p>
            <Button variant="danger" onClick={handleDelete} disabled={actionLoading}>
              {actionLoading ? 'Deleting...' : 'Yes, Delete'}
            </Button>
            <Button variant="secondary" onClick={() => setDeleteConfirm(false)}>
              Cancel
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
