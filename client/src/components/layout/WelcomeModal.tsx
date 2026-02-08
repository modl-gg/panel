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

  interface WelcomeModalProps {
    isOpen: boolean;
    onClose: () => void;
  }

  export function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Welcome to modl.gg!</DialogTitle>
            <DialogDescription>
              It looks like this is your first time here. Here are some tips to get you started.
            </DialogDescription>
          </DialogHeader>
          <div>
            <p>🖥️ Start by installing the modl.gg plugin for your platform. Configure the API-Key found on the settings page.</p>
            <br />
            <p>👨‍👨‍👦‍👦 You can invite team members, customize your experience, and setup 2FA in the settings page.</p>
            <br />
            <p>📖 Check out our <a href={import.meta.env.VITE_DOCS_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">documentation</a> for guides and setup instructions.</p>
            <br />
            <p>🐛 We are still beta testing so please report all bugs to us at {MODL.Discord.SHORT_URL} or {MODL.Email.SUPPORT}</p>
          </div>
          <DialogFooter>
            <Button onClick={onClose}>Got it!</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }