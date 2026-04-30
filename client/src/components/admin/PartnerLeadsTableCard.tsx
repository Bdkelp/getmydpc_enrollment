import React from "react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

// ── Types ──────────────────────────────────────────────────────────────────
type PartnerLeadStatus = "new" | "contacted" | "qualified" | "enrolled" | "closed_lost";
type PartnerLeadStatusFilter = PartnerLeadStatus | "all";

interface PartnerLeadAdminNote {
  id: string;
  message: string;
  createdAt: string;
  createdBy?: string | null;
}

export interface PartnerLeadRecord {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message?: string | null;
  status: string;
  agencyName: string;
  agencyWebsite?: string | null;
  statesServed?: string | null;
  experienceLevel?: string | null;
  volumeEstimate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  adminNotes?: PartnerLeadAdminNote[];
}

// ── Module-level constants ─────────────────────────────────────────────────
const PARTNER_LEAD_STATUS_OPTIONS: { value: PartnerLeadStatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "enrolled", label: "Enrolled" },
  { value: "closed_lost", label: "Closed - Lost" },
];

const PARTNER_LEAD_STATUS_LABELS: Record<PartnerLeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  enrolled: "Enrolled",
  closed_lost: "Closed - Lost",
};

const PARTNER_LEAD_STATUS_BADGE_CLASSES: Record<PartnerLeadStatus, string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-amber-100 text-amber-700",
  qualified: "bg-sky-100 text-sky-700",
  enrolled: "bg-emerald-100 text-emerald-700",
  closed_lost: "bg-gray-200 text-gray-700",
};

const PARTNER_LEAD_STATUS_VALUES: PartnerLeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "enrolled",
  "closed_lost",
];

const isPartnerLeadStatus = (value: string): value is PartnerLeadStatus =>
  PARTNER_LEAD_STATUS_VALUES.includes(value as PartnerLeadStatus);

const getPartnerLeadStatusMeta = (status: string) => {
  if (isPartnerLeadStatus(status)) {
    return {
      label: PARTNER_LEAD_STATUS_LABELS[status],
      badgeClass: PARTNER_LEAD_STATUS_BADGE_CLASSES[status],
    };
  }
  return { label: status || "Unknown", badgeClass: "bg-gray-200 text-gray-700" };
};

const formatExperienceLabel = (value?: string | null) => {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatVolumeEstimate = (value?: string | null) => {
  if (!value) return "—";
  switch (value) {
    case "under-50": return "Under 50 members";
    case "50-150":   return "50 – 150 members";
    case "150-400":  return "150 – 400 members";
    case "400-plus": return "400+ members";
    default:         return value.replace(/-/g, " ");
  }
};

// ── Component ──────────────────────────────────────────────────────────────
interface PartnerLeadsTableCardProps {
  partnerLeads: PartnerLeadRecord[];
  partnerLeadCount: number;
  partnerLeadsLoading: boolean;
  partnerLeadFilter: PartnerLeadStatusFilter;
  setPartnerLeadFilter: (value: PartnerLeadStatusFilter) => void;
  openPartnerLeadDialog: (lead: PartnerLeadRecord) => void;
}

export const PartnerLeadsTableCard: React.FC<PartnerLeadsTableCardProps> = ({
  partnerLeads,
  partnerLeadCount,
  partnerLeadsLoading,
  partnerLeadFilter,
  setPartnerLeadFilter,
  openPartnerLeadDialog,
}) => {
  const emptyCopy =
    partnerLeadFilter !== "all"
      ? `No partner leads with status ${
          isPartnerLeadStatus(partnerLeadFilter)
            ? PARTNER_LEAD_STATUS_LABELS[partnerLeadFilter]
            : partnerLeadFilter
        }.`
      : "No partner leads have been submitted yet.";

  return (
    <Card className="mb-8 border border-cyan-200 bg-white">
      <CardContent className="p-6 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Partner Leads</h2>
            <p className="text-sm text-gray-600">
              Review inbound agency partners from the public "Partner with us" form and leave follow-up notes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-cyan-100 text-cyan-800 border-none font-semibold">
              {partnerLeadCount} lead{partnerLeadCount === 1 ? "" : "s"}
            </Badge>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status filter</span>
              <Select
                value={partnerLeadFilter}
                onValueChange={(value) => setPartnerLeadFilter(value as PartnerLeadStatusFilter)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  {PARTNER_LEAD_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {partnerLeadsLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : partnerLeads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-cyan-200 bg-cyan-50 p-8 text-center text-sm text-cyan-900">
            {emptyCopy}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Agency</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Contact</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Markets &amp; Experience</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Last touch</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {partnerLeads.map((lead) => {
                  const statusMeta = getPartnerLeadStatusMeta(lead.status);
                  const createdLabel = lead.createdAt
                    ? formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })
                    : "—";
                  const latestNote =
                    lead.adminNotes && lead.adminNotes.length > 0
                      ? lead.adminNotes[lead.adminNotes.length - 1]
                      : null;

                  return (
                    <tr key={lead.id} className="bg-white">
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-gray-900">{lead.agencyName}</div>
                        {lead.agencyWebsite ? (
                          <a
                            href={lead.agencyWebsite}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-cyan-700 hover:underline"
                          >
                            {lead.agencyWebsite}
                          </a>
                        ) : (
                          <p className="text-xs text-gray-500">Website not provided</p>
                        )}
                        {lead.message && (
                          <p className="mt-1 text-xs text-gray-600 max-w-xs truncate">{lead.message}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-gray-900">
                          {lead.firstName} {lead.lastName}
                        </div>
                        <p className="text-xs text-gray-600">{lead.email}</p>
                        <p className="text-xs text-gray-600">{lead.phone || "—"}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-sm text-gray-900">{lead.statesServed || "—"}</div>
                        <p className="text-xs text-gray-600">
                          {formatExperienceLabel(lead.experienceLevel)} · {formatVolumeEstimate(lead.volumeEstimate)}
                        </p>
                        {latestNote && (
                          <p className="mt-1 text-xs text-gray-500 max-w-xs truncate">
                            Last note: {latestNote.message}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge className={`${statusMeta.badgeClass} border-none text-xs font-semibold`}>
                          {statusMeta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 align-top text-sm text-gray-600">{createdLabel}</td>
                      <td className="px-4 py-3 align-top text-right">
                        <Button variant="outline" size="sm" onClick={() => openPartnerLeadDialog(lead)}>
                          Update
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
