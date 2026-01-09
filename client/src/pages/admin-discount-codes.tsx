import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { hasAtLeastRole } from "@/lib/roles";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { 
  ChevronLeft, 
  Plus, 
  Edit, 
  Trash2, 
  Tag,
  ToggleLeft,
  ToggleRight
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// API request helper function
async function apiRequest(url: string, options: RequestInit = {}) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
  }

  return response.json();
}

interface DiscountCode {
  id: string;
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  durationType: 'once' | 'limited_months' | 'indefinite';
  durationMonths?: number;
  isActive: boolean;
  maxUses?: number;
  currentUses: number;
  validFrom?: string;
  validUntil?: string;
  createdAt: string;
  createdBy: string;
}

export default function AdminDiscountCodes() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdminOrAbove = hasAtLeastRole(user?.role, 'admin');
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCode, setEditingCode] = useState<DiscountCode | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    description: "",
    discountType: "fixed" as const,
    discountValue: "",
    durationType: "once" as const,
    durationMonths: "",
    maxUses: "",
    validFrom: "",
    validUntil: "",
  });

  // Fetch discount codes
  const { data: discountCodes, isLoading } = useQuery<DiscountCode[]>({
    queryKey: ['/api/admin/discount-codes'],
    queryFn: () => apiRequest('/api/admin/discount-codes'),
  });

  // Create discount code mutation
  const createCodeMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest('/api/admin/discount-codes', {
        method: 'POST',
        body: JSON.stringify({
          code: data.code.trim().toUpperCase(),
          description: data.description,
          discountType: data.discountType,
          discountValue: parseFloat(data.discountValue),
          durationType: data.durationType,
          durationMonths: data.durationMonths ? parseInt(data.durationMonths) : null,
          maxUses: data.maxUses ? parseInt(data.maxUses) : null,
          validFrom: data.validFrom || null,
          validUntil: data.validUntil || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/discount-codes'] });
      setShowCreateDialog(false);
      resetForm();
      toast({
        title: "Success",
        description: "Discount code created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create discount code",
        variant: "destructive",
      });
    },
  });

  // Update discount code mutation
  const updateCodeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      return apiRequest(`/api/admin/discount-codes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          code: data.code.trim().toUpperCase(),
          description: data.description,
          discountType: data.discountType,
          discountValue: parseFloat(data.discountValue),
          durationType: data.durationType,
          durationMonths: data.durationMonths ? parseInt(data.durationMonths) : null,
          maxUses: data.maxUses ? parseInt(data.maxUses) : null,
          validFrom: data.validFrom || null,
          validUntil: data.validUntil || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/discount-codes'] });
      setEditingCode(null);
      resetForm();
      toast({
        title: "Success",
        description: "Discount code updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update discount code",
        variant: "destructive",
      });
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest(`/api/admin/discount-codes/${id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/discount-codes'] });
      toast({
        title: "Success",
        description: "Discount code status updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  // Delete discount code mutation
  const deleteCodeMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/discount-codes/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/discount-codes'] });
      toast({
        title: "Success",
        description: "Discount code deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete discount code",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      code: "",
      description: "",
      discountType: "fixed",
      discountValue: "",
      durationType: "once",
      durationMonths: "",
      maxUses: "",
      validFrom: "",
      validUntil: "",
    });
  };

  const handleEdit = (code: DiscountCode) => {
    setEditingCode(code);
    setFormData({
      code: code.code,
      description: code.description,
      discountType: code.discountType,
      discountValue: code.discountValue.toString(),
      durationType: code.durationType,
      durationMonths: code.durationMonths?.toString() || "",
      maxUses: code.maxUses?.toString() || "",
      validFrom: code.validFrom || "",
      validUntil: code.validUntil || "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingCode) {
      updateCodeMutation.mutate({ id: editingCode.id, data: formData });
    } else {
      createCodeMutation.mutate(formData);
    }
  };

  const filteredCodes = discountCodes?.filter(code =>
    code.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    code.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => setLocation("/admin")}
              className="flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Discount Codes</h1>
              <p className="text-gray-600 mt-1">Manage enrollment discount codes</p>
            </div>
          </div>
          {isAdminOrAbove && (
            <Button onClick={() => setShowCreateDialog(true)} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create Discount Code
            </Button>
          )}
        </div>

        {/* Stats Card */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Codes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{discountCodes?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active Codes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {discountCodes?.filter(c => c.isActive).length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Inactive Codes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-400">
                {discountCodes?.filter(c => !c.isActive).length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Uses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {discountCodes?.reduce((sum, c) => sum + c.currentUses, 0) || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Input
                  placeholder="Search by code or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
                <Tag className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Valid Period</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCodes?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                      No discount codes found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCodes?.map((code) => (
                    <TableRow key={code.id}>
                      <TableCell className="font-mono font-bold">{code.code}</TableCell>
                      <TableCell className="max-w-xs truncate">{code.description}</TableCell>
                      <TableCell>
                        {code.discountType === 'percentage' 
                          ? `${code.discountValue}%` 
                          : `$${code.discountValue}`}
                      </TableCell>
                      <TableCell>
                        {code.durationType === 'once' && <Badge variant="secondary">One Time</Badge>}
                        {code.durationType === 'limited_months' && (
                          <Badge variant="secondary">{code.durationMonths} Months</Badge>
                        )}
                        {code.durationType === 'indefinite' && (
                          <Badge variant="secondary">Indefinite</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {code.currentUses}
                        {code.maxUses && ` / ${code.maxUses}`}
                      </TableCell>
                      <TableCell>
                        {code.isActive ? (
                          <Badge className="bg-green-100 text-green-800">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {code.validFrom || code.validUntil ? (
                          <>
                            {code.validFrom && format(new Date(code.validFrom), 'MMM d, yyyy')}
                            {code.validFrom && code.validUntil && ' - '}
                            {code.validUntil && format(new Date(code.validUntil), 'MMM d, yyyy')}
                          </>
                        ) : (
                          <span className="text-gray-400">No expiration</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isAdminOrAbove ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleActiveMutation.mutate({ 
                                id: code.id, 
                                isActive: !code.isActive 
                              })}
                            >
                              {code.isActive ? (
                                <ToggleRight className="w-4 h-4 text-green-600" />
                              ) : (
                                <ToggleLeft className="w-4 h-4 text-gray-400" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(code)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Delete discount code "${code.code}"?`)) {
                                  deleteCodeMutation.mutate(code.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 italic">View Only</div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={showCreateDialog || !!editingCode} onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setEditingCode(null);
            resetForm();
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingCode ? 'Edit' : 'Create'} Discount Code</DialogTitle>
              <DialogDescription>
                {editingCode ? 'Update the discount code details' : 'Create a new discount code for member enrollments'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Code *</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      placeholder="PBBT2024"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discountType">Discount Type *</Label>
                    <Select
                      value={formData.discountType}
                      onValueChange={(value: any) => setFormData({ ...formData, discountType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Professional Bail Bondsmen of Texas 2024 discount"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="discountValue">Discount Value *</Label>
                    <Input
                      id="discountValue"
                      type="number"
                      step="0.01"
                      value={formData.discountValue}
                      onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                      placeholder={formData.discountType === 'percentage' ? '10' : '20.00'}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="durationType">Duration Type *</Label>
                    <Select
                      value={formData.durationType}
                      onValueChange={(value: any) => setFormData({ ...formData, durationType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="once">One Time Only</SelectItem>
                        <SelectItem value="limited_months">Limited Months</SelectItem>
                        <SelectItem value="indefinite">Indefinite</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {formData.durationType === 'limited_months' && (
                  <div className="space-y-2">
                    <Label htmlFor="durationMonths">Number of Months *</Label>
                    <Input
                      id="durationMonths"
                      type="number"
                      value={formData.durationMonths}
                      onChange={(e) => setFormData({ ...formData, durationMonths: e.target.value })}
                      placeholder="12"
                      required
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxUses">Max Uses (Optional)</Label>
                    <Input
                      id="maxUses"
                      type="number"
                      value={formData.maxUses}
                      onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
                      placeholder="Unlimited"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="validFrom">Valid From (Optional)</Label>
                    <Input
                      id="validFrom"
                      type="date"
                      value={formData.validFrom}
                      onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="validUntil">Valid Until (Optional)</Label>
                    <Input
                      id="validUntil"
                      type="date"
                      value={formData.validUntil}
                      onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setEditingCode(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createCodeMutation.isPending || updateCodeMutation.isPending}>
                  {editingCode ? 'Update' : 'Create'} Code
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
