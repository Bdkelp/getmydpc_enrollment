import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { hasAtLeastRole } from "@/lib/roles";

export type JsonRecord = Record<string, any>;

export interface CertificationRequestBody extends JsonRecord {
  form?: JsonRecord;
  rawFields?: JsonRecord;
  raw?: string;
  authGuid?: string;
  authGuidVisibility?: string;
}

export interface CertificationResponseBody extends JsonRecord {
  fields?: JsonRecord;
  raw?: string;
}

export interface CertificationRequestInfo extends JsonRecord {
  body?: CertificationRequestBody;
}

export interface CertificationResponseInfo extends JsonRecord {
  body?: CertificationResponseBody;
}

export interface CertificationLogEntry {
  transactionId?: string;
  customerId?: string;
  purpose?: string;
  amount?: number;
  environment?: string;
  timestamp?: string;
  fileName?: string;
  metadata?: Record<string, any>;
  request?: CertificationRequestInfo;
  response?: CertificationResponseInfo;
}

export interface CertificationLogResponse {
  success: boolean;
  entries: CertificationLogEntry[];
  totalEntries: number;
  limit: number;
  sources?: {
    certificationFiles?: number;
    runtimeEPX?: number;
    includeRuntimeLogs?: boolean;
  };
}

export interface CertificationExportResponse {
  success: boolean;
  fileName: string;
  filePath: string;
  totalEntries: number;
  entries: CertificationLogEntry[];
}

export interface CertificationPayment {
  id: number;
  memberId?: number | null;
  planName?: string | null;
  amount?: number | string | null;
  status?: string | null;
  createdAt?: string | null;
  transactionId?: string | null;
  epxAuthGuid?: string | null;
  environment?: string | null;
  metadata?: Record<string, any> | null;
  member?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    customerNumber?: string | null;
  } | null;
}

export interface CertificationPaymentsResponse {
  success: boolean;
  payments: CertificationPayment[];
  limit: number;
  status?: string;
}

export function useEpxCertificationQueries(logsLimit: number, paymentsLimit: number) {
  const { user, isAuthenticated } = useAuth();
  const isAdmin = hasAtLeastRole(user?.role, "admin");
  const isSuperAdmin = hasAtLeastRole(user?.role, "super_admin");

  const authGuidQuery = useQuery({
    queryKey: ["epx-auth-guid"],
    enabled: isAuthenticated && isAdmin,
    queryFn: () => apiClient.get("/api/epx/certification/auth-guid"),
  });

  const logsQuery = useQuery<CertificationLogResponse>({
    queryKey: ["epx-cert-logs", logsLimit],
    enabled: isAuthenticated && isSuperAdmin,
    queryFn: () =>
      apiClient.get(`/api/epx/certification/logs?limit=${logsLimit}&includeRuntimeLogs=true`) as Promise<CertificationLogResponse>,
  });

  const paymentsQuery = useQuery<CertificationPaymentsResponse>({
    queryKey: ["epx-cert-payments", paymentsLimit],
    enabled: isAuthenticated && isAdmin,
    queryFn: () =>
      apiClient.get(`/api/epx/certification/payments?limit=${paymentsLimit}`) as Promise<CertificationPaymentsResponse>,
  });

  return { authGuidQuery, logsQuery, paymentsQuery };
}
