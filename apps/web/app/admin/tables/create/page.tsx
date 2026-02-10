'use client';

import type { TableConfig } from '@moltpoker/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { adminApi } from '@/lib/api';

export default function CreateTablePage() {
  const router = useRouter();
  const [formData, setFormData] = useState<Partial<TableConfig> & { seed?: string }>({
    blinds: { small: 10, big: 20 },
    maxSeats: 6,
    minPlayersToStart: 2,
    initialStack: 1000,
    actionTimeoutMs: 30000,
    seed: '',
  });
  const [bucketKey, setBucketKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (formData.blinds && formData.blinds.big < formData.blinds.small) {
      setError('Big blind must be >= small blind');
      return;
    }
    if (formData.initialStack && formData.blinds && formData.initialStack <= formData.blinds.big) {
      setError('Initial stack must be > big blind');
      return;
    }
    if (formData.actionTimeoutMs && formData.actionTimeoutMs < 1000) {
      setError('Action timeout must be >= 1000ms');
      return;
    }

    setLoading(true);
    try {
      const result = await adminApi.createTable({
        config: formData as TableConfig,
        seed: formData.seed || undefined,
        bucket_key: bucketKey || undefined,
      });
      router.push(`/admin/tables/${result.id}`);
    } catch (err: unknown) {
      const apiError = err as { error?: { message?: string } };
      setError(apiError.error?.message || 'Failed to create table');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold">Create Table</h1>
      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="smallBlind" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Small Blind
              </label>
              <Input
                id="smallBlind"
                type="number"
                min="1"
                value={formData.blinds?.small || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    blinds: { ...formData.blinds!, small: parseInt(e.target.value, 10) },
                  })
                }
                required
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="bigBlind" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Big Blind
              </label>
              <Input
                id="bigBlind"
                type="number"
                min="1"
                value={formData.blinds?.big || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    blinds: { ...formData.blinds!, big: parseInt(e.target.value, 10) },
                  })
                }
                required
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="maxSeats" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Max Seats
              </label>
              <Select
                id="maxSeats"
                value={formData.maxSeats}
                onChange={(e) =>
                  setFormData({ ...formData, maxSeats: parseInt(e.target.value, 10) })
                }
                required
                className="mt-1"
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="minPlayersToStart" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Min Players to Start
              </label>
              <Select
                id="minPlayersToStart"
                value={formData.minPlayersToStart}
                onChange={(e) =>
                  setFormData({ ...formData, minPlayersToStart: parseInt(e.target.value, 10) })
                }
                required
                className="mt-1"
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label htmlFor="initialStack" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Initial Stack
            </label>
            <Input
              id="initialStack"
              type="number"
              min="1"
              value={formData.initialStack || ''}
              onChange={(e) =>
                setFormData({ ...formData, initialStack: parseInt(e.target.value, 10) })
              }
              required
              className="mt-1"
            />
          </div>

          <div>
            <label htmlFor="actionTimeoutMs" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Action Timeout (ms)
            </label>
            <Input
              id="actionTimeoutMs"
              type="number"
              min="1000"
              value={formData.actionTimeoutMs || ''}
              onChange={(e) =>
                setFormData({ ...formData, actionTimeoutMs: parseInt(e.target.value, 10) })
              }
              required
              className="mt-1"
            />
          </div>

          <div>
            <label htmlFor="seed" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Seed (optional)
            </label>
            <Input
              id="seed"
              type="text"
              value={formData.seed || ''}
              onChange={(e) => setFormData({ ...formData, seed: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <label htmlFor="bucketKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Bucket Key (optional)
            </label>
            <Input
              id="bucketKey"
              type="text"
              placeholder="default"
              value={bucketKey}
              onChange={(e) => setBucketKey(e.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Tables in the same bucket share a lobby. Leave empty for &quot;default&quot;.
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-4">
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Table'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
