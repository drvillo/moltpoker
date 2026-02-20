'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { publicApi } from '@/lib/publicApi';

interface Table {
  id: string;
  status: string;
  config: unknown;
  created_at: string;
}

export default function WatchPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTables();
    const interval = setInterval(loadTables, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadTables() {
    try {
      const { tables } = await publicApi.listTables({ status: 'running' });
      setTables(tables);
    } catch (err) {
      console.error('Failed to load tables:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="mb-8 text-3xl font-bold">Watch Live Games</h1>
      {tables.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500">No running tables at the moment.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tables.map((table) => (
            <Card key={table.id}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-mono text-sm font-medium">{table.id}</h3>
                <Badge variant="success">Running</Badge>
              </div>
              <Link href={`/watch/${table.id}`}>
                <Button className="w-full">Watch</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
