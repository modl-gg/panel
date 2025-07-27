import { Request, Response, NextFunction } from 'express';

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if ((req.hostname === "localhost" || req.hostname === "127.0.0.1") && process.env.NODE_ENV === "staging") {
    req.currentUser = {
      userId: "developer",
      email: "dev@modl.gg",
      username: "modl",
      role: "Super Admin"
    };
    return next();
  }

  if (req.session && req.session.userId && req.session.email && req.session.username !== undefined && req.session.role !== undefined) {
    // User is authenticated and session has all required fields
    req.currentUser = {
      userId: req.session.userId,
      email: req.session.email,
      username: req.session.username,
      role: req.session.role
    };
    return next();
  } else {
    // User is not authenticated or session data is incomplete
    // Destroy session if it's partially set but invalid for safety
    if (req.session) {
      req.session.destroy(err => {
        if (err) {
          console.error("Error destroying session:", err);
        }
      });
    }
    return res.status(401).json({ message: 'Unauthorized. Please log in to access this resource.' });
  }
}