import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
  } from "@modl-gg/shared-web/components/ui/dialog";
  import { Button } from "@modl-gg/shared-web/components/ui/button";
  import { MODL } from "@modl-gg/shared-web";
  import { useTranslation } from 'react-i18next';

  interface WelcomeModalProps {
    isOpen: boolean;
    onClose: () => void;
  }

  export function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
    const { t } = useTranslation();
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('modals.welcome.title')}</DialogTitle>
            <DialogDescription>
              {t('modals.welcome.description')}
            </DialogDescription>
          </DialogHeader>
          <div>
            <p>{t('modals.welcome.installPlugin')}</p>
            <br />
            <p>{t('modals.welcome.inviteTeam')}</p>
            <br />
            <p>
              {t('modals.welcome.docsBefore')}{' '}
              <a href={import.meta.env.VITE_DOCS_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {t('modals.welcome.docsLink')}
              </a>{' '}
              {t('modals.welcome.docsAfter')}
            </p>
            <br />
            <p>{t('modals.welcome.bugReport', { discord: MODL.Discord.SHORT_URL, email: MODL.Email.SUPPORT })}</p>
          </div>
          <DialogFooter>
            <Button onClick={onClose}>{t('modals.welcome.gotIt')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }