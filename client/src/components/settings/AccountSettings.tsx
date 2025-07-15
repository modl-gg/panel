import React, { useState } from 'react';
import { CheckCircle, KeyRound, Fingerprint, QrCode, Copy, Check, LogOut } from 'lucide-react';
import { Button } from 'modl-shared-web/components/ui/button';
import { Input } from 'modl-shared-web/components/ui/input';
import { Label } from 'modl-shared-web/components/ui/label';
import { Separator } from 'modl-shared-web/components/ui/separator';
import { Badge } from 'modl-shared-web/components/ui/badge';
import { useToast } from 'modl-shared-web/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

interface AccountSettingsProps {
  profileUsername: string;
  setProfileUsername: (value: string) => void;
  currentEmail: string;
  setCurrentEmail: (value: string) => void;
}

const AccountSettings = ({
  profileUsername,
  setProfileUsername,
  currentEmail,
  setCurrentEmail
}: AccountSettingsProps) => {
  const { toast } = useToast();
  const { logout } = useAuth();
  
  // 2FA State
  const [has2FA, setHas2FA] = useState(false);
  const [showSetup2FA, setShowSetup2FA] = useState(false);
  const [recoveryCodesCopied, setRecoveryCodesCopied] = useState(false);
  
  // Passkey State
  const [hasPasskey, setHasPasskey] = useState(false);
  const [showSetupPasskey, setShowSetupPasskey] = useState(false);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Profile Information</h3>
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={profileUsername}
                onChange={(e) => setProfileUsername(e.target.value)}
                placeholder="Enter your username"
              />
              <p className="text-sm text-muted-foreground">
                This name will appear in ticket conversations and other interactions.
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span>Changes are saved automatically</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <Separator />
      
      <div>
        <h3 className="text-lg font-medium mb-4">Account Information</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email-address">Email Address</Label>
            <Input
              id="email-address"
              type="email"
              value={currentEmail}
              onChange={(e) => setCurrentEmail(e.target.value)}
              placeholder="Enter your email address"
            />
          </div>
          <Button
            onClick={() => {
              toast({
                title: "Work In Progress",
                description: "This feature is currently not available.",
              });
            }}
          >
            Change Email
          </Button>
        </div>
      </div>
      
      <Separator />
      
      <div>
        <h3 className="text-lg font-medium mb-4">Sign Out</h3>
        <p className="text-sm text-muted-foreground mb-4">
          You will be logged out of your current session.
        </p>
        <Button variant="destructive" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
      
      <Separator />
      
      <div>
        <h3 className="text-lg font-medium mb-4">Account Security</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Enhance your account security by enabling multi-factor authentication methods.
        </p>

        <div className="space-y-8">
          {/* Two-Factor Authentication */}
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-base font-medium flex items-center">
                  <KeyRound className="h-4 w-4 mr-2" />
                  Two-Factor Authentication (2FA)
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Add an extra layer of security by requiring a verification code from your authentication app.
                </p>
              </div>
              <div className="flex items-center">
                {has2FA ? (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Enabled</Badge>
                ) : (
                  <Button
                    onClick={() => {
                      toast({
                        title: "Work In Progress",
                        description: "This feature is currently not available.",
                      });
                      // setShowSetup2FA(true)
                    }}
                    size="sm"
                  >
                    Set up 2FA
                  </Button>
                )}
              </div>
            </div>

            {showSetup2FA && (
              <div className="bg-muted/50 p-5 rounded-lg space-y-4 mt-2">
                <h5 className="font-medium">Set up Two-Factor Authentication</h5>

                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center space-y-3 p-4 bg-background rounded-md">
                    <div className="w-44 h-44 bg-white p-2 rounded-md flex items-center justify-center">
                      {/* This would typically be a real QR code generated from a 2FA secret */}
                      <QrCode className="w-36 h-36 text-primary" />
                    </div>
                    <p className="text-xs text-center text-muted-foreground mt-2">
                      Scan this QR code with your authentication app (Google Authenticator, Authy, etc.)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="backup-code">Secret Key (if you can't scan the QR code)</Label>
                    <div className="relative">
                      <Input
                        id="backup-code"
                        value="HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ"
                        readOnly
                        className="pr-10"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-8 w-8"
                        onClick={() => {
                          navigator.clipboard.writeText("HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ");
                          toast({
                            title: "Copied to clipboard",
                            description: "Secret key copied to clipboard"
                          });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="verification-code">Enter verification code to confirm</Label>
                    <Input
                      id="verification-code"
                      placeholder="Enter 6-digit code"
                      inputMode="numeric"
                      maxLength={6}
                    />
                  </div>

                  {!recoveryCodesCopied ? (
                    <div className="space-y-2">
                      <Label>Recovery Codes</Label>
                      <div className="bg-background p-3 rounded-md text-xs font-mono grid grid-cols-2 gap-2">
                        <div>1. ABCD-EFGH-IJKL-MNOP</div>
                        <div>2. QRST-UVWX-YZ12-3456</div>
                        <div>3. 7890-ABCD-EFGH-IJKL</div>
                        <div>4. MNOP-QRST-UVWX-YZ12</div>
                        <div>5. 3456-7890-ABCD-EFGH</div>
                        <div>6. IJKL-MNOP-QRST-UVWX</div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Save these recovery codes in a secure place. They can be used to access your account if you lose your authentication device.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          const codes = [
                            "ABCD-EFGH-IJKL-MNOP",
                            "QRST-UVWX-YZ12-3456",
                            "7890-ABCD-EFGH-IJKL",
                            "MNOP-QRST-UVWX-YZ12",
                            "3456-7890-ABCD-EFGH",
                            "IJKL-MNOP-QRST-UVWX"
                          ].join("\n");
                          navigator.clipboard.writeText(codes);
                          setRecoveryCodesCopied(true);
                          toast({
                            title: "Recovery codes copied",
                            description: "Please store them in a secure location"
                          });
                        }}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Recovery Codes
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-green-50 border border-green-200 rounded-md p-3">
                      <div className="flex items-start">
                        <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-green-800">Recovery codes copied</p>
                          <p className="text-xs text-green-700">
                            Make sure to store them in a secure location. You'll need them if you lose access to your authenticator app.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowSetup2FA(false);
                        setRecoveryCodesCopied(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        setHas2FA(true);
                        setShowSetup2FA(false);
                        toast({
                          title: "2FA Enabled",
                          description: "Two-factor authentication has been enabled for your account",
                        });
                      }}
                      disabled={!recoveryCodesCopied}
                    >
                      Enable 2FA
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Passkey Authentication */}
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-base font-medium flex items-center">
                  <Fingerprint className="h-4 w-4 mr-2" />
                  Passkey Authentication
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Use biometrics or hardware security keys as a passwordless authentication method.
                </p>
              </div>
              <div className="flex items-center">
                {hasPasskey ? (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Enabled</Badge>
                ) : (
                  <Button
                    onClick={() => {
                      toast({
                        title: "Work In Progress",
                        description: "This feature is currently not available.",
                      });
                      // setShowSetupPasskey(true)
                    }}
                    size="sm"
                  >
                    Set up Passkey
                  </Button>
                )}
              </div>
            </div>

            {showSetupPasskey && (
              <div className="bg-muted/50 p-5 rounded-lg space-y-4 mt-2">
                <h5 className="font-medium">Set up Passkey Authentication</h5>

                <div className="flex flex-col items-center justify-center gap-4 p-6 bg-background rounded-lg">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                    <Fingerprint className="h-10 w-10 text-primary" />
                  </div>
                  <div className="text-center">
                    <h4 className="font-medium">Register a passkey</h4>
                    <p className="text-sm text-muted-foreground max-w-sm mt-1">
                      Your device will prompt you to use your biometrics (fingerprint, face) or
                      security key to create a passkey for this account.
                    </p>
                  </div>

                  <div className="bg-primary/5 rounded-md p-4 w-full">
                    <h5 className="text-sm font-medium mb-2">Compatible with:</h5>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• Windows Hello</li>
                      <li>• Apple Touch ID / Face ID</li>
                      <li>• Android fingerprint</li>
                      <li>• FIDO2 security keys (YubiKey, etc.)</li>
                    </ul>
                  </div>
                </div>

                <div className="flex justify-between mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setShowSetupPasskey(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      toast({
                        title: "FIDO Authentication",
                        description: "Your browser would prompt for biometric verification here",
                      });

                      // After successful registration
                      setTimeout(() => {
                        setHasPasskey(true);
                        setShowSetupPasskey(false);
                        toast({
                          title: "Passkey Registered",
                          description: "You can now sign in using your passkey"
                        });
                      }, 1500);
                    }}
                  >
                    Register Passkey
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSettings;