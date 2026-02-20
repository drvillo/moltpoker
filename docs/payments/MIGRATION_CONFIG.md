# Payment Configuration Migration Guide

## Overview

The payment configuration architecture has been refactored to better encapsulate adapter-specific details behind the factory pattern. This makes the API codebase adapter-agnostic and enables easier addition of new payment providers.

## What Changed

### Before

```typescript
// API config exposed all EVM-specific fields
config.evmChainId
config.evmRpcUrl
config.evmVaultAddress
config.evmUsdcContract
config.evmSettlerPrivateKey
// etc.

// API code directly assembled EVM config
paymentAdapter = createPaymentAdapter('evm_vault', {
  chainId: config.evmChainId,
  rpcUrl: config.evmRpcUrl,
  vaultAddress: config.evmVaultAddress,
  // ... all EVM fields
});

// API validation hardcoded EVM rules
if (!config.evmRpcUrl) {
  errors.push('EVM_RPC_URL is required');
}
```

### After

```typescript
// API config only exposes generic payment fields
config.realMoneyEnabled
config.paymentAdapter
config.depositTimeoutMs
config.paymentEventSyncIntervalMs

// Factory handles adapter-specific config resolution from env
paymentAdapter = createPaymentAdapter('evm_vault');
// or with optional overrides:
paymentAdapter = createPaymentAdapter('evm_vault', { chainId: 8453 });

// Validation delegated to payments package
const validation = validateAdapterConfig('evm_vault');
```

## Architecture Changes

### Payments Package (`packages/payments`)

**New files:**
- `src/validation.ts` - Adapter-specific validation logic
  - `validateEvmVaultConfig()` - Validates EVM adapter config
  - `getNetworkName()` - Chain ID to network name mapping

**Updated files:**
- `src/types.ts` - Introduced adapter-scoped config types:
  - `EvmVaultAdapterConfig` - EVM-specific config interface
  - `PaymentAdapterConfig` - Deprecated alias for backward compatibility
  - `AdapterConfig` - Discriminated union for all adapter types
  - `AdapterConfigOverrides<T>` - Type-safe partial configs

- `src/factory.ts` - Enhanced factory with validation:
  - `createPaymentAdapter(type, overrides?)` - Simplified signature
  - `validateAdapterConfig(type, overrides?)` - Pre-flight validation
  - Factory now validates config before instantiation
  - Throws descriptive errors on invalid config

- `src/adapters/evm-vault.ts` - Uses `EvmVaultAdapterConfig` type

- `src/index.ts` - Exports validation module

### API App (`apps/api`)

**Updated files:**
- `src/config.ts`:
  - Added generic payment config: `paymentEventSyncIntervalMs`
  - Marked EVM fields as `@deprecated`
  - Fields kept for backward compatibility but not used by API code

- `src/config/validation.ts`:
  - Simplified to API-level checks only (deposit timeout, adapter type recognition)
  - Delegates all adapter-specific validation to `validateAdapterConfig()` from payments package
  - Removed `getNetworkName()` (moved to payments package)
  - Removed sync interval validation (adapter concern, not API concern)

- `src/payments/paymentService.ts`:
  - `initializePaymentAdapter()` no longer passes EVM config
  - `createDepositForTable()` extracts metadata from adapter instructions
  - Decoupled from EVM-specific config fields

- `src/payments/eventListener.ts`:
  - Uses `config.paymentEventSyncIntervalMs` instead of `config.evmEventSyncIntervalMs`

- `src/index.ts`:
  - Removed EVM-specific logging (chain, vault, USDC addresses)
  - Generic adapter-agnostic logging

## Migration Steps

### For Existing Deployments

1. **Update environment variables** (required):
   ```bash
   # Add generic config (replaces EVM_EVENT_SYNC_INTERVAL_MS in API config)
   PAYMENT_EVENT_SYNC_INTERVAL_MS=5000
   ```

2. **Remove code references**:
   - The API no longer exposes `config.evm*` fields
   - If you have custom code accessing these fields, it will fail to compile
   - Refactor to use the payments adapter interface instead
   - Extract metadata from adapter methods (e.g., `createDepositInstructions()`)

