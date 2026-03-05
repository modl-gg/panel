import React, { useState, useEffect, useCallback } from 'react';
import { Fingerprint, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@modl-gg/shared-web/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@modl-gg/shared-web/components/ui/alert-dialog';
import { getApiUrl, getCurrentDomain } from '@/lib/api';

interface Credential {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string;
}

async function passkeyFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(getApiUrl(url), {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
      'X-Server-Domain': getCurrentDomain(),
      'Content-Type': 'application/json',
    },
  });
}

const PasskeySettings = () => {
  const { toast } = useToast();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [pendingChallengeId, setPendingChallengeId] = useState<string | null>(null);
  const [pendingResponse, setPendingResponse] = useState<string | null>(null);
  const [credentialName, setCredentialName] = useState('');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Credential | null>(null);
  const [renameName, setRenameName] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await passkeyFetch('/v1/panel/auth/webauthn/credentials');
      if (res.ok) {
        setCredentials(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const handleAddPasskey = async () => {
    setRegistering(true);
    try {
      const optionsRes = await passkeyFetch('/v1/panel/auth/webauthn/register/options', { method: 'POST' });
      if (!optionsRes.ok) {
        toast({ title: 'Error', description: 'Failed to start passkey registration', variant: 'destructive' });
        return;
      }

      const { challengeId, options } = await optionsRes.json();
      const attResp = await startRegistration({ optionsJSON: JSON.parse(options) });

      setPendingChallengeId(challengeId);
      setPendingResponse(JSON.stringify(attResp));
      setCredentialName('');
      setNameDialogOpen(true);
    } catch (e: any) {
      if (e.name !== 'NotAllowedError') {
        toast({ title: 'Error', description: 'Passkey registration was cancelled or failed', variant: 'destructive' });
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleFinishRegistration = async () => {
    if (!pendingChallengeId || !pendingResponse) return;

    try {
      const res = await passkeyFetch('/v1/panel/auth/webauthn/register/verify', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: pendingChallengeId,
          response: pendingResponse,
          name: credentialName || 'Passkey',
        }),
      });

      if (res.ok) {
        toast({ title: 'Passkey added', description: 'Your passkey has been registered successfully' });
        fetchCredentials();
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to register passkey', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to register passkey', variant: 'destructive' });
    } finally {
      setNameDialogOpen(false);
      setPendingChallengeId(null);
      setPendingResponse(null);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameName.trim()) return;

    try {
      const res = await passkeyFetch(`/v1/panel/auth/webauthn/credentials/${renameTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: renameName.trim() }),
      });

      if (res.ok) {
        toast({ title: 'Passkey renamed' });
        fetchCredentials();
      } else {
        toast({ title: 'Error', description: 'Failed to rename passkey', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to rename passkey', variant: 'destructive' });
    } finally {
      setRenameDialogOpen(false);
      setRenameTarget(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      const res = await passkeyFetch(`/v1/panel/auth/webauthn/credentials/${deleteTarget.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast({ title: 'Passkey removed' });
        fetchCredentials();
      } else {
        toast({ title: 'Error', description: 'Failed to remove passkey', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to remove passkey', variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  return (
    <div className="space-y-4 p-2 pt-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-base font-medium">Passkeys</h3>
        </div>
        <Button variant="outline" size="sm" onClick={handleAddPasskey} disabled={registering}>
          {registering ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Add passkey
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : credentials.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No passkeys registered. Add a passkey to sign in without email codes.
        </p>
      ) : (
        <div className="space-y-2">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex items-center gap-3">
                <Fingerprint className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">{cred.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Added {formatDate(cred.createdAt)} · Last used {formatDate(cred.lastUsedAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setRenameTarget(cred);
                    setRenameName(cred.name);
                    setRenameDialogOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => {
                    setDeleteTarget(cred);
                    setDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Name dialog after registration */}
      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name your passkey</DialogTitle>
            <DialogDescription>
              Give this passkey a name to help you identify it later.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={credentialName}
            onChange={(e) => setCredentialName(e.target.value)}
            placeholder="e.g. MacBook Pro, YubiKey"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFinishRegistration();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleFinishRegistration}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename passkey</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove passkey</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{deleteTarget?.name}"? You won't be able to use it to sign in anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PasskeySettings;
