import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Fingerprint, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePublicSettings } from '@/hooks/use-public-settings';

import { Button } from "modl-shared-web/components/ui/button";
import { Input } from "modl-shared-web/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "modl-shared-web/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "modl-shared-web/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "modl-shared-web/components/ui/tabs";
import { useToast } from "modl-shared-web/hooks/use-toast";
import { Badge } from 'modl-shared-web/components/ui/badge';
import { Separator } from 'modl-shared-web/components/ui/separator';

// Define the login form schema
const loginSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  methodType: z.enum(["2fa", "email", "passkey"]),
  code: z.string().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// No registration in this app

const AuthPage = () => {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: publicSettings } = usePublicSettings();
  const [loginStep, setLoginStep] = useState<'email' | 'verification'>('email');
  const [verificationMethod, setVerificationMethod] = useState<'2fa' | 'email' | 'passkey'>('email');
  // Store available auth methods for the entered email
  const [userAuthMethods, setUserAuthMethods] = useState<{ isTwoFactorEnabled?: boolean; hasFidoPasskeys?: boolean; emailExists?: boolean }>({});

  const serverDisplayName = publicSettings?.serverDisplayName || 'modl';

  // Login form
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      methodType: "email",
    },
  });

  const { login, user, requestEmailVerification, request2FAVerification, requestPasskeyAuthentication } = useAuth();

  // Redirect to home page if already authenticated
  useEffect(() => {
    if (user) {
      setLocation('/');
    }
  }, [user, setLocation]);

  // Show message if redirected after provisioning completion
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const message = urlParams.get('message');
    
    if (message === 'provisioning_complete_login_required') {
      toast({
        title: "🎉 Server Setup Complete!",
        description: "Your server has been successfully provisioned. Please log in to access your panel and start configuring your settings.",
        duration: 8000,
      });
      
      // Clean up URL parameter
      urlParams.delete('message');
      const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
      window.history.replaceState({}, '', newUrl);
    }
  }, [toast]);

  // Handle login form submission
  const onLoginSubmit = async (values: LoginFormValues) => {
    if (loginStep === 'email') {
      try {
        const emailCheckResponse = await fetch(`/api/auth/check-email/${encodeURIComponent(values.email)}`);
        if (!emailCheckResponse.ok) {
          toast({ title: "Error", description: "Could not verify email. Please try again.", variant: "destructive" });
          return;
        }
        const emailCheckResult = await emailCheckResponse.json();

        setUserAuthMethods({ // Store fetched auth methods availability
          emailExists: emailCheckResult.exists,
          isTwoFactorEnabled: emailCheckResult.isTwoFactorEnabled,
          hasFidoPasskeys: emailCheckResult.hasFidoPasskeys,
        });

        if (!emailCheckResult.exists) {
          toast({ title: "Email Not Found", description: "The provided email address was not found.", variant: "destructive" });
          return;
        }

        let selectedMethod = values.methodType;
        // Auto-select 2FA if available and user didn't pick passkey
        if (emailCheckResult.isTwoFactorEnabled && selectedMethod !== 'passkey' && selectedMethod !== '2fa') {
            selectedMethod = '2fa';
        }
        loginForm.setValue('methodType', selectedMethod); // Ensure form state reflects effective method
        setVerificationMethod(selectedMethod);


        if (selectedMethod === 'passkey') {
          if (!emailCheckResult.hasFidoPasskeys) {
            toast({ title: "Passkey Not Available", description: "Passkey login is not set up for this account. Please choose another method.", variant: "default" });
            return;
          }
          // requestPasskeyAuthentication handles the full flow: challenge, browser prompt, and verification (calling login internally)
          // It will show toasts for prompts, success, or failure.
          // If successful, useAuth hook handles navigation.
          await requestPasskeyAuthentication(values.email);
          return; // Full passkey flow handled, do not proceed to setLoginStep
        }
        
        if (selectedMethod === '2fa') {
          if (!emailCheckResult.isTwoFactorEnabled) {
            toast({ title: "2FA Not Available", description: "2FA is not enabled for this account. Please choose another method.", variant: "default" });
            return;
          }
          toast({ title: "2FA Required", description: "Please enter the code from your authenticator app." });
          setLoginStep('verification');
          return;
        }

        if (selectedMethod === 'email') {
          await requestEmailVerification(values.email);
          setLoginStep('verification');
          return;
        }

      } catch (error) {
        console.error("Error during email check/login initiation:", error);
        toast({ title: "Network Error", description: "Failed to connect to the server. Please check your connection.", variant: "destructive" });
        return;
      }
    } else { // loginStep === 'verification' (only for 'email' or '2fa')
      try {
        if (verificationMethod === 'passkey') {
          // This state should not be reached as passkey is handled in the 'email' step
          console.warn("Reached verification step for passkey unexpectedly.");
          toast({ title: "Error", description: "Unexpected passkey verification step.", variant: "destructive" });
          setLoginStep('email'); // Reset to email step
          return;
        }

        if (!values.code) {
          toast({ title: "Verification Code Required", description: `Please enter your ${verificationMethod === '2fa' ? '2FA' : 'email'} code.`, variant: "destructive"});
          return;
        }

        const success = await login(
          values.email,
          verificationMethod, // 'email' or '2fa'
          values.code
        );

        if (success) {
          // Redirect is handled by the auth hook's login on success
        } else {
          // On failure, clear the code field to allow retry
          loginForm.setValue('code', '');
          // Focus back to the code input for better UX
          const codeInput = document.querySelector('input[name="code"]') as HTMLInputElement;
          if (codeInput) {
            codeInput.focus();
          }
        }
      } catch (error) { // Should be caught by useAuth's login, but as a fallback
        console.error("Error during code verification:", error);
        toast({ title: "Authentication Failed", description: "An error occurred during code verification.", variant: "destructive" });
      }
    }
  };

  // No registration in this app

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-4 md:p-10">
        {/* Auth form section */}
        <div className="flex flex-col justify-center">
          <div className="flex flex-col space-y-2 mb-8 text-center">
            <h1 className="text-3xl font-bold">{serverDisplayName} Staff Panel</h1>
            <p className="text-muted-foreground">
              Authorized access only
            </p>
          </div>

          <Card>
            <br></br>
            <CardContent>
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                  {loginStep === 'email' ? (
                    <>
                      <FormField
                        control={loginForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...field}
                                  placeholder="name@example.com"
                                  className="pl-10"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={loginForm.control}
                        name="methodType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Verification Method</FormLabel>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <Badge 
                                variant={field.value === "email" ? "default" : "outline"}
                                className="cursor-pointer py-1 px-3 hover:bg-primary/90"
                                onClick={() => field.onChange("email")}
                              >
                                <Mail className="h-3.5 w-3.5 mr-1.5" />
                                Email Code
                              </Badge>
                              <Badge 
                                variant={field.value === "2fa" ? "default" : "outline"}
                                className="cursor-pointer py-1 px-3 hover:bg-primary/90"
                                onClick={() => field.onChange("2fa")}
                              >
                                <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                                2FA Code
                              </Badge>
                              <Badge 
                                variant={field.value === "passkey" ? "default" : "outline"}
                                className="cursor-pointer py-1 px-3 hover:bg-primary/90"
                                onClick={() => field.onChange("passkey")}
                              >
                                <Fingerprint className="h-3.5 w-3.5 mr-1.5" />
                                Passkey
                              </Badge>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button type="submit" className="w-full mt-6">
                        Continue
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="mb-4 flex items-center gap-2">
                        <Badge>{loginForm.getValues().email}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => {
                            setLoginStep('email');
                            // Optionally clear code field if user goes back
                            loginForm.setValue('code', '');
                            setUserAuthMethods({}); // Clear stored auth methods
                          }}
                          className="h-7 px-2 text-xs"
                        >
                          Change
                        </Button>
                      </div>

                      {/* Passkey verification UI is removed from this step, as it's handled in the first step */}
                      {verificationMethod !== 'passkey' && (
                        <>
                          <FormField
                            control={loginForm.control}
                            name="code"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  {verificationMethod === '2fa' ? '2FA Code' : 'Verification Code'}
                                </FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                      {...field}
                                      placeholder="Enter your 6-digit code"
                                      className="pl-10"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      maxLength={6}
                                    />
                                  </div>
                                </FormControl>
                                <FormDescription>
                                  Enter the {verificationMethod === '2fa' ? '2FA code from your authenticator app' : 'verification code sent to your email'}
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <Button type="submit" className="w-full mt-6">
                            Verify & Login
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </form>
              </Form>
            </CardContent>
            <CardFooter className="flex justify-center border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Administrator contact: <a href="mailto:admin@cobl.gg" className="text-primary hover:underline">admin@cobl.gg</a>
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;