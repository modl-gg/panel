import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        toast({ title: t('toast.error'), description: t('settings.passkey.startRegistrationFailed'), variant: 'destructive' });
        return;
      }

      const { challengeId, options } = await optionsRes.json();
      const attResp = await startRegistration({ optionsJSON: options?.publicKey ?? options });

      setPendingChallengeId(challengeId);
      setPendingResponse(JSON.stringify(attResp));
      setCredentialName('');
      setNameDialogOpen(true);
    } catch (e: any) {
      if (e.name !== 'NotAllowedError') {
        console.error('Passkey registration error:', e);
        toast({ title: t('toast.error'), description: t('settings.passkey.registrationCancelledOrFailed'), variant: 'destructive' });
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
          name: credentialName || t('settings.passkey.defaultPasskeyName'),
        }),
      });

      if (res.ok) {
        toast({ title: t('settings.passkey.passkeyAdded'), description: t('settings.passkey.passkeyRegisteredDesc') });
        fetchCredentials();
      } else {
        const data = await res.json();
        toast({ title: t('toast.error'), description: data.error || t('settings.passkey.registerFailed'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('toast.error'), description: t('settings.passkey.registerFailed'), variant: 'destructive' });
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
        toast({ title: t('settings.passkey.passkeyRenamed') });
        fetchCredentials();
      } else {
        toast({ title: t('toast.error'), description: t('settings.passkey.renameFailed'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('toast.error'), description: t('settings.passkey.renameFailed'), variant: 'destructive' });
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
        toast({ title: t('settings.passkey.passkeyRemoved') });
        fetchCredentials();
      } else {
        toast({ title: t('toast.error'), description: t('settings.passkey.removeFailed'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('toast.error'), description: t('settings.passkey.removeFailed'), variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return t('settings.passkey.never');
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  return (
    <div className="space-y-4 p-2 pt-0">
      <div className="flex items-center gap-3">
        <Fingerprint className="h-4 w-4 text-muted-foreground shrink-0" />
        <h3 className="text-base font-medium">{t('settings.passkey.passkeys')}</h3>
        <Button variant="outline" size="sm" onClick={handleAddPasskey} disabled={registering}>
          {registering ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          {t('settings.passkey.addPasskey')}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : credentials.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('settings.passkey.noPasskeys')}
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
                    {t('settings.passkey.addedDate', { date: formatDate(cred.createdAt) })} · {t('settings.passkey.lastUsed', { date: formatDate(cred.lastUsedAt) })}
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
            <DialogTitle>{t('settings.passkey.nameYourPasskey')}</DialogTitle>
            <DialogDescription>
              {t('settings.passkey.nameYourPasskeyDesc')}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={credentialName}
            onChange={(e) => setCredentialName(e.target.value)}
            placeholder={t('settings.passkey.passkeyNamePlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFinishRegistration();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleFinishRegistration}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.passkey.renamePasskey')}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleRename}>{t('settings.passkey.rename')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.passkey.removePasskey')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.passkey.removePasskeyConfirm', { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('common.remove')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PasskeySettings;
