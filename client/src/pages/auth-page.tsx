import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Loader2, Mail, Fingerprint } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePublicSettings } from '@/hooks/use-public-settings';

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
  const [verifyMethod, setVerifyMethod] = useState<'code' | 'passkey'>('code');
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyChallenge, setPasskeyChallenge] = useState<{ challengeId: string; options: any } | null>(null);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const serverDisplayName = publicSettings?.serverDisplayName || 'modl';

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      code: "",
    },
  });
  const isSubmitting = loginForm.formState.isSubmitting;

  const { login, user, requestEmailVerification, checkPasskeyOptions, loginWithPasskey, loginWithDiscoverablePasskey } = useAuth();
  const [discoverableLoading, setDiscoverableLoading] = useState(false);

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

  const handlePasskeyLogin = async () => {
    if (!passkeyChallenge) return;
    setPasskeyLoading(true);
    try {
      const success = await loginWithPasskey(passkeyChallenge.challengeId, passkeyChallenge.options);
      if (success) {
        setLocation('/panel');
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleDiscoverablePasskey = async () => {
    setDiscoverableLoading(true);
    try {
      const success = await loginWithDiscoverablePasskey();
      if (success) {
        setLocation('/panel');
      }
    } finally {
      setDiscoverableLoading(false);
    }
  };

  const onLoginSubmit = async (values: LoginFormValues) => {
    if (loginStep === 'email') {
      // Check passkeys and send email code in parallel
      const [passkeyResult, emailResult] = await Promise.all([
        checkPasskeyOptions(values.email),
        requestEmailVerification(values.email),
      ]);

      if (emailResult !== undefined) {
        if (passkeyResult.hasPasskeys && passkeyResult.challengeId && passkeyResult.options) {
          setPasskeyAvailable(true);
          setPasskeyChallenge({ challengeId: passkeyResult.challengeId, options: passkeyResult.options });
          setVerifyMethod('passkey');
        } else {
          setPasskeyAvailable(false);
          setPasskeyChallenge(null);
          setVerifyMethod('code');
        }
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

                      <Button type="submit" className="w-full mt-6" disabled={isSubmitting || discoverableLoading}>
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          'Send Verification Code'
                        )}
                      </Button>

                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">or</span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={handleDiscoverablePasskey}
                        disabled={isSubmitting || discoverableLoading}
                      >
                        {discoverableLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Authenticating...
                          </>
                        ) : (
                          <>
                            <Fingerprint className="mr-2 h-4 w-4" />
                            Sign in with Passkey
                          </>
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
                            setPasskeyAvailable(false);
                            setPasskeyChallenge(null);
                            setVerifyMethod('code');
                          }}
                          className="h-7 px-2 text-xs"
                          disabled={isSubmitting || passkeyLoading}
                        >
                          Change
                        </Button>
                      </div>

                      {passkeyAvailable && (
                        <div className="flex gap-1 mb-4">
                          <Button
                            type="button"
                            variant={verifyMethod === 'passkey' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setVerifyMethod('passkey')}
                            className="flex-1"
                          >
                            <Fingerprint className="h-4 w-4 mr-1.5" />
                            Passkey
                          </Button>
                          <Button
                            type="button"
                            variant={verifyMethod === 'code' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setVerifyMethod('code')}
                            className="flex-1"
                          >
                            <Mail className="h-4 w-4 mr-1.5" />
                            Email Code
                          </Button>
                        </div>
                      )}

                      {verifyMethod === 'code' ? (
                        <>
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
                      ) : (
                        <div className="space-y-4">
                          <p className="text-sm text-muted-foreground">
                            Use your passkey to sign in securely.
                          </p>
                          <Button
                            type="button"
                            className="w-full"
                            onClick={handlePasskeyLogin}
                            disabled={passkeyLoading}
                          >
                            {passkeyLoading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Authenticating...
                              </>
                            ) : (
                              <>
                                <Fingerprint className="mr-2 h-4 w-4" />
                                Sign in with Passkey
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
