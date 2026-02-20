'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { adminApi } from '@/lib/api';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalTables: 0,
    runningTables: 0,
    waitingTables: 0,
    totalAgents: 0,
    connectedAgents: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [{ tables }, agents] = await Promise.all([
          adminApi.listTables({ limit: 1000 }),
          adminApi.listAgents(),
        ]);

        const running = tables.filter((t) => t.status === 'running').length;
        const waiting = tables.filter((t) => t.status === 'waiting').length;
        const connected = agents.agents.filter((a) => a.status === 'connected').length;

        setStats({
          totalTables: tables.length,
          runningTables: running,
          waitingTables: waiting,
          totalAgents: agents.agents.length,
          connectedAgents: connected,
        });
      } catch (err) {
        console.error('Failed to load stats:', err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Link href="/admin/tables/create">
          <Button>Create Table</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Tables</h3>
          <p className="mt-2 text-3xl font-bold">{stats.totalTables}</p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Running Tables</h3>
          <p className="mt-2 text-3xl font-bold text-green-600 dark:text-green-400">
            {stats.runningTables}
          </p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Waiting Tables</h3>
          <p className="mt-2 text-3xl font-bold text-yellow-600 dark:text-yellow-400">
            {stats.waitingTables}
          </p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Connected Agents</h3>
          <p className="mt-2 text-3xl font-bold">
            {stats.connectedAgents} / {stats.totalAgents}
          </p>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-xl font-semibold">Quick Actions</h2>
        <div className="flex space-x-4">
          <Link href="/admin/tables">
            <Button variant="secondary">View All Tables</Button>
          </Link>
          <Link href="/admin/agents">
            <Button variant="secondary">View All Agents</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
