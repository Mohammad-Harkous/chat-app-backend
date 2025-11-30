import { User } from '../users/entities/user.entity';

declare global {
  namespace Express {
    /**
     * Extended Request interface to include user property
     * This property is set by Passport's JWT strategy after successful authentication
     */
    interface Request {
      /**
       * Authenticated user object
       * Available on protected routes when using JwtAuthGuard
       */
      user?: User;
    }
  }
}

// This export is required to make this file a module
// Without it, the global declaration won't work
export {};