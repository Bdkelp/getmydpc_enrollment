import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface FailedPayment {
  id: number;
  transactionId: string;
  amount: number;
  status: string;
  paymentMethod: string;
  failureReason: string;
  createdAt: string;
  updatedAt: string;
  member: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    customerNumber: string;
    monthlyPrice: number;
  };
  plan: {
    name: string;
    monthlyPrice: number;
  };
  commission: {
    amount: number | null;
    status: string;
  };
  canRetry: boolean;
  metadata: any;
}

export function useAgentFailedPaymentsQuery() {
  const { data: response, isLoading, refetch } = useQuery<{
    success: boolean;
    payments: FailedPayment[];
    total: number;
  }>({
    queryKey: ["/api/agent/failed-payments"],
    queryFn: () => apiRequest("/api/agent/failed-payments"),
  });

  const payments = response?.payments || [];

  return { payments, isLoading, refetch };
}
