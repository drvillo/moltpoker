'use client';

import type { TableConfig } from '@moltpoker/shared';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ReplayViewer } from '@/components/replay/ReplayViewer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { adminApi } from '@/lib/api';
import { buildReplayData, type FinalStanding } from '@/lib/replayState';

interface TableDetail {
  id: string;
  status: 'waiting' | 'running' | 'ended';
  config: TableConfig;
  seats: Array<{
    seat_id: number;
    agent_id: string | null;
    agent_name: string | null;
    stack: number;
    connected: boolean;
  }>;
  current_hand_number: number | null;
  created_at: string;
}

export default function TableDetailPage() {
  const params = useParams();
  const tableId = params.tableId as string;
  const [table, setTable] = useState<TableDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [finalStacks, setFinalStacks] = useState<FinalStanding[] | null>(null);
  const [finalStandingsLoading, setFinalStandingsLoading] = useState(false);

  const loadTable = useCallback(async () => {
    try {
      const data = await adminApi.getTable(tableId);
      setTable(data);
    } catch (err) {
      console.error('Failed to load table:', err);
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    loadTable();
    const interval = setInterval(loadTable, 5000);
    return () => clearInterval(interval);
  }, [loadTable]);

  useEffect(() => {
    if (!table || table.status !== 'ended') {
      setFinalStacks(null);
      return;
    }
    let cancelled = false;
    async function loadFinalStandings() {
      setFinalStandingsLoading(true);
      try {
        const { events } = await adminApi.getTableEvents(tableId, { limit: 10000 });
        const data = buildReplayData(tableId, events);
        if (!cancelled) setFinalStacks(data.finalStacks);
      } catch (err) {
        console.error('Failed to load final standings:', err);
        if (!cancelled) setFinalStacks([]);
      } finally {
        if (!cancelled) setFinalStandingsLoading(false);
      }
    }
    loadFinalStandings();
    return () => {
      cancelled = true;
    };
  }, [tableId, table?.status]);

  async function handleStart() {
    setActionLoading(true);
    try {
      await adminApi.startTable(tableId);
      await loadTable();
    } catch (err) {
      console.error('Failed to start table:', err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStop() {
    setActionLoading(true);
    try {
      await adminApi.stopTable(tableId);
      await loadTable();
    } catch (err) {
      console.error('Failed to stop table:', err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleExport() {
    try {
      const blob = await adminApi.exportTableEvents(tableId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `table-${tableId}-export.jsonl`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to export:', err);
    }
  }

  if (loading || !table) {
    return <div>Loading...</div>;
  }

  const canStart = table.status === 'waiting' && table.seats.filter((s) => s.agent_id).length >= 2;
  const canStop = table.status === 'running';

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Table {table.id}</h1>
          <Badge
            variant={
              table.status === 'running' ? 'success' : table.status === 'waiting' ? 'warning' : 'default'
            }
            className="mt-2"
          >
            {table.status}
          </Badge>
        </div>
        <div className="flex space-x-2">
          {canStart && (
            <Button onClick={handleStart} disabled={actionLoading}>
              Start Table
            </Button>
          )}
          {canStop && (
            <Button variant="danger" onClick={handleStop} disabled={actionLoading}>
              Stop Table
            </Button>
          )}
          <Button variant="secondary" onClick={handleExport}>
            Download Log
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-xl font-semibold">Configuration</h2>
          <dl className="space-y-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Blinds</dt>
              <dd className="text-sm">
                {table.config.blinds.small} / {table.config.blinds.big}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Max Seats</dt>
              <dd className="text-sm">{table.config.maxSeats}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Initial Stack</dt>
              <dd className="text-sm">{table.config.initialStack}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Action Timeout</dt>
              <dd className="text-sm">{table.config.actionTimeoutMs}ms</dd>
            </div>
            {table.current_hand_number !== null && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Current Hand</dt>
                <dd className="text-sm">#{table.current_hand_number}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card>
          <h2 className="mb-4 text-xl font-semibold">Final Standings</h2>
          {table.status !== 'ended' && (
            <p className="text-sm text-gray-500">
              Final standings will appear when the game ends.
            </p>
          )}
          {table.status === 'ended' && finalStandingsLoading && (
            <p className="text-sm text-gray-500">Loading final standings...</p>
          )}
          {table.status === 'ended' && !finalStandingsLoading && (!finalStacks || finalStacks.length === 0) && (
            <p className="text-sm text-gray-500">No final standings.</p>
          )}
          {table.status === 'ended' && !finalStandingsLoading && finalStacks && finalStacks.length > 0 && (
            <div className="space-y-2">
              {finalStacks.map((standing, i) => {
                const agentName =
                  standing.agentName ??
                  table.seats.find((s) => s.seat_id === standing.seatId)?.agent_name ??
                  table.seats.find((s) => s.agent_id === standing.agentId)?.agent_name ??
                  null;
                return (
                  <div
                    key={standing.seatId}
                    className={`flex items-center justify-between p-2 rounded ${
                      i === 0 ? 'bg-yellow-50 border border-yellow-200' : ''
                    }`}
                  >
                    <div>
                      <span className="font-medium">
                        {i + 1}. Seat {standing.seatId}
                      </span>
                      {agentName && (
                        <div className="text-sm text-gray-600">{agentName}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-mono">{standing.stack}</div>
                      <div
                        className={`text-xs ${
                          standing.netChange > 0
                            ? 'text-green-600'
                            : standing.netChange < 0
                              ? 'text-red-600'
                              : 'text-gray-500'
                        }`}
                      >
                        {standing.netChange > 0 ? '+' : ''}
                        {standing.netChange}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Game Replay - shown when table has ended */}
      {table.status === 'ended' && (
        <div className="mt-8">
          <h2 className="mb-4 text-2xl font-semibold">Game Replay</h2>
          <ReplayViewer tableId={tableId} />
        </div>
      )}
    </div>
  );
}
