import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { X } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE_URL } from "@/lib/apiClient";

const contactFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Please enter a valid phone number"),
  message: z.string().min(1, "Please tell us how we can help"),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export function ContactFormModal({ isOpen, onClose, title = "Get Started with MyPremierPlans" }: ContactFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    mode: "onChange",
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      message: title.includes("MyPremierPlan") ? `I'm interested in ${title}` : "",
    },
  });

  const onSubmit = async (data: ContactFormData) => {
    setIsSubmitting(true);
    
    const submitForm = async (retryCount = 0) => {
      try {
        console.log('[ContactForm] Submitting lead data:', data, { retryCount });

        const response = await fetch(`${API_BASE_URL}/api/public/leads`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone,
            message: data.message || 'I\'m interested in Get Started with MyPremierPlans',
          }),
        });

        console.log('[ContactForm] Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[ContactForm] Error response:', errorText);
          
          // Retry on server errors or network issues
          if (retryCount === 0 && (response.status >= 500 || response.status === 0)) {
            console.log('[ContactForm] Retrying form submission...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            return submitForm(retryCount + 1);
          }
          
          throw new Error(`Submission failed (${response.status}). Please try again.`);
        }

        const result = await response.json();
        console.log('[ContactForm] Success response:', result);

        if (result.success) {
          toast({
            title: "Thank you for your interest!",
            description: "We've received your information and will contact you soon.",
          });
          form.reset();
          onClose();
        } else {
          throw new Error(result.message || 'Failed to submit form');
        }
      } catch (error: any) {
        console.error('Contact form submission error:', error);
        
        // Only retry network errors, not validation errors
        if (retryCount === 0 && (error.message.includes('fetch') || error.message.includes('Network'))) {
          console.log('[ContactForm] Retrying on network error...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          return submitForm(retryCount + 1);
        }
        
        toast({
          title: "Submission failed",
          description: error.message || "Please try again or call us directly at 210-512-4318",
          variant: "destructive",
        });
      }
    };
    
    try {
      await submitForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>

        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-900">{title}</DialogTitle>
          <DialogDescription className="text-gray-600">
            Fill out this form and an agent will contact you to help with enrollment.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} />
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
                      <Input placeholder="Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="john.doe@example.com" {...field} />
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
                  <FormLabel>Phone Number *</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="(555) 123-4567" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>How can we help? *</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="I'm interested in enrolling in a family plan..." 
                      className="resize-none"
                      rows={4}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
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

        <div className="text-center text-sm text-gray-600 mt-4">
          Or call us directly at <a href="tel:210-512-4318" className="text-medical-blue-600 hover:underline">210-512-4318</a>
        </div>
      </DialogContent>
    </Dialog>
  );
}