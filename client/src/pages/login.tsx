import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { signIn, signInWithOAuth } from "@/lib/supabase";
import { Heart, Mail, Lock, Loader2 } from "lucide-react";
import { FaGoogle, FaFacebook, FaTwitter, FaLinkedin, FaMicrosoft, FaApple } from "react-icons/fa";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MagicLinkLogin } from "@/components/magic-link-login";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      console.log("Attempting login with:", data.email);
      const { data: result, error } = await signIn(data.email, data.password);
      
      if (error) {
        console.error("Login error:", error);
        throw new Error(error.message);
      }
      
      if (result.user && result.session) {
        console.log("Login successful, user:", result.user);
        console.log("Session token:", result.session.access_token?.substring(0, 50) + '...');
        
        // Wait for the session to be properly stored in Supabase
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify the session is stored
        const { getSession } = await import("@/lib/supabase");
        const storedSession = await getSession();
        console.log("Stored session verified:", !!storedSession);
        
        // Now fetch user data from backend to get role
        const response = await fetch('/api/auth/user', {
          headers: {
            'Authorization': `Bearer ${result.session.access_token}`
          }
        });
        
        if (response.ok) {
          const userData = await response.json();
          console.log("User role:", userData.role);
          
          toast({
            title: "Welcome back!",
            description: `Logged in as ${userData.role}`,
          });
          
          // Navigate to appropriate dashboard based on role
          setTimeout(() => {
            if (userData.role === "admin") {
              window.location.href = '/admin';
            } else if (userData.role === "agent") {
              window.location.href = '/agent';
            } else {
              window.location.href = '/no-access';
            }
          }, 500);
        } else {
          console.error("Failed to get user data:", response.status);
          toast({
            title: "Login issue",
            description: "Logged in but couldn't load user data. Please refresh the page.",
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      console.error("Login failed:", error);
      toast({
        title: "Login failed",
        description: error.message || "Please check your credentials and try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'facebook' | 'twitter' | 'linkedin' | 'microsoft' | 'apple') => {
    try {
      const { error } = await signInWithOAuth(provider);
      if (error) {
        toast({
          title: "Login failed",
          description: error.message,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message || "Social login failed",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <Heart className="h-10 w-10 text-medical-blue-600" />
          </div>
          <CardTitle className="text-2xl text-center">Welcome back</CardTitle>
          <CardDescription className="text-center">
            Sign in to your MyPremierPlans account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="password" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="password">Password</TabsTrigger>
              <TabsTrigger value="magic-link">Magic Link</TabsTrigger>
            </TabsList>
            
            <TabsContent value="password" className="space-y-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="email">Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input 
                          id="email"
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
              
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="password">Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input 
                          id="password"
                          type="password" 
                          placeholder="••••••••" 
                          className="pl-10"
                          {...field} 
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex items-center justify-between">
                <Link href="/forgot-password">
                  <span className="text-sm text-medical-blue-600 hover:text-medical-blue-700 cursor-pointer">
                    Forgot password?
                  </span>
                </Link>
              </div>
              
              <Button 
                type="submit" 
                className="w-full bg-white hover:bg-gray-100 text-black border border-gray-300"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
                </form>
              </Form>
            </TabsContent>
            
            <TabsContent value="magic-link" className="space-y-4">
              <p className="text-sm text-gray-600 text-center mb-4">
                We'll send you a link to sign in without a password
              </p>
              <MagicLinkLogin />
            </TabsContent>
          </Tabs>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">Or continue with</span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={() => handleSocialLogin("google")}
              className="w-full"
            >
              <FaGoogle className="mr-2 h-4 w-4" />
              Google
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSocialLogin("facebook")}
              className="w-full"
            >
              <FaFacebook className="mr-2 h-4 w-4" />
              Facebook
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSocialLogin("twitter")}
              className="w-full"
            >
              <FaTwitter className="mr-2 h-4 w-4" />
              Twitter
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSocialLogin("linkedin")}
              className="w-full"
            >
              <FaLinkedin className="mr-2 h-4 w-4" />
              LinkedIn
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSocialLogin("microsoft")}
              className="w-full"
            >
              <FaMicrosoft className="mr-2 h-4 w-4" />
              Microsoft
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSocialLogin("apple")}
              className="w-full"
            >
              <FaApple className="mr-2 h-4 w-4" />
              Apple
            </Button>
          </div>
        </CardContent>
        <CardFooter>
          <p className="text-center text-sm text-gray-600 w-full">
            Don't have an account?{" "}
            <Link href="/register">
              <span className="font-medium text-medical-blue-600 hover:text-medical-blue-700 cursor-pointer">
                Sign up
              </span>
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}