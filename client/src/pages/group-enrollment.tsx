import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { hasAtLeastRole } from "@/lib/roles";
import { apiRequest } from "@/lib/queryClient";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  Plus,
  Users,
  Layers,
  CheckCircle2,
  ArrowLeft,
  UserPlus,
  Pencil,
  Trash2,
  ClipboardCheck,
  Upload,
} from "lucide-react";

const payorMixOptions = [
  { value: "full", label: "Employer Pays All" },
  { value: "member", label: "Member Pays All" },
  { value: "fixed", label: "Fixed Dollar Split" },
  { value: "percentage", label: "Percentage Split" },
];

const preferredPaymentMethodOptions = [
  { value: "card", label: "Card" },
  { value: "ach", label: "ACH" },
];

const tierOptions = [
  { value: "member", label: "Member Only" },
  { value: "spouse", label: "Member + Spouse" },
  { value: "child", label: "Member + Child(ren)" },
  { value: "family", label: "Member + Family" },
];

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "registered", label: "Registered" },
];

const tierLabels: Record<string, string> = {
  member: "Member Only",
  spouse: "Member + Spouse",
  child: "Member + Child(ren)",
  family: "Member + Family",
};

type GroupRecord = {
  id: string;
  name: string;
  groupType?: string | null;
  payorType: string;
  discountCode?: string | null;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  hostedCheckoutLink?: string | null;
  hostedCheckoutStatus?: string | null;
  registrationCompletedAt?: string | null;
  metadata?: Record<string, any> | null;
  groupProfileComplete?: boolean;
};

type GroupProfile = {
  ein: string;
  responsiblePersonName: string;
  responsiblePersonEmail: string;
  responsiblePersonPhone: string;
  contactPersonName: string;
  contactPersonEmail: string;
  contactPersonPhone: string;
  payorMixMode: "full" | "member" | "fixed" | "percentage";
  employerFixedAmount: string;
  memberFixedAmount: string;
  employerPercentage: string;
  memberPercentage: string;
  preferredPaymentMethod: "card" | "ach";
  achRoutingNumber: string;
  achAccountNumber: string;
  achBankName: string;
  achAccountType: "checking" | "savings";
};

type GroupProfileContext = {
  profile: {
    ein: string | null;
    responsiblePerson: { name: string | null; email: string | null; phone: string | null };
    contactPerson: { name: string | null; email: string | null; phone: string | null };
    payorMix: {
      mode: "full" | "member" | "fixed" | "percentage";
      employerFixedAmount: string | null;
      memberFixedAmount: string | null;
      employerPercentage: number | null;
      memberPercentage: number | null;
    };
    preferredPaymentMethod: "card" | "ach" | null;
    achDetails: {
      routingNumber: string | null;
      accountNumber: string | null;
      bankName: string | null;
      accountType: string | null;
    };
  };
  isComplete: boolean;
  missingFields: string[];
};

type GroupDetailResponse = {
  data: GroupRecord;
  members?: GroupMemberRecord[];
  effectiveDateContext?: GroupEffectiveDateContext;
  groupProfileContext?: GroupProfileContext;
};

type GroupEffectiveDateContext = {
  availableEffectiveDates: string[];
  defaultEffectiveDate: string | null;
  selectedEffectiveDate: string | null;
  isOverride: boolean;
  overrideReason: string | null;
  canOverride: boolean;
};

type GroupMemberRecord = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  tier: string;
  status?: string | null;
  paymentStatus?: string | null;
  registeredAt?: string | null;
  payorType?: string | null;
  employerAmount?: string | null;
  memberAmount?: string | null;
  discountAmount?: string | null;
  totalAmount?: string | null;
};

type AgentOption = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  agentNumber?: string | null;
  isActive?: boolean;
};

type MemberFormState = {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  tier: string;
  payorType: string;
  status: string;
};

type DiscountValidationState = {
  code: string;
  isValid: boolean;
  message?: string;
  discountType?: string;
  durationType?: string;
};

type CensusImportRow = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
  tier: string;
  payorType?: string;
  status?: string;
  employerAmount?: string;
  memberAmount?: string;
  discountAmount?: string;
  totalAmount?: string;
};

type BulkImportFailedRow = {
  row: number;
  email?: string;
  reason: string;
  sourceRow?: CensusImportRow;
};

const defaultGroupProfileForm: GroupProfile = {
  ein: "",
  responsiblePersonName: "",
  responsiblePersonEmail: "",
  responsiblePersonPhone: "",
  contactPersonName: "",
  contactPersonEmail: "",
  contactPersonPhone: "",
  payorMixMode: "full",
  employerFixedAmount: "",
  memberFixedAmount: "",
  employerPercentage: "",
  memberPercentage: "",
  preferredPaymentMethod: "card",
  achRoutingNumber: "",
  achAccountNumber: "",
  achBankName: "",
  achAccountType: "checking",
};

const derivePayorTypeFromMode = (mode: GroupProfile["payorMixMode"]): string => {
  if (mode === "full") return "full";
  if (mode === "member") return "member";
  return "mixed";
};

const mapGroupProfileContextToForm = (ctx?: GroupProfileContext): GroupProfile => {
  if (!ctx?.profile) return { ...defaultGroupProfileForm };
  return {
    ein: ctx.profile.ein || "",
    responsiblePersonName: ctx.profile.responsiblePerson?.name || "",
    responsiblePersonEmail: ctx.profile.responsiblePerson?.email || "",
    responsiblePersonPhone: ctx.profile.responsiblePerson?.phone || "",
    contactPersonName: ctx.profile.contactPerson?.name || "",
    contactPersonEmail: ctx.profile.contactPerson?.email || "",
    contactPersonPhone: ctx.profile.contactPerson?.phone || "",
    payorMixMode: ctx.profile.payorMix?.mode || "full",
    employerFixedAmount: ctx.profile.payorMix?.employerFixedAmount || "",
    memberFixedAmount: ctx.profile.payorMix?.memberFixedAmount || "",
    employerPercentage:
      ctx.profile.payorMix?.employerPercentage === null || ctx.profile.payorMix?.employerPercentage === undefined
        ? ""
        : String(ctx.profile.payorMix.employerPercentage),
    memberPercentage:
      ctx.profile.payorMix?.memberPercentage === null || ctx.profile.payorMix?.memberPercentage === undefined
        ? ""
        : String(ctx.profile.payorMix.memberPercentage),
    preferredPaymentMethod: ctx.profile.preferredPaymentMethod || "card",
    achRoutingNumber: ctx.profile.achDetails?.routingNumber || "",
    achAccountNumber: ctx.profile.achDetails?.accountNumber || "",
    achBankName: ctx.profile.achDetails?.bankName || "",
    achAccountType: (ctx.profile.achDetails?.accountType as "checking" | "savings") || "checking",
  };
};

const buildGroupProfilePayload = (form: GroupProfile) => ({
  ein: form.ein,
  responsiblePerson: {
    name: form.responsiblePersonName,
    email: form.responsiblePersonEmail,
    phone: form.responsiblePersonPhone,
  },
  contactPerson: {
    name: form.contactPersonName,
    email: form.contactPersonEmail,
    phone: form.contactPersonPhone,
  },
  payorMix: {
    mode: form.payorMixMode,
    employerFixedAmount: form.employerFixedAmount,
    memberFixedAmount: form.memberFixedAmount,
    employerPercentage: form.employerPercentage,
    memberPercentage: form.memberPercentage,
  },
  preferredPaymentMethod: form.preferredPaymentMethod,
  achDetails: {
    routingNumber: form.achRoutingNumber,
    accountNumber: form.achAccountNumber,
    bankName: form.achBankName,
    accountType: form.achAccountType,
  },
});

const getAssignedAgentIdFromMetadata = (metadata?: Record<string, any> | null): string => {
  const assigned = metadata?.assignedAgentId;
  return typeof assigned === "string" ? assigned : "";
};

const normalizeHeader = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const parseCsvRows = (csvText: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
};

const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file);
  });

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });

const getRecordValue = (record: Record<string, unknown>, keys: string[]): string => {
  const entries = Object.entries(record);
  for (const key of keys) {
    const found = entries.find(([entryKey]) => normalizeHeader(entryKey) === normalizeHeader(key));
    if (found && found[1] !== undefined && found[1] !== null) {
      const value = String(found[1]).trim();
      if (value) {
        return value;
      }
    }
  }
  return "";
};

const mapRecordToCensusRow = (record: Record<string, unknown>): CensusImportRow => ({
  firstName: getRecordValue(record, ["firstName", "first_name", "firstname"]),
  lastName: getRecordValue(record, ["lastName", "last_name", "lastname"]),
  email: getRecordValue(record, ["email", "emailAddress", "email_address"]),
  phone: getRecordValue(record, ["phone", "phoneNumber", "phone_number"]),
  dateOfBirth: getRecordValue(record, ["dateOfBirth", "date_of_birth", "dob"]),
  tier: getRecordValue(record, ["tier", "memberType", "member_type"]) || "member",
  payorType: getRecordValue(record, ["payorType", "payor_type", "payor"]),
  status: getRecordValue(record, ["status"]),
  employerAmount: getRecordValue(record, ["employerAmount", "employer_amount"]),
  memberAmount: getRecordValue(record, ["memberAmount", "member_amount"]),
  discountAmount: getRecordValue(record, ["discountAmount", "discount_amount"]),
  totalAmount: getRecordValue(record, ["totalAmount", "total_amount"]),
});

const mapCsvTableToRows = (tableRows: string[][]): CensusImportRow[] => {
  if (tableRows.length < 2) {
    return [];
  }

  const headers = tableRows[0];
  return tableRows
    .slice(1)
    .map((cells) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        record[header] = cells[idx] || "";
      });
      return mapRecordToCensusRow(record);
    })
    .filter((row) => row.firstName || row.lastName || row.email);
};

