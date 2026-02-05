'use client';

import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { adminApi } from '@/lib/api';

interface Agent {
  agent_id: string;
  name: string | null;
  created_at: string;
  last_seen_at: string | null;
  status: 'connected' | 'disconnected';
  current_table_id: string | null;
  current_seat_id: number | null;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadAgents() {
    try {
      const data = await adminApi.listAgents();
      setAgents(data.agents);
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleKick(agentId: string) {
    if (!confirm('Are you sure you want to kick this agent?')) return;
    try {
      await adminApi.kickAgent(agentId);
      await loadAgents();
    } catch (err) {
      console.error('Failed to kick agent:', err);
    }
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold">Agents</h1>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Agent ID</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Current Table</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Last Seen</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.agent_id} className="border-b">
                  <td className="px-4 py-3 font-mono text-sm">{agent.agent_id}</td>
                  <td className="px-4 py-3">{agent.name || '-'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={agent.status === 'connected' ? 'success' : 'default'}>
                      {agent.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {agent.current_table_id ? (
                      <a
                        href={`/admin/tables/${agent.current_table_id}`}
                        className="text-primary hover:underline"
                      >
                        {agent.current_table_id}
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {agent.last_seen_at
                      ? new Date(agent.last_seen_at).toLocaleString()
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {agent.current_table_id && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleKick(agent.agent_id)}
                      >
                        Kick
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
