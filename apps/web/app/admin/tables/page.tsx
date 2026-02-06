'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { adminApi, type ApiError } from '@/lib/api';

interface Table {
  id: string;
  status: string;
  config: unknown;
  created_at: string;
}

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [endingTableId, setEndingTableId] = useState<string | null>(null);

  useEffect(() => {
    loadTables();
    const interval = setInterval(loadTables, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadTables() {
    try {
      const data = await adminApi.listTables();
      setTables(data);
    } catch (err) {
      console.error('Failed to load tables:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleEndTable(tableId: string) {
    if (!confirm('Are you sure you want to end this table? This action cannot be undone.')) {
      return;
    }

    setEndingTableId(tableId);
    try {
      await adminApi.stopTable(tableId);
      await loadTables();
    } catch (err) {
      const apiError = err as ApiError;
      alert(apiError.error?.message || 'Failed to end table');
    } finally {
      setEndingTableId(null);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'running':
        return <Badge variant="success">Running</Badge>;
      case 'waiting':
        return <Badge variant="warning">Waiting</Badge>;
      case 'ended':
        return <Badge variant="default">Ended</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Tables</h1>
        <Link href="/admin/tables/create">
          <Button>Create Table</Button>
        </Link>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b dark:border-gray-700">
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">ID</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Created</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((table) => (
                <tr key={table.id} className="border-b dark:border-gray-700">
                  <td className="px-4 py-3 font-mono text-sm">{table.id}</td>
                  <td className="px-4 py-3">{getStatusBadge(table.status)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {new Date(table.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/tables/${table.id}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                      {table.status !== 'ended' && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleEndTable(table.id)}
                          disabled={endingTableId === table.id}
                        >
                          {endingTableId === table.id ? 'Ending...' : 'End'}
                        </Button>
                      )}
                    </div>
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
