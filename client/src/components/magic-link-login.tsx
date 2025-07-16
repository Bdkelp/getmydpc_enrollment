import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Mail, Loader2 } from "lucide-react";

const magicLinkSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

type MagicLinkFormData = z.infer<typeof magicLinkSchema>;

interface MagicLinkLoginProps {
  onSuccess?: () => void;
}

export function MagicLinkLogin({ onSuccess }: MagicLinkLoginProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  const form = useForm<MagicLinkFormData>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: MagicLinkFormData) => {
    setIsLoading(true);
    try {
      // Get the correct redirect URL - handle Replit preview URLs
      let redirectUrl = `${window.location.origin}/auth/callback`;
      
      // If we're in Replit, use the actual preview URL
      if (window.location.hostname.includes('replit.dev') || window.location.hostname.includes('repl.co')) {
        redirectUrl = `${window.location.origin}/auth/callback`;
      }
      
      const { error } = await supabase.auth.signInWithOtp({
        email: data.email,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });
      
      if (error) {
        throw error;
      }
      
      setIsSubmitted(true);
      toast({
        title: "Check your email",
        description: "We've sent you a magic link to sign in.",
      });
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send magic link. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="text-center space-y-4">
        <div className="text-green-600 text-lg font-semibold">
          Check your email!
        </div>
        <p className="text-sm text-gray-600">
          We've sent a magic link to {form.getValues('email')}. 
          Click the link in the email to sign in.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setIsSubmitted(false);
            form.reset();
          }}
          className="text-sm"
        >
          Send another link
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input 
                    placeholder="you@example.com" 
                    className="pl-10"
                    {...field} 
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button 
          type="submit" 
          className="w-full bg-medical-blue-600 hover:bg-medical-blue-700 text-white"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending magic link...
            </>
          ) : (
            "Send magic link"
          )}
        </Button>
      </form>
    </Form>
  );
}