3. **Environment variables still required**:
   - All `EVM_*` variables must still be set
   - They're read by the payments package, not the API
   - No changes to `.env` file values needed, just update code references

### For New Adapters

To add a new payment adapter (e.g., Stripe, Lightning):

1. **Define adapter config type** in `packages/payments/src/types.ts`:
   ```typescript
   export interface StripeAdapterConfig {
     apiKey: string;
     webhookSecret: string;
     // ...
   }
   
   export type AdapterConfig = 
     | { type: 'evm_vault'; config: EvmVaultAdapterConfig }
     | { type: 'stripe'; config: StripeAdapterConfig };
   ```

2. **Create adapter class** implementing `PaymentAdapter` interface

3. **Add validation** in `packages/payments/src/validation.ts`:
   ```typescript
   export function validateStripeConfig(config: Partial<StripeAdapterConfig>): ValidationResult {
     // validation logic
   }
   ```

4. **Register in factory** in `packages/payments/src/factory.ts`:
   ```typescript
   case 'stripe': {
     const envConfig = getStripeConfigFromEnv();
     const merged = { ...envConfig, ...overrides };
     const validation = validateStripeConfig(merged);
     if (!validation.valid) {
       throw new Error(`Invalid Stripe config: ${validation.errors.join('\n')}`);
     }
     return new StripeAdapter(merged);
   }
   ```

5. **No API code changes required** - adapter is automatically available

## Configuration Changes

### Removed Fields

The following fields have been **removed** from `apps/api/src/config.ts`:

- `evmChainId`
- `evmRpcUrl`
- `evmUsdcContract`
- `evmVaultAddress`
- `evmSettlerPrivateKey`
- `evmStartBlock`
- `evmConfirmationsRequired`
- `evmEventSyncIntervalMs`

These fields are now exclusively managed by the payments package.

### Environment Variables

All `EVM_*` environment variables are still required but are **only** read by the payments package:
- Read by `packages/payments/src/env.ts`
- Used as default config by factory
- API code has no direct access to these values

**Important**: While the API no longer exposes these as config fields, the environment variables themselves must still be set for the EVM adapter to function.

## Design Benefits

### Clean Architecture

- **Factory Pattern**: Factory owns construction + configuration
- **Dependency Inversion**: API depends on abstractions, not implementations
- **Open/Closed Principle**: New adapters don't require API changes
- **Single Responsibility**: Each module owns its domain
- **Encapsulation**: Implementation details hidden behind interfaces

### Extensibility

- Adding new payment adapters requires no API code changes
- Adapter-specific validation is self-contained
- Type-safe config handling per adapter

### Maintainability

- No duplication of env parsing logic
- Single source of truth for adapter config
- Clear boundaries between layers
- Easier testing of adapters in isolation

## Troubleshooting

### "Failed to initialize payment adapter"

Check that all required env vars for your adapter are set:

```bash
# For EVM Vault adapter:
EVM_RPC_URL=http://127.0.0.1:8545
EVM_VAULT_ADDRESS=0x...
EVM_USDC_CONTRACT=0x...
EVM_SETTLER_PRIVATE_KEY=0x...
```

### "Invalid EVM Vault adapter config"

Run validation explicitly to see detailed errors:

```typescript
import { validateAdapterConfig } from '@moltpoker/payments';

const result = validateAdapterConfig('evm_vault');
console.log('Errors:', result.errors);
console.log('Warnings:', result.warnings);
```

### Migration Questions

If you encounter issues during migration, refer to:
- This migration guide
- `docs/payments/` documentation
- Payment adapter interface in `packages/payments/src/adapter.ts`
- Factory implementation in `packages/payments/src/factory.ts`

## Summary

The refactor achieves:
- ✅ Adapter-agnostic API codebase
- ✅ Encapsulated adapter configuration
- ✅ Centralized validation logic
- ✅ Complete separation of concerns
- ✅ Cleaner config surface (no legacy fields)
- ✅ Foundation for multi-adapter support