const escapeCsvCell = (value: unknown): string => {
  const raw = String(value ?? "");
  if (raw.includes('"') || raw.includes(",") || raw.includes("\n") || raw.includes("\r")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

const buildFailedRowsCsv = (failedRows: BulkImportFailedRow[]): string => {
  const headers = [
    "row",
    "reason",
    "email",
    "firstName",
    "lastName",
    "tier",
    "payorType",
    "status",
    "phone",
    "dateOfBirth",
    "employerAmount",
    "memberAmount",
    "discountAmount",
    "totalAmount",
  ];

  const lines = [headers.join(",")];
  for (const failed of failedRows) {
    const source = failed.sourceRow;
    lines.push(
      [
        failed.row,
        failed.reason,
        failed.email || source?.email || "",
        source?.firstName || "",
        source?.lastName || "",
        source?.tier || "",
        source?.payorType || "",
        source?.status || "",
        source?.phone || "",
        source?.dateOfBirth || "",
        source?.employerAmount || "",
        source?.memberAmount || "",
        source?.discountAmount || "",
        source?.totalAmount || "",
      ]
        .map(escapeCsvCell)
        .join(",")
    );
  }

  return lines.join("\n");
};

const buildFailedRowsFileName = (sourceFileName: string): string => {
  const baseName = sourceFileName.replace(/\.[^/.]+$/, "") || "group-census";
  const safeBase = baseName.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${safeBase || "group-census"}-failed-rows-${timestamp}.csv`;
};

export default function GroupEnrollment() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const isAuthorized = hasAtLeastRole(user?.role, "agent");
  const canAccessAdminViews = hasAtLeastRole(user?.role, "admin");
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newGroupForm, setNewGroupForm] = useState({
    name: "",
    groupType: "",
    discountCode: "",
  });
  const [newGroupAssignedAgentId, setNewGroupAssignedAgentId] = useState("");
  const [newGroupProfileForm, setNewGroupProfileForm] = useState<GroupProfile>({ ...defaultGroupProfileForm });
  const [groupProfileForm, setGroupProfileForm] = useState<GroupProfile>({ ...defaultGroupProfileForm });
  const [groupAssignedAgentId, setGroupAssignedAgentId] = useState("");
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<GroupMemberRecord | null>(null);
  const defaultMemberForm: MemberFormState = {
    firstName: "",
    lastName: "",
    email: "",
    tier: "member",
    payorType: "full",
    status: "draft",
  };
  const [memberForm, setMemberForm] = useState<MemberFormState>(defaultMemberForm);
  const [discountValidation, setDiscountValidation] = useState<DiscountValidationState | null>(null);
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);
  const [effectiveDateSelection, setEffectiveDateSelection] = useState<string>("");
  const [effectiveDateReason, setEffectiveDateReason] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState<CensusImportRow[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [lastImportSourceFileName, setLastImportSourceFileName] = useState("");
  const [lastImportFailedRows, setLastImportFailedRows] = useState<BulkImportFailedRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetMemberForm = (overrides?: Partial<MemberFormState>) => {
    setMemberForm({
      ...defaultMemberForm,
      payorType: selectedGroup?.data?.payorType === "member" ? "member" : "full",
      ...overrides,
    });
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/groups"],
    queryFn: async () => apiRequest("/api/groups"),
    enabled: !authLoading && isAuthorized,
  });

  const { data: agentsData } = useQuery({
    queryKey: ["/api/agents"],
    queryFn: async () => apiRequest("/api/agents"),
    enabled: !authLoading && isAuthorized && canAccessAdminViews,
    staleTime: 1000 * 60,
  });

  const groups: GroupRecord[] = useMemo(() => data?.data ?? [], [data]);
  const agentOptions: AgentOption[] = useMemo(() => {
    if (!Array.isArray(agentsData)) {
      return [];
    }

    return agentsData.filter((agent: AgentOption) => agent?.isActive !== false);
  }, [agentsData]);

  useEffect(() => {
    if (!isAuthorized && !authLoading) {
      toast({
        title: "Insufficient access",
        description: "Group enrollment is limited to agents and admins.",
        variant: "destructive",
      });
    }
  }, [isAuthorized, authLoading, toast]);

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const normalizedDiscount = newGroupForm.discountCode.trim().toUpperCase();
      const discountCode = normalizedDiscount || undefined;
      if (discountCode) {
        const lastValidationMatches =
          discountValidation &&
          discountValidation.isValid &&
          discountValidation.code === normalizedDiscount;
        if (!lastValidationMatches) {
          throw new Error("Validate the discount code before saving");
        }
      }

      const payload = {
        name: newGroupForm.name.trim(),
        groupType: newGroupForm.groupType.trim() || undefined,
        payorType: derivePayorTypeFromMode(newGroupProfileForm.payorMixMode),
        discountCode,
        groupProfile: buildGroupProfilePayload(newGroupProfileForm),
        assignedAgentId: canAccessAdminViews ? (newGroupAssignedAgentId || undefined) : undefined,
      };
      return apiRequest("/api/groups", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast({
        title: "Group created",
        description: "Group record saved. You can start adding members now.",
      });
      setNewGroupOpen(false);
      setNewGroupForm({ name: "", groupType: "", discountCode: "" });
      setNewGroupAssignedAgentId("");
      setNewGroupProfileForm({ ...defaultGroupProfileForm });
      setDiscountValidation(null);
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
    },
    onError: (err: any) => {
      toast({
        title: "Unable to create group",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const fetchGroupDetail = async (groupId: string) => {
    const response = await apiRequest(`/api/groups/${groupId}`);
    const typed = response as GroupDetailResponse;
    setSelectedGroup(typed);
    setImportFileName("");
    setImportRows([]);
    setImportWarnings([]);
    setLastImportSourceFileName("");
    setLastImportFailedRows([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setGroupAssignedAgentId(getAssignedAgentIdFromMetadata(typed.data?.metadata));
    setEffectiveDateSelection(typed.effectiveDateContext?.selectedEffectiveDate || "");
    setEffectiveDateReason(typed.effectiveDateContext?.overrideReason || "");
    setGroupProfileForm(mapGroupProfileContextToForm(typed.groupProfileContext));
    return typed;
  };

  const refreshGroups = () => queryClient.invalidateQueries({ queryKey: ["/api/groups"] });

  const parseCensusFile = async (file: File): Promise<CensusImportRow[]> => {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";

    if (extension === "csv") {
      const text = await readFileAsText(file);
      return mapCsvTableToRows(parseCsvRows(text));
    }

    if (extension === "xls" || extension === "xlsx") {
      const XLSX = (await import("xlsx")) as any;
      const buffer = await readFileAsArrayBuffer(file);
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return [];
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const records = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as Record<string, unknown>[];
      return records.map(mapRecordToCensusRow).filter((row) => row.firstName || row.lastName || row.email);
    }

    throw new Error("Unsupported file type. Use .csv, .xls, or .xlsx");
  };

  const setParsedImportRows = (fileName: string, parsedRows: CensusImportRow[]) => {
    const warnings: string[] = [];
    parsedRows.forEach((row, index) => {
      if (!row.firstName || !row.lastName || !row.email) {
        warnings.push(`Row ${index + 2} missing firstName, lastName, or email`);
      }
    });

    setImportFileName(fileName);
    setImportRows(parsedRows);
    setImportWarnings(warnings.slice(0, 5));
    setLastImportSourceFileName("");
    setLastImportFailedRows([]);
  };

  const handleCensusFile = async (file: File) => {
    try {
      const parsedRows = await parseCensusFile(file);
      if (parsedRows.length === 0) {
        throw new Error("No member rows found in file");
      }

      setParsedImportRows(file.name, parsedRows);
      toast({
        title: "Census file loaded",
        description: `${parsedRows.length} rows ready to import`,
      });
    } catch (err: any) {
      setImportFileName("");
      setImportRows([]);
      setImportWarnings([]);
      setLastImportSourceFileName("");
      setLastImportFailedRows([]);
      toast({
        title: "Unable to read file",
        description: err?.message || "Please check file format and try again",
        variant: "destructive",
      });
    }
  };

  const upsertMemberMutation = useMutation({
    mutationFn: async () => {
      const groupId = selectedGroup?.data?.id;
      if (!groupId) throw new Error("Select a group first");

      const payload = {
        firstName: memberForm.firstName.trim(),
        lastName: memberForm.lastName.trim(),
        email: memberForm.email.trim().toLowerCase(),
        tier: memberForm.tier,
        payorType: memberForm.payorType,
        status: memberForm.status,
      };

      if (editingMember) {
        return apiRequest(`/api/groups/${groupId}/members/${editingMember.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      return apiRequest(`/api/groups/${groupId}/members`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      setMemberDialogOpen(false);
      setEditingMember(null);
      resetMemberForm();
      toast({
        title: "Member saved",
        description: "The member record was updated.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Unable to save member",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (member: GroupMemberRecord) => {
      if (!selectedGroup?.data?.id) throw new Error("Select a group first");
      return apiRequest(`/api/groups/${selectedGroup.data.id}/members/${member.id}`, {
        method: "DELETE",
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      toast({
        title: "Member removed",
        description: "The member was removed from this group.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Unable to remove member",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const bulkImportMembersMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup?.data?.id) throw new Error("Select a group first");
      if (importRows.length === 0) throw new Error("Load a census file first");

      return apiRequest(`/api/groups/${selectedGroup.data.id}/members/bulk`, {
        method: "POST",
        body: JSON.stringify({ members: importRows }),
      });
    },
    onSuccess: async (result: any) => {
      const failedRows: BulkImportFailedRow[] = Array.isArray(result?.failed)
        ? result.failed.map((failed: any) => {
            const rowNumber = Number(failed?.row);
            const sourceIndex = Number.isFinite(rowNumber) ? Math.max(0, rowNumber - 2) : -1;
            return {
              row: Number.isFinite(rowNumber) ? rowNumber : 0,
              email: typeof failed?.email === "string" ? failed.email : undefined,
              reason: typeof failed?.reason === "string" ? failed.reason : "Failed to import row",
              sourceRow: sourceIndex >= 0 ? importRows[sourceIndex] : undefined,
            };
          })
        : [];

      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      const summary = result?.summary;
      setLastImportSourceFileName(importFileName || "group-census.csv");
      setLastImportFailedRows(failedRows);
      toast({
        title: "Census import complete",
        description:
          failedRows.length > 0
            ? `Created ${summary?.created ?? 0} of ${summary?.received ?? importRows.length} rows. ${failedRows.length} rows failed.`
            : `Created ${summary?.created ?? 0} of ${summary?.received ?? importRows.length} rows`,
        variant: summary?.failed ? "destructive" : undefined,
      });
      setImportFileName("");
      setImportRows([]);
      setImportWarnings([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    onError: (err: any) => {
      toast({
        title: "Census import failed",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleDownloadFailedRows = () => {
    if (lastImportFailedRows.length === 0) {
      toast({
        title: "No failed rows",
        description: "There are no failed rows to download.",
      });
      return;
    }

    const csv = buildFailedRowsCsv(lastImportFailedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildFailedRowsFileName(lastImportSourceFileName || "group-census.csv");
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const completeGroupMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup?.data?.id) throw new Error("Select a group first");
      return apiRequest(`/api/groups/${selectedGroup.data.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ status: "registered" }),
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      toast({
        title: "Marked ready",
        description: "Group registration marked ready for hosted checkout.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Unable to mark ready",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const updateEffectiveDateMutation = useMutation({
    mutationFn: async () => {
      const groupId = selectedGroup?.data?.id;
      if (!groupId) throw new Error("Select a group first");

      return apiRequest(`/api/groups/${groupId}/effective-date`, {
        method: "PATCH",
        body: JSON.stringify({
          selectedEffectiveDate: effectiveDateSelection || null,
          overrideReason: effectiveDateReason || null,
        }),
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      toast({
        title: "Effective date updated",
        description: "Group effective-date settings were saved.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Unable to update effective date",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const updateGroupProfileMutation = useMutation({
    mutationFn: async () => {
      const groupId = selectedGroup?.data?.id;
      if (!groupId) throw new Error("Select a group first");

      return apiRequest(`/api/groups/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify({
          payorType: derivePayorTypeFromMode(groupProfileForm.payorMixMode),
          groupProfile: buildGroupProfilePayload(groupProfileForm),
          assignedAgentId: canAccessAdminViews ? (groupAssignedAgentId || null) : undefined,
        }),
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      toast({
        title: "Group profile updated",
        description: "Saved EIN, contact, payor mix, and payment preference.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Unable to update group profile",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

    const handleValidateDiscount = async () => {
      const normalized = newGroupForm.discountCode.trim().toUpperCase();
      if (!normalized) {
        toast({
          title: "Enter a discount code",
          description: "Add a code before running validation.",
        });
        return;
      }

      setIsValidatingDiscount(true);
      try {
        const result = await apiRequest(`/api/discount-codes/validate?code=${encodeURIComponent(normalized)}`);
        const isValid = Boolean(result?.isValid);
        setDiscountValidation({
          code: normalized,
          isValid,
          message: result?.message,
          discountType: result?.discountType,
          durationType: result?.durationType,
        });
        toast({
          title: isValid ? "Discount applied" : "Discount not valid",
          description: result?.message || (isValid ? `Code ${normalized} is active.` : `Code ${normalized} cannot be used.`),
          variant: isValid ? undefined : "destructive",
        });
      } catch (err: any) {
        setDiscountValidation({ code: normalized, isValid: false, message: err?.message || "Unable to validate" });
        toast({
          title: "Unable to validate",
          description: err?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsValidatingDiscount(false);
      }
    };

  const handleMemberDialogToggle = (open: boolean) => {
    if (!open) {
      setMemberDialogOpen(false);
      setEditingMember(null);
      resetMemberForm();
      upsertMemberMutation.reset();
      return;
    }
    setMemberDialogOpen(true);
  };

  const handleViewGroup = async (groupId: string) => {
    setDetailLoading(true);
    try {
      await fetchGroupDetail(groupId);
      setDetailOpen(true);
    } catch (err: any) {
      toast({
        title: "Failed to load group",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAddMemberClick = () => {
    setEditingMember(null);
    resetMemberForm();
    setMemberDialogOpen(true);
  };

  const handleDropZoneDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      await handleCensusFile(file);
    }
  };

  const handleDropZoneSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await handleCensusFile(file);
    }
  };

  const handleEditMemberClick = (member: GroupMemberRecord) => {
    setEditingMember(member);
    resetMemberForm({
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      tier: member.tier,
      payorType: member.payorType || selectedGroup?.data?.payorType || "full",
      status: member.status || "draft",
    });
    setMemberDialogOpen(true);
  };

  const isMemberFormValid =
    memberForm.firstName.trim().length > 1 &&
    memberForm.lastName.trim().length > 1 &&
    memberForm.email.trim().length > 5;

  const memberDialogTitle = editingMember ? "Edit Group Member" : "Add Group Member";
  const memberDialogDescription = editingMember
    ? "Update this record before sending the hosted checkout link."
    : "Enter each enrollee before triggering hosted checkout.";
  const memberCount = selectedGroup?.members?.length ?? 0;
  const groupProfileContext = selectedGroup?.groupProfileContext;
  const profileComplete = Boolean(groupProfileContext?.isComplete);
  const canMarkReady = memberCount > 0 && profileComplete && selectedGroup?.data?.status !== "registered";
  const hostedStatusLabel = selectedGroup?.data?.status === "registered"
    ? "ready"
    : selectedGroup?.data?.hostedCheckoutStatus || "not-started";
  const hostedStatusBadgeClass = hostedStatusLabel === "ready"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : hostedStatusLabel === "in-progress"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-slate-50 text-slate-600 border-slate-200";
  const effectiveDateContext = selectedGroup?.effectiveDateContext;
  const selectedIsDefault =
    effectiveDateContext &&
    effectiveDateSelection &&
    effectiveDateSelection === effectiveDateContext.defaultEffectiveDate;
  const canSaveEffectiveDate = Boolean(
    effectiveDateContext?.canOverride &&
    effectiveDateSelection &&
    (selectedIsDefault || effectiveDateReason.trim().length >= 5)
  );
  const canRunBulkImport = importRows.length > 0 && !bulkImportMembersMutation.isPending;
  const canDownloadFailedRows = lastImportFailedRows.length > 0;
  const canCreateGroup = Boolean(
    newGroupForm.name.trim().length > 0 &&
    (!canAccessAdminViews || newGroupAssignedAgentId)
  );

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle>Access Restricted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              Only active agents, admins, and super admins can access the group enrollment workspace.
              Please switch accounts or contact a super admin for access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            {canAccessAdminViews && (
              <Button
                variant="ghost"
                onClick={() => setLocation("/admin")}
                className="w-fit px-0 text-sm text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin View
              </Button>
            )}
            <p className="text-sm text-gray-500 uppercase tracking-wide">Stage 1 Manual Workflow</p>
            <h1 className="text-3xl font-bold text-gray-900">Group Enrollment</h1>
            <p className="text-gray-600 mt-1">Create employer groups, review payor types, and track hosted checkout readiness.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/groups"] })}>
              Refresh
            </Button>
            <Button onClick={() => setNewGroupOpen(true)} className="bg-blue-600 text-white hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Enroll a Group
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load groups</AlertTitle>
            <AlertDescription>Check your connection and try again.</AlertDescription>
          </Alert>
        )}

        <section className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500 uppercase">Active Groups</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{groups.length}</p>
              <p className="text-sm text-gray-500">Groups staged for hosted checkout</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500 uppercase">Payor Mix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { value: 'full', label: 'Employer Pays All' },
                { value: 'member', label: 'Member Pays All' },
                { value: 'mixed', label: 'Mixed Split' },
              ].map((option) => {
                const count = groups.filter((g) => g.payorType === option.value).length;
                return (
                  <div key={option.value} className="flex items-center justify-between text-sm">
                    <span>{option.label}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500 uppercase">Next Step</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-gray-700">Capture group info, add members manually, then launch hosted checkout.</p>
              <Button variant="outline" onClick={() => setNewGroupOpen(true)} className="w-full">
                Start New Group
              </Button>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Group Pipeline</CardTitle>
                <p className="text-sm text-gray-500">Monitor each employer group before payment handoff.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Users className="h-10 w-10 mx-auto mb-4 text-gray-400" />
                <p>No groups created yet.</p>
                <p className="text-sm">Use the "Enroll a Group" button to start.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group</TableHead>
                      <TableHead>Payor Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell>
                          <div className="font-medium">{group.name}</div>
                          <div className="text-sm text-gray-500">{group.groupType || 'General'}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{group.payorType}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {group.status === 'registered' ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Layers className="h-4 w-4 text-amber-500" />
                            )}
                            <span className="capitalize">{group.status}</span>
                          </div>
                        </TableCell>
                        <TableCell>{group.discountCode || '—'}</TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {group.updatedAt ? formatDistanceToNow(new Date(group.updatedAt), { addSuffix: true }) : 'just now'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleViewGroup(group.id)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enroll a New Group</DialogTitle>
            <DialogDescription>Capture the basic employer information to begin manual registration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                placeholder="Acme Logistics"
                value={newGroupForm.name}
                onChange={(event) => setNewGroupForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="group-type">Group Type</Label>
              <Input
                id="group-type"
                placeholder="Industry or segment"
                value={newGroupForm.groupType}
                onChange={(event) => setNewGroupForm((prev) => ({ ...prev, groupType: event.target.value }))}
              />
            </div>
            {canAccessAdminViews && (
              <div>
                <Label>Assign to Agent of Record</Label>
                <Select
                  value={newGroupAssignedAgentId}
                  onValueChange={setNewGroupAssignedAgentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentOptions.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.agentNumber ? `${agent.agentNumber} - ` : ""}
                        {`${agent.firstName || ""} ${agent.lastName || ""}`.trim() || agent.email || agent.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!newGroupAssignedAgentId && (
                  <p className="text-xs text-amber-700 mt-1">Required for admin and super admin group creation.</p>
                )}
              </div>
            )}
            <div>
              <Label>Payor Mix</Label>
              <Select
                value={newGroupProfileForm.payorMixMode}
                onValueChange={(value) =>
                  setNewGroupProfileForm((prev) => ({
                    ...prev,
                    payorMixMode: value as GroupProfile['payorMixMode'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payor mix" />
                </SelectTrigger>
                <SelectContent>
                  {payorMixOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newGroupProfileForm.payorMixMode === "fixed" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="new-employer-fixed">Employer Amount ($)</Label>
                  <Input
                    id="new-employer-fixed"
                    value={newGroupProfileForm.employerFixedAmount}
                    onChange={(event) =>
                      setNewGroupProfileForm((prev) => ({ ...prev, employerFixedAmount: event.target.value }))
                    }
                    placeholder="100.00"
                  />
                </div>
                <div>
                  <Label htmlFor="new-member-fixed">Member Amount ($)</Label>
                  <Input
                    id="new-member-fixed"
                    value={newGroupProfileForm.memberFixedAmount}
                    onChange={(event) =>
                      setNewGroupProfileForm((prev) => ({ ...prev, memberFixedAmount: event.target.value }))
                    }
                    placeholder="25.00"
                  />
                </div>
              </div>
            )}
            {newGroupProfileForm.payorMixMode === "percentage" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="new-employer-percent">Employer Percentage (%)</Label>
                  <Input
                    id="new-employer-percent"
                    value={newGroupProfileForm.employerPercentage}
                    onChange={(event) =>
                      setNewGroupProfileForm((prev) => ({ ...prev, employerPercentage: event.target.value }))
                    }
                    placeholder="80"
                  />
                </div>
                <div>
                  <Label htmlFor="new-member-percent">Member Percentage (%)</Label>
                  <Input
                    id="new-member-percent"
                    value={newGroupProfileForm.memberPercentage}
                    onChange={(event) =>
                      setNewGroupProfileForm((prev) => ({ ...prev, memberPercentage: event.target.value }))
                    }
                    placeholder="20"
                  />
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="new-group-ein">EIN</Label>
              <Input
                id="new-group-ein"
                value={newGroupProfileForm.ein}
                onChange={(event) => setNewGroupProfileForm((prev) => ({ ...prev, ein: event.target.value }))}
                placeholder="12-3456789"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="new-responsible-name">Responsible Person Name</Label>
                <Input
                  id="new-responsible-name"
                  value={newGroupProfileForm.responsiblePersonName}
                  onChange={(event) =>
                    setNewGroupProfileForm((prev) => ({ ...prev, responsiblePersonName: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="new-responsible-email">Responsible Person Email</Label>
                <Input
                  id="new-responsible-email"
                  type="email"
                  value={newGroupProfileForm.responsiblePersonEmail}
                  onChange={(event) =>
                    setNewGroupProfileForm((prev) => ({ ...prev, responsiblePersonEmail: event.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="new-responsible-phone">Responsible Person Phone</Label>
              <Input
                id="new-responsible-phone"
                value={newGroupProfileForm.responsiblePersonPhone}
                onChange={(event) =>
                  setNewGroupProfileForm((prev) => ({ ...prev, responsiblePersonPhone: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="new-contact-name">Contact Person Name</Label>
                <Input
                  id="new-contact-name"
                  value={newGroupProfileForm.contactPersonName}
                  onChange={(event) =>
                    setNewGroupProfileForm((prev) => ({ ...prev, contactPersonName: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="new-contact-email">Contact Person Email</Label>
                <Input
                  id="new-contact-email"
                  type="email"
                  value={newGroupProfileForm.contactPersonEmail}
                  onChange={(event) =>
                    setNewGroupProfileForm((prev) => ({ ...prev, contactPersonEmail: event.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="new-contact-phone">Contact Person Phone</Label>
              <Input
                id="new-contact-phone"
                value={newGroupProfileForm.contactPersonPhone}
                onChange={(event) =>
                  setNewGroupProfileForm((prev) => ({ ...prev, contactPersonPhone: event.target.value }))
                }
              />
            </div>
            <div>
              <Label>Preferred Payment Method</Label>
              <Select
                value={newGroupProfileForm.preferredPaymentMethod}
                onValueChange={(value) =>
                  setNewGroupProfileForm((prev) => ({
                    ...prev,
                    preferredPaymentMethod: value as GroupProfile['preferredPaymentMethod'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {preferredPaymentMethodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newGroupProfileForm.preferredPaymentMethod === "ach" && (
              <div className="space-y-4 border rounded-md p-3 bg-slate-50">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="new-ach-routing">Routing Number</Label>
                    <Input
                      id="new-ach-routing"
                      value={newGroupProfileForm.achRoutingNumber}
                      onChange={(event) =>
                        setNewGroupProfileForm((prev) => ({ ...prev, achRoutingNumber: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-ach-account">Account Number</Label>
                    <Input
                      id="new-ach-account"
                      value={newGroupProfileForm.achAccountNumber}
                      onChange={(event) =>
                        setNewGroupProfileForm((prev) => ({ ...prev, achAccountNumber: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="new-ach-bank">Bank Name</Label>
                    <Input
                      id="new-ach-bank"
                      value={newGroupProfileForm.achBankName}
                      onChange={(event) =>
                        setNewGroupProfileForm((prev) => ({ ...prev, achBankName: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Account Type</Label>
                    <Select
                      value={newGroupProfileForm.achAccountType}
                      onValueChange={(value) =>
                        setNewGroupProfileForm((prev) => ({
                          ...prev,
                          achAccountType: value as GroupProfile['achAccountType'],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="discount-code">Discount Code (optional)</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="discount-code"
                  placeholder="WELCOME20"
                  value={newGroupForm.discountCode}
                  onChange={(event) => {
                    const value = event.target.value.toUpperCase();
                    setNewGroupForm((prev) => ({ ...prev, discountCode: value }));
                    setDiscountValidation(null);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleValidateDiscount}
                  disabled={!newGroupForm.discountCode.trim() || isValidatingDiscount}
                >
                  {isValidatingDiscount ? 'Checking...' : 'Validate'}
                </Button>
              </div>
              {discountValidation &&
                newGroupForm.discountCode.trim().toUpperCase() === discountValidation.code && (
                  <p className={`text-xs mt-1 ${discountValidation.isValid ? 'text-emerald-600' : 'text-red-600'}`}>
                    {discountValidation.message ||
                      (discountValidation.isValid ? 'Discount code is valid.' : 'Discount code is invalid.')}
                  </p>
                )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewGroupOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createGroupMutation.mutate()}
              disabled={!canCreateGroup || createGroupMutation.isPending}
            >
              {createGroupMutation.isPending ? 'Saving...' : 'Save Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedGroup?.data?.name || 'Group Details'}</DialogTitle>
            <DialogDescription>
              Manual member entry and hosted checkout prep live here. Use the API-backed flow to keep downtime low.
            </DialogDescription>
          </DialogHeader>
          {detailLoading || !selectedGroup ? (
            <div className="flex items-center justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Status</Label>
                  <p className="font-medium capitalize">{selectedGroup.data.status}</p>
                </div>
                <div>
                  <Label>Payor Type</Label>
                  <p className="font-medium capitalize">{selectedGroup.data.payorType}</p>
                </div>
                {canAccessAdminViews && (
                  <div>
                    <Label>Agent of Record</Label>
                    <Select value={groupAssignedAgentId} onValueChange={setGroupAssignedAgentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {agentOptions.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.agentNumber ? `${agent.agentNumber} - ` : ""}
                            {`${agent.firstName || ""} ${agent.lastName || ""}`.trim() || agent.email || agent.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Group Type</Label>
                  <p className="font-medium">{selectedGroup.data.groupType || 'General'}</p>
                </div>
                <div>
                  <Label>Discount Code</Label>
                  <p className="font-medium">{selectedGroup.data.discountCode || 'Not applied'}</p>
                </div>
              </div>

              {effectiveDateContext && (
                <div className="border rounded-lg p-4 bg-blue-50/40 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-slate-900">Effective Date</h3>
                    <Badge variant="outline" className="capitalize">
                      {effectiveDateContext.isOverride ? "manual override" : "default"}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">
                    Default active date: <span className="font-medium text-slate-900">{effectiveDateContext.defaultEffectiveDate || "—"}</span>
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Selected Effective Date</Label>
                      <Select
                        value={effectiveDateSelection}
                        onValueChange={setEffectiveDateSelection}
                        disabled={!effectiveDateContext.canOverride}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select effective date" />
                        </SelectTrigger>
                        <SelectContent>
                          {effectiveDateContext.availableEffectiveDates.map((dateValue, idx) => (
                            <SelectItem key={dateValue} value={dateValue}>
                              {dateValue} {idx === 0 ? "(default)" : idx === 2 ? "(3rd closest)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500 mt-1">Groups can be manually set up to the 3rd closest active date.</p>
                    </div>
                    <div>
                      <Label htmlFor="effective-date-reason">Override Reason</Label>
                      <Input
                        id="effective-date-reason"
                        placeholder="Optional for default, required for override"
                        value={effectiveDateReason}
                        onChange={(event) => setEffectiveDateReason(event.target.value)}
                        disabled={!effectiveDateContext.canOverride}
                      />
                      {!selectedIsDefault && effectiveDateContext.canOverride && (
                        <p className="text-xs text-slate-500 mt-1">At least 5 characters required when selecting a non-default date.</p>
                      )}
                    </div>
                  </div>
                  {effectiveDateContext.canOverride ? (
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        disabled={!canSaveEffectiveDate || updateEffectiveDateMutation.isPending}
                        onClick={() => updateEffectiveDateMutation.mutate()}
                      >
                        {updateEffectiveDateMutation.isPending ? "Saving..." : "Save Effective Date"}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Only admins and super admins can apply manual group effective-date overrides.</p>
                  )}
                </div>
              )}

              <div className="border rounded-lg p-4 bg-white space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">Group Profile</h3>
                  <Badge variant={groupProfileContext?.isComplete ? "default" : "secondary"}>
                    {groupProfileContext?.isComplete ? "Complete" : "Needs info"}
                  </Badge>
                </div>
                {!groupProfileContext?.isComplete && groupProfileContext?.missingFields?.length ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    Missing fields: {groupProfileContext.missingFields.join(", ")}
                  </p>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="detail-ein">EIN</Label>
                    <Input
                      id="detail-ein"
                      value={groupProfileForm.ein}
                      onChange={(event) => setGroupProfileForm((prev) => ({ ...prev, ein: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Payor Mix</Label>
                    <Select
                      value={groupProfileForm.payorMixMode}
                      onValueChange={(value) =>
                        setGroupProfileForm((prev) => ({
                          ...prev,
                          payorMixMode: value as GroupProfile['payorMixMode'],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select payor mix" />
                      </SelectTrigger>
                      <SelectContent>
                        {payorMixOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {groupProfileForm.payorMixMode === "fixed" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="detail-employer-fixed">Employer Amount ($)</Label>
                      <Input
                        id="detail-employer-fixed"
                        value={groupProfileForm.employerFixedAmount}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, employerFixedAmount: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="detail-member-fixed">Member Amount ($)</Label>
                      <Input
                        id="detail-member-fixed"
                        value={groupProfileForm.memberFixedAmount}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, memberFixedAmount: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                )}

                {groupProfileForm.payorMixMode === "percentage" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="detail-employer-percent">Employer Percentage (%)</Label>
                      <Input
                        id="detail-employer-percent"
                        value={groupProfileForm.employerPercentage}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, employerPercentage: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="detail-member-percent">Member Percentage (%)</Label>
                      <Input
                        id="detail-member-percent"
                        value={groupProfileForm.memberPercentage}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, memberPercentage: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="detail-responsible-name">Responsible Person Name</Label>
                    <Input
                      id="detail-responsible-name"
                      value={groupProfileForm.responsiblePersonName}
                      onChange={(event) =>
                        setGroupProfileForm((prev) => ({ ...prev, responsiblePersonName: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="detail-responsible-email">Responsible Person Email</Label>
                    <Input
                      id="detail-responsible-email"
                      type="email"
                      value={groupProfileForm.responsiblePersonEmail}
                      onChange={(event) =>
                        setGroupProfileForm((prev) => ({ ...prev, responsiblePersonEmail: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="detail-responsible-phone">Responsible Person Phone</Label>
                    <Input
                      id="detail-responsible-phone"
                      value={groupProfileForm.responsiblePersonPhone}
                      onChange={(event) =>
                        setGroupProfileForm((prev) => ({ ...prev, responsiblePersonPhone: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="detail-contact-name">Contact Person Name</Label>
                    <Input
                      id="detail-contact-name"
                      value={groupProfileForm.contactPersonName}
                      onChange={(event) =>
                        setGroupProfileForm((prev) => ({ ...prev, contactPersonName: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="detail-contact-email">Contact Person Email</Label>
                    <Input
                      id="detail-contact-email"
                      type="email"
                      value={groupProfileForm.contactPersonEmail}
                      onChange={(event) =>
                        setGroupProfileForm((prev) => ({ ...prev, contactPersonEmail: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="detail-contact-phone">Contact Person Phone</Label>
                    <Input
                      id="detail-contact-phone"
                      value={groupProfileForm.contactPersonPhone}
                      onChange={(event) =>
                        setGroupProfileForm((prev) => ({ ...prev, contactPersonPhone: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label>Preferred Payment Method</Label>
                  <Select
                    value={groupProfileForm.preferredPaymentMethod}
                    onValueChange={(value) =>
                      setGroupProfileForm((prev) => ({
                        ...prev,
                        preferredPaymentMethod: value as GroupProfile['preferredPaymentMethod'],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {preferredPaymentMethodOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {groupProfileForm.preferredPaymentMethod === "ach" && (
                  <div className="space-y-4 border rounded-md p-3 bg-slate-50">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="detail-ach-routing">Routing Number</Label>
                        <Input
                          id="detail-ach-routing"
                          value={groupProfileForm.achRoutingNumber}
                          onChange={(event) =>
                            setGroupProfileForm((prev) => ({ ...prev, achRoutingNumber: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="detail-ach-account">Account Number</Label>
                        <Input
                          id="detail-ach-account"
                          value={groupProfileForm.achAccountNumber}
                          onChange={(event) =>
                            setGroupProfileForm((prev) => ({ ...prev, achAccountNumber: event.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="detail-ach-bank">Bank Name</Label>
                        <Input
                          id="detail-ach-bank"
                          value={groupProfileForm.achBankName}
                          onChange={(event) =>
                            setGroupProfileForm((prev) => ({ ...prev, achBankName: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Account Type</Label>
                        <Select
                          value={groupProfileForm.achAccountType}
                          onValueChange={(value) =>
                            setGroupProfileForm((prev) => ({
                              ...prev,
                              achAccountType: value as GroupProfile['achAccountType'],
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select account type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="checking">Checking</SelectItem>
                            <SelectItem value="savings">Savings</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    disabled={updateGroupProfileMutation.isPending}
                    onClick={() => updateGroupProfileMutation.mutate()}
                  >
                    {updateGroupProfileMutation.isPending ? "Saving..." : "Save Group Profile"}
                  </Button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" /> Members
                  </h3>
                  <Button variant="outline" size="sm" onClick={handleAddMemberClick}>
                    <UserPlus className="h-4 w-4 mr-1" />
                    Add Member
                  </Button>
                </div>
                <div className="mb-3 border rounded-lg p-3 bg-slate-50 space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    className="hidden"
                    onChange={handleDropZoneSelect}
                  />
                  <div
                    className={`rounded-md border-2 border-dashed p-4 text-center transition-colors ${
                      isDragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"
                    }`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragActive(true);
                    }}
                    onDragLeave={() => setIsDragActive(false)}
                    onDrop={handleDropZoneDrop}
                  >
                    <Upload className="h-5 w-5 mx-auto mb-2 text-slate-500" />
                    <p className="text-sm text-slate-700">Drag and drop group census file here</p>
                    <p className="text-xs text-slate-500 mt-1">Supports .csv, .xls, and .xlsx</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose File
                    </Button>
                  </div>
                  {importFileName && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{importFileName}</p>
                        <p className="text-xs text-slate-600">{importRows.length} rows ready for import</p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => bulkImportMembersMutation.mutate()}
                        disabled={!canRunBulkImport}
                      >
                        {bulkImportMembersMutation.isPending ? "Importing..." : "Import Census Rows"}
                      </Button>
                    </div>
                  )}
                  {importWarnings.length > 0 && (
                    <p className="text-xs text-amber-700">
                      Potential issues found: {importWarnings.join("; ")}
                    </p>
                  )}
                  {canDownloadFailedRows && (
                    <Alert className="border-amber-200 bg-amber-50">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Import completed with failed rows</AlertTitle>
                      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-xs sm:text-sm">
                          {lastImportFailedRows.length} rows failed validation or save. Download them to correct and re-upload.
                        </span>
                        <Button type="button" size="sm" variant="outline" onClick={handleDownloadFailedRows}>
                          Download Failed Rows
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
                <div className="border rounded-lg divide-y bg-white">
                  {selectedGroup?.members && selectedGroup.members.length > 0 ? (
                    selectedGroup.members.map((member) => (
                      <div key={member.id} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{member.firstName} {member.lastName}</p>
                          <p className="text-sm text-gray-500">{tierLabels[member.tier] || member.tier}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="mb-1">{member.status || 'draft'}</Badge>
                          <p className="text-xs text-gray-500">{member.registeredAt ? formatDistanceToNow(new Date(member.registeredAt), { addSuffix: true }) : 'Pending'}</p>
                          <div className="flex justify-end gap-2 mt-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEditMemberClick(member)}
                              aria-label="Edit member"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600"
                              disabled={deleteMemberMutation.isPending}
                              onClick={() => deleteMemberMutation.mutate(member)}
                              aria-label="Remove member"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-sm text-gray-500">No members captured yet.</div>
                  )}
                </div>
              </div>

              <div className="border rounded-lg p-4 bg-slate-50 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                  <ClipboardCheck className="h-4 w-4 text-blue-600" /> Hosted Checkout Readiness
                </div>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600">
                      {memberCount === 0
                        ? 'Add at least one member before handing off to payments.'
                        : !profileComplete
                          ? 'Complete the group profile (EIN, contacts, payor mix, payment preference) before marking ready.'
                        : selectedGroup.data.status === 'registered'
                          ? 'This group is already marked ready for hosted checkout.'
                          : 'Review member details, then mark ready to generate the hosted checkout link.'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Members captured</span>
                        <Badge variant="secondary">{memberCount}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Status</span>
                        <Badge variant="outline" className={`capitalize ${hostedStatusBadgeClass}`}>
                          {hostedStatusLabel}
                        </Badge>
                      </div>
                      {selectedGroup.data.registrationCompletedAt && (
                        <span className="text-xs text-slate-500">
                          Marked {formatDistanceToNow(new Date(selectedGroup.data.registrationCompletedAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    {selectedGroup.data.hostedCheckoutLink && (
                      <a
                        href={selectedGroup.data.hostedCheckoutLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-sm text-blue-600 hover:text-blue-700"
                      >
                        Open hosted checkout
                      </a>
                    )}
                  </div>
                  <div className="w-full md:w-auto">
                    <Button
                      className="w-full"
                      onClick={() => completeGroupMutation.mutate()}
                      disabled={!canMarkReady || completeGroupMutation.isPending}
                    >
                      {selectedGroup.data.status === 'registered'
                        ? 'Ready'
                        : completeGroupMutation.isPending
                          ? 'Marking...'
                          : 'Mark Ready'}
                    </Button>
                    {!canMarkReady && selectedGroup.data.status !== 'registered' && (
                      <p className="mt-2 text-xs text-slate-500 text-center">
                        {memberCount === 0 ? 'Add members before marking the group ready.' : 'Complete group profile before marking ready.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Manual registration</AlertTitle>
                <AlertDescription>
                  Add all members, confirm payor amounts, then trigger hosted checkout from this workspace. Payment automation hooks into the existing EPX hosted checkout service.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => setLocation(canAccessAdminViews ? '/admin/enrollments' : '/agent')}
              variant="secondary"
            >
              {canAccessAdminViews ? 'Go to Enrollment Records' : 'Back to Dashboard'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={memberDialogOpen} onOpenChange={handleMemberDialogToggle}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{memberDialogTitle}</DialogTitle>
            <DialogDescription>{memberDialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="member-first-name">First Name</Label>
                <Input
                  id="member-first-name"
                  value={memberForm.firstName}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, firstName: event.target.value }))}
                  placeholder="Leslie"
                />
              </div>
              <div>
                <Label htmlFor="member-last-name">Last Name</Label>
                <Input
                  id="member-last-name"
                  value={memberForm.lastName}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, lastName: event.target.value }))}
                  placeholder="Knope"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                value={memberForm.email}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="leslie@example.com"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Tier</Label>
                <Select
                  value={memberForm.tier}
                  onValueChange={(value) => setMemberForm((prev) => ({ ...prev, tier: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {tierOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={memberForm.status}
                  onValueChange={(value) => setMemberForm((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Payor</Label>
              <Select
                value={memberForm.payorType}
                onValueChange={(value) => setMemberForm((prev) => ({ ...prev, payorType: value }))}
                disabled={Boolean(selectedGroup?.data?.payorType && selectedGroup.data.payorType !== 'mixed')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Payor" />
                </SelectTrigger>
                <SelectContent>
                  {[
                    { value: "full", label: "Employer Pays All" },
                    { value: "member", label: "Member Pays All" },
                  ].map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedGroup?.data?.payorType && selectedGroup.data.payorType !== 'mixed' && (
                <p className="text-xs text-gray-500 mt-1">Payor mirrors the group setting.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => handleMemberDialogToggle(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => upsertMemberMutation.mutate()}
              disabled={!isMemberFormValid || upsertMemberMutation.isPending}
            >
              {upsertMemberMutation.isPending ? 'Saving...' : editingMember ? 'Save Changes' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
