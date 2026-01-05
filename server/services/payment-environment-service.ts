import { getPlatformSetting, upsertPlatformSetting } from '../storage';

export type PaymentEnvironment = 'sandbox' | 'production';

const normalizePaymentEnvironmentValue = (value?: string | null): PaymentEnvironment =>
  value === 'production' ? 'production' : 'sandbox';

class PaymentEnvironmentService {
  private cachedEnvironment: PaymentEnvironment;
  private lastSyncedAt = 0;
  private inflightLoad: Promise<PaymentEnvironment> | null = null;
  private readonly cacheTtlMs = 5_000; // keep in sync every 5 seconds

  constructor() {
    this.cachedEnvironment = normalizePaymentEnvironmentValue(process.env.EPX_ENVIRONMENT);
  }

  private async loadFromStore(): Promise<PaymentEnvironment> {
    try {
      const record = await getPlatformSetting<{ environment?: string }>('payment_environment');
      if (record?.value?.environment) {
        this.cachedEnvironment = normalizePaymentEnvironmentValue(record.value.environment);
      } else {
        await upsertPlatformSetting('payment_environment', { environment: this.cachedEnvironment });
      }
    } catch (error: any) {
      console.warn('[PaymentEnvironment] Unable to load setting from storage, using cached value:', error?.message || error);
    } finally {
      this.lastSyncedAt = Date.now();
    }

    return this.cachedEnvironment;
  }

  async getEnvironment(options?: { force?: boolean }): Promise<PaymentEnvironment> {
    const force = options?.force ?? false;
    const now = Date.now();
    const isFresh = now - this.lastSyncedAt < this.cacheTtlMs;

    if (!force && isFresh) {
      return this.cachedEnvironment;
    }

    if (!force && this.inflightLoad) {
      return this.inflightLoad;
    }

    const loader = this.loadFromStore();
    if (!force) {
      this.inflightLoad = loader.finally(() => {
        this.inflightLoad = null;
      }) as Promise<PaymentEnvironment>;
      return this.inflightLoad;
    }

    return loader;
  }

  getCachedEnvironment(): PaymentEnvironment {
    return this.cachedEnvironment;
  }

  async setEnvironment(nextEnvironment: PaymentEnvironment, updatedBy?: string): Promise<PaymentEnvironment> {
    const normalized = normalizePaymentEnvironmentValue(nextEnvironment);
    await upsertPlatformSetting('payment_environment', { environment: normalized }, updatedBy);
    this.cachedEnvironment = normalized;
    this.lastSyncedAt = Date.now();
    return this.cachedEnvironment;
  }
}

export const paymentEnvironment = new PaymentEnvironmentService();

export async function initializePaymentEnvironment(): Promise<PaymentEnvironment> {
  return paymentEnvironment.getEnvironment({ force: true });
}

export const normalizePaymentEnvironment = normalizePaymentEnvironmentValue;

export async function getPaymentEnvironmentDetails(): Promise<{
  environment: PaymentEnvironment;
  updatedAt: string | null;
  updatedBy: string | null;
}> {
  const record = await getPlatformSetting<{ environment?: string }>('payment_environment');
  const environment = record?.value?.environment
    ? normalizePaymentEnvironmentValue(record.value.environment)
    : await paymentEnvironment.getEnvironment();

  return {
    environment,
    updatedAt: record?.updatedAt ?? null,
    updatedBy: record?.updatedBy ?? null,
  };
}
