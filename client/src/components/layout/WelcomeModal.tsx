import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
  } from "modl-shared-web/components/ui/dialog";
  import { Button } from "modl-shared-web/components/ui/button";
  
  interface WelcomeModalProps {
    isOpen: boolean;
    onClose: () => void;
  }
  
  export function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Welcome to modl!</DialogTitle>
            <DialogDescription>
              It looks like this is your first time here. Here are some tips to get you started.
            </DialogDescription>
          </DialogHeader>
          <div>
            <p>🖥️ Start by installing the modl plugin for your platform with the API-Key found on the settings page.</p>
            <br />
            <p>👨‍👨‍👦‍👦 You can invite team members, customize your experience, and setup 2FA in the settings page.</p>
            <br />
            <p>🐛 We are still beta testing so please report all bugs to us at discord.modl.gg or support@modl.gg</p>
          </div>
          <DialogFooter>
            <Button onClick={onClose}>Got it!</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }