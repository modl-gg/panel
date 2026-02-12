import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Loader2, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePublicSettings } from '@/hooks/use-public-settings';
import { MODL } from '@modl-gg/shared-web';

import { Button } from "@modl-gg/shared-web/components/ui/button";
import { Input } from "@modl-gg/shared-web/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@modl-gg/shared-web/components/ui/form";
import {
  Card,
  CardContent,
  CardFooter,
} from "@modl-gg/shared-web/components/ui/card";
import { useToast } from "@modl-gg/shared-web/hooks/use-toast";
import { Badge } from '@modl-gg/shared-web/components/ui/badge';

const loginSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  code: z.string().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const AuthPage = () => {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: publicSettings } = usePublicSettings();
  const [loginStep, setLoginStep] = useState<'email' | 'verification'>('email');
  const serverDisplayName = publicSettings?.serverDisplayName || 'modl';

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      code: "",
    },
  });
  const isSubmitting = loginForm.formState.isSubmitting;

  const { login, user, requestEmailVerification } = useAuth();

  useEffect(() => {
    if (user) {
      setLocation('/panel');
    }
  }, [user, setLocation]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const message = urlParams.get('message');

    if (message === 'provisioning_complete_login_required') {
      toast({
        title: "Server Setup Complete!",
        description: "Your server has been successfully provisioned. Please log in to access your panel and start configuring your settings.",
        duration: 8000,
      });

      urlParams.delete('message');
      const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
      window.history.replaceState({}, '', newUrl);
    }
  }, [toast]);

  const onLoginSubmit = async (values: LoginFormValues) => {
    if (loginStep === 'email') {
      const result = await requestEmailVerification(values.email);
      if (result !== undefined) {
        setLoginStep('verification');
      }
    } else {
      if (!values.code) {
        toast({
          title: "Verification Code Required",
          description: "Please enter the verification code sent to your email.",
          variant: "destructive"
        });
        return;
      }

      const success = await login(values.email, values.code);

      if (success) {
        setLocation('/panel');
      } else {
        loginForm.setValue('code', '');
        const codeInput = document.querySelector('input[name="code"]') as HTMLInputElement;
        if (codeInput) {
          codeInput.focus();
        }
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-4 md:p-10">
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
                                  disabled={isSubmitting}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button type="submit" className="w-full mt-6" disabled={isSubmitting}>
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          'Send Verification Code'
                        )}
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
                            loginForm.setValue('code', '');
                          }}
                          className="h-7 px-2 text-xs"
                          disabled={isSubmitting}
                        >
                          Change
                        </Button>
                      </div>

                      <FormField
                        control={loginForm.control}
                        name="code"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Verification Code</FormLabel>
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
                                  disabled={isSubmitting}
                                />
                              </div>
                            </FormControl>
                            <FormDescription>
                              Enter the verification code sent to your email
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button type="submit" className="w-full mt-6" disabled={isSubmitting}>
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          'Verify & Login'
                        )}
                      </Button>
                    </>
                  )}
                </form>
              </Form>
            </CardContent>
            <CardFooter className="flex justify-center border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Administrator contact: <a href={`mailto:${MODL.Email.ADMIN}`} className="text-primary hover:underline">{MODL.Email.ADMIN}</a>
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
