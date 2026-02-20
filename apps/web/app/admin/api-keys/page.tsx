'use client'

import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { apiKeysApi, type ProviderApiKeyMasked } from '@/lib/api'

const SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'google']

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ProviderApiKeyMasked[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [formProvider, setFormProvider] = useState('openai')
  const [formLabel, setFormLabel] = useState('')
  const [formApiKey, setFormApiKey] = useState('')

  useEffect(() => {
    loadKeys()
  }, [])

  async function loadKeys() {
    try {
      const data = await apiKeysApi.listKeys()
      setKeys(data.keys)
    } catch (err) {
      console.error('Failed to load API keys:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddKey(e: React.FormEvent) {
    e.preventDefault()
    if (!formLabel.trim() || !formApiKey.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await apiKeysApi.addKey({ provider: formProvider, label: formLabel.trim(), api_key: formApiKey.trim() })
      setShowForm(false)
      setFormLabel('')
      setFormApiKey('')
      setFormProvider('openai')
      await loadKeys()
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } }
      setError(apiErr?.error?.message ?? 'Failed to add key')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this API key? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await apiKeysApi.deleteKey(id)
      await loadKeys()
    } catch {
      // ignore
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">LLM Provider API Keys</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Keys are stored server-side and used by simulated LLM agents. Never exposed to the browser.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add Key'}
        </Button>
      </div>

      {showForm && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Add Provider API Key</h2>
          <form onSubmit={handleAddKey} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Provider</label>
              <select
                value={formProvider}
                onChange={(e) => setFormProvider(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              >
                {SUPPORTED_PROVIDERS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Label</label>
              <input
                type="text"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="e.g. Production OpenAI Key"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">API Key</label>
              <input
                type="password"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Key'}
              </Button>
              <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {loading ? (
          <p className="p-6 text-sm text-gray-500">Loading...</p>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">No API keys registered.</p>
            <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
              Add a key before running simulations with LLM-based agents (autonomous, protocol).
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Provider</th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Label</th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Key</th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Added</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-3">
                    <Badge>{k.provider}</Badge>
                  </td>
                  <td className="px-4 py-3">{k.label}</td>
                  <td className="px-4 py-3 font-mono text-gray-500">{k.masked_key}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(k.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={deletingId === k.id}
                      onClick={() => handleDelete(k.id)}
                    >
                      {deletingId === k.id ? 'Deleting...' : 'Delete'}
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
