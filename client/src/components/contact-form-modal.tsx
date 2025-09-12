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
    
    try {
      console.log('=== CONTACT FORM SUBMISSION START ===');
      console.log('Form data:', data);
      console.log('Form validation state:', {
        isValid: form.formState.isValid,
        errors: form.formState.errors
      });
      
      // Validate required fields client-side
      if (!data.firstName || !data.lastName || !data.email || !data.phone) {
        throw new Error('Please fill in all required fields');
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        throw new Error('Please enter a valid email address');
      }
      
      // Validate phone number (basic validation)
      if (data.phone.length < 10) {
        throw new Error('Please enter a valid phone number');
      }
      
      console.log('Client-side validation passed');
      console.log('Making request to:', "/api/public/leads");
      
      // Submit lead to backend (public endpoint for contact form)
      const result = await apiClient.post("/api/public/leads", data);
      console.log('Lead submission successful:', result);
      console.log('=== CONTACT FORM SUBMISSION SUCCESS ===');
      
      toast({
        title: "Thank you for your interest!",
        description: "We'll contact you within 24 hours to discuss your enrollment options.",
      });
      
      form.reset();
      onClose();
    } catch (error: any) {
      console.error('=== CONTACT FORM SUBMISSION ERROR ===');
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      let errorMessage = "Please try again or call us at 210-512-4318";
      
      if (error.message.includes('Failed to fetch')) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (error.message.includes('validation') || error.message.includes('required')) {
        errorMessage = error.message;
      } else if (error.message.includes('Server error')) {
        errorMessage = "Server error. Please try again in a moment.";
      }
      
      toast({
        title: "Submission Failed",
        description: errorMessage,
        variant: "destructive",
      });
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
                className={`flex-1 text-white ${
                  form.formState.isValid 
                    ? "bg-green-600 hover:bg-green-700" 
                    : "bg-gray-400 hover:bg-gray-500"
                }`}
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