import React from "react";
import { Badge } from "@/components/ui/badge";

export function useEnrollmentFormatters() {
  const formatStatusLabel = (status: string) => {
    switch (status) {
      case "pending_activation":
        return "Pending Activation";
      case "pending":
        return "Pending";
      case "active":
        return "Active";
      case "cancelled":
        return "Cancelled";
      case "inactive":
        return "Inactive";
      case "suspended":
        return "Suspended";
      case "archived":
        return "Archived";
      default:
        return status || "Unknown";
    }
  };

  const getStatusBadge = (status: string) => {
    const label = formatStatusLabel(status);
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">{label}</Badge>;
      case "pending":
      case "pending_activation":
        return <Badge className="bg-yellow-100 text-yellow-800">{label}</Badge>;
      case "cancelled":
      case "inactive":
        return <Badge className="bg-red-100 text-red-800">{label}</Badge>;
      case "suspended":
        return <Badge className="bg-orange-100 text-orange-800">{label}</Badge>;
      case "archived":
        return <Badge className="bg-slate-200 text-slate-700">{label}</Badge>;
      default:
        return <Badge>{label}</Badge>;
    }
  };

  const getPaymentStatusBadge = (
    paymentStatus?: string | null,
    transactionId?: string | null,
  ) => {
    if (!paymentStatus) {
      return <Badge className="bg-gray-100 text-gray-600">No Payment</Badge>;
    }

    switch (paymentStatus.toLowerCase()) {
      case "succeeded":
      case "success":
        return (
          <Badge className="bg-green-100 text-green-800">
            {transactionId ? "Paid" : "Success"}
          </Badge>
        );
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case "failed":
      case "declined":
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      case "refunded":
        return <Badge className="bg-purple-100 text-purple-800">Refunded</Badge>;
      default:
        return <Badge>{paymentStatus}</Badge>;
    }
  };

  const formatCurrency = (value?: number | string | null) => {
    if (value === null || value === undefined) {
      return "$0.00";
    }
    const numeric = typeof value === "string" ? parseFloat(value) : value;
    if (!Number.isFinite(numeric)) {
      return "$0.00";
    }
    return `$${numeric.toFixed(2)}`;
  };

  const formatDob = (dob?: string | null) => {
    if (!dob) {
      return "Not provided";
    }
    const digits = dob.replace(/\D/g, "");
    if (digits.length !== 8) {
      return dob;
    }
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };

  return {
    formatStatusLabel,
    getStatusBadge,
    getPaymentStatusBadge,
    formatCurrency,
    formatDob,
  };
}
