import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/apiClient";

const partnerFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(10, "Phone number is required"),
  agencyName: z.string().min(2, "Agency or company name is required"),
  agencyWebsite: z
    .string()
    .url("Enter a valid URL")
    .optional()
    .or(z.literal("")),
  statesServed: z.string().min(2, "List at least one state"),
  experienceLevel: z
    .enum(["new-to-dpc", "growing-book", "seasoned-partner", "enterprise-agency"]),
  volumeEstimate: z
    .enum(["under-50", "50-150", "150-400", "400-plus"]),
  message: z
    .string()
    .min(10, "Share a few notes about your agency")
    .max(1000, "Please keep the message under 1000 characters"),
});

export type PartnerFormValues = z.infer<typeof partnerFormSchema>;

interface PartnerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const experienceLabels: Record<PartnerFormValues["experienceLevel"], string> = {
  "new-to-dpc": "New to DPC",
  "growing-book": "Growing healthcare portfolio",
  "seasoned-partner": "Experienced partner",
  "enterprise-agency": "Enterprise agency",
};

const volumeLabels: Record<PartnerFormValues["volumeEstimate"], string> = {
  "under-50": "Under 50 members",
  "50-150": "50 - 150 members",
  "150-400": "150 - 400 members",
  "400-plus": "400+ members",
};

export function PartnerFormModal({ isOpen, onClose }: PartnerFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerFormSchema),
    mode: "onChange",
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      agencyName: "",
      agencyWebsite: "",
      statesServed: "",
      experienceLevel: "new-to-dpc",
      volumeEstimate: "under-50",
      message: "We would like to partner with My Premier Plans to offer DPC memberships to our clients.",
    },
  });

  const submitPartnerForm = async (values: PartnerFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/public/partner-leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          ...values,
          agencyWebsite: values.agencyWebsite || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || "Submission failed");
      }

      toast({
        title: "Request received",
        description: "Our partnerships team will contact you shortly.",
      });
      form.reset();
      onClose();
    } catch (error: any) {
      toast({
        title: "Submission failed",
        description: error?.message || "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>

        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-900">Partner with My Premier Plans</DialogTitle>
          <DialogDescription className="text-gray-600">
            Tell us about your agency and we will share onboarding resources, commission details, and co-marketing opportunities.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(submitPartnerForm)} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Jordan" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Lee" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@agency.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone *</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="agencyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agency or Company *</FormLabel>
                  <FormControl>
                    <Input placeholder="Premier Benefits Group" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="agencyWebsite"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input type="url" placeholder="https://youragency.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="statesServed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>States You Serve *</FormLabel>
                    <FormControl>
                      <Input placeholder="TX, OK, NM" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="experienceLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Experience Level *</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-medical-blue-500"
                      >
                        {Object.entries(experienceLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="volumeEstimate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected Monthly Members *</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-medical-blue-500"
                      >
                        {Object.entries(volumeLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tell us about your goals *</FormLabel>
                  <FormControl>
                    <Textarea rows={4} className="resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-medical-blue-600 text-white hover:bg-medical-blue-700"
                disabled={isSubmitting || !form.formState.isValid}
              >
                {isSubmitting ? <LoadingSpinner /> : "Submit"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
