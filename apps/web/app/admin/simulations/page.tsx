'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { simulationApi, type SimulationConfigWithLatestRun } from '@/lib/api'

function statusBadgeVariant(status: string) {
  if (status === 'active') return 'success' as const
  return 'default' as const
}

function runStatusBadgeVariant(status: string) {
  if (status === 'running') return 'warning' as const
  if (status === 'completed') return 'success' as const
  return 'error' as const
}

export default function SimulationsPage() {
  const router = useRouter()
  const [simulations, setSimulations] = useState<SimulationConfigWithLatestRun[]>([])
  const [loading, setLoading] = useState(true)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    loadSimulations()
    const interval = setInterval(loadSimulations, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadSimulations() {
    try {
      const data = await simulationApi.listSimulations()
      setSimulations(data.simulations)
    } catch (err) {
      console.error('Failed to load simulations:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleEmergencyStop() {
    if (!confirm('Emergency Stop All: this will stop any running simulation and pause all periodic configs. Continue?')) return
    setStopping(true)
    try {
      await simulationApi.emergencyStop()
      await loadSimulations()
    } catch (err) {
      console.error('Emergency stop failed:', err)
    } finally {
      setStopping(false)
    }
  }

  const hasRunning = simulations.some((s) => s.is_running)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Simulations</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage bot game simulations to keep tables active.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="danger"
            disabled={stopping || !hasRunning}
            onClick={handleEmergencyStop}
          >
            {stopping ? 'Stopping...' : 'Emergency Stop All'}
          </Button>
          <Button onClick={() => router.push('/admin/simulations/create')}>
            New Simulation
          </Button>
        </div>
      </div>

      <Card>
        {loading ? (
          <p className="p-6 text-sm text-gray-500">Loading...</p>
        ) : simulations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">No simulations configured yet.</p>
            <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
              Create one to start running bot games.
            </p>
            <div className="mt-4">
              <Button onClick={() => router.push('/admin/simulations/create')}>
                New Simulation
              </Button>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Name</th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Schedule</th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Config</th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Latest Run</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {simulations.map((sim) => (
                <tr key={sim.id}>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/simulations/${sim.id}`} className="hover:underline">
                      {sim.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {sim.schedule_type === 'periodic'
                      ? `Every ${sim.interval_minutes}m`
                      : 'One-off'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {sim.agent_count} agents · {sim.max_hands} hands · {sim.max_run_minutes}m max
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusBadgeVariant(sim.status)}>{sim.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {sim.latest_run ? (
                      <div className="flex items-center gap-2">
                        <Badge variant={runStatusBadgeVariant(sim.latest_run.status)}>
                          {sim.latest_run.status}
                        </Badge>
                        <span className="text-gray-500">{sim.latest_run.hands_played} hands</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => router.push(`/admin/simulations/${sim.id}`)}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
