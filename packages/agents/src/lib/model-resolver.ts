import type { LanguageModel } from 'ai'

/**
 * Parse a provider:model string (e.g. "openai:gpt-4.1") into an AI SDK LanguageModel.
 * Dynamically imports the provider package to avoid loading unused providers.
 */
export async function resolveModel(modelSpec: string): Promise<LanguageModel> {
  const [provider, ...rest] = modelSpec.split(':')
  const modelId = rest.join(':') // rejoin in case model name contains ':'

  if (!provider || !modelId)
    throw new Error(
      `Invalid model spec "${modelSpec}". Expected format: provider:model (e.g. openai:gpt-4.1)`,
    )

  switch (provider.toLowerCase()) {
    case 'openai': {
      const { openai } = await import('@ai-sdk/openai')
      return openai(modelId)
    }
    case 'anthropic': {
      const { anthropic } = await import('@ai-sdk/anthropic')
      return anthropic(modelId)
    }
    default:
      throw new Error(`Unsupported LLM provider: "${provider}". Supported: openai, anthropic`)
  }
}
