import { Request, Response, NextFunction } from 'express';

export const checkRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {

    if (!req.currentUser || !req.currentUser.role) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const userRole = req.currentUser.role;
    if (roles.includes(userRole)) {
      next();
    } else {
      res.status(403).json({ message: 'Forbidden: You do not have the required permissions.' });
    }
  };
};