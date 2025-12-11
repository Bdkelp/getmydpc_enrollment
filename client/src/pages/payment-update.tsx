import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import apiClient from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const REASONS = [
  { value: "card_update", label: "Update card on file" },
  { value: "billing_address", label: "Change billing address" },
  { value: "plan_change", label: "Move to a new plan" },
  { value: "member_question", label: "Member has a billing question" },
  { value: "other", label: "Other" },
];

const CONTACT_METHODS = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "text", label: "Text" },
];

const PaymentUpdate = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [formState, setFormState] = useState({
    memberId: "",
    memberEmail: "",
    reason: REASONS[0].value,
    preferredContact: CONTACT_METHODS[0].value,
    details: "",
  });

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      return apiClient.post("/api/payments/update-info", payload);
    },
    onSuccess: (data: any) => {
      toast({ title: "Request logged", description: data?.message || "Billing team notified." });
      setFormState((prev) => ({ ...prev, memberId: "", memberEmail: "", details: "" }));
    },
    onError: (error: any) => {
      toast({
        title: "Unable to submit",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleChange = (field: keyof typeof formState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormState((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formState.memberId.trim() && !formState.memberEmail.trim()) {
      toast({
        title: "Member details required",
        description: "Provide a member ID or email so billing can locate the account.",
        variant: "destructive",
      });
      return;
    }

    const payload: Record<string, any> = {
      reason: formState.reason,
      preferredContact: formState.preferredContact,
      details: formState.details.trim() || undefined,
      memberEmail: formState.memberEmail.trim() || undefined,
    };

    if (formState.memberId.trim()) {
      const normalizedId = Number(formState.memberId.trim());
      if (Number.isFinite(normalizedId)) {
        payload.memberId = normalizedId;
      } else {
        toast({
          title: "Invalid member ID",
          description: "Member ID must be a number.",
          variant: "destructive",
        });
        return;
      }
    }

    mutation.mutate(payload);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-3xl mx-auto px-4">
        <Card>
          <CardHeader>
            <CardTitle>Request Payment or Billing Update</CardTitle>
            <p className="text-sm text-muted-foreground">
              Logged-in requests notify billing so they can work with the member without exposing the EPX portal.
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="memberId">Member ID</Label>
                  <Input
                    id="memberId"
                    placeholder="1234"
                    value={formState.memberId}
                    onChange={handleChange("memberId")}
                  />
                </div>
                <div>
                  <Label htmlFor="memberEmail">Member Email</Label>
                  <Input
                    id="memberEmail"
                    type="email"
                    placeholder="member@example.com"
                    value={formState.memberEmail}
                    onChange={handleChange("memberEmail")}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="reason">Reason</Label>
                  <Select value={formState.reason} onValueChange={(value) => setFormState((prev) => ({ ...prev, reason: value }))}>
                    <SelectTrigger id="reason">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {REASONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="preferredContact">Preferred Contact</Label>
                  <Select
                    value={formState.preferredContact}
                    onValueChange={(value) => setFormState((prev) => ({ ...prev, preferredContact: value }))}
                  >
                    <SelectTrigger id="preferredContact">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_METHODS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="details">Details</Label>
                <Textarea
                  id="details"
                  rows={5}
                  placeholder="Share whatever context billing needs (e.g., updated card, member concerns, etc.)."
                  value={formState.details}
                  onChange={handleChange("details")}
                />
              </div>

              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? "Submitting..." : "Send to Billing"}
              </Button>
            </form>
            <p className="mt-4 text-xs text-muted-foreground">
              The billing desk receives your request with your user info ({user?.email || "unknown user"}) so they can follow up quickly.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PaymentUpdate;
