// App-local aliases over the generated contract types (components/contracts/ads-manager-api),
// consumed throughout pages/services via the @/types barrel per frontend-standards.
import type { components } from '@ads-manager/contract';

export type AccessibleAccount = components['schemas']['AccessibleAccount'];
export type ConnectedAccount = components['schemas']['ConnectedAccount'];
export type AccountStatus = components['schemas']['AccountStatus'];
export type ApiErrorCode = components['schemas']['Error']['code'];
