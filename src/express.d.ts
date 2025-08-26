import { User } from "@prisma/client";

// Interface for authenticated user data (what gets attached to req.user)
export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  role: string;
  isActive: boolean;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  province: string;
  city: string;
  institution: string;
  isStudent: boolean;
  location: string;
  avatar?: string;
  bio?: string;
  dateOfBirth?: Date;
  gender?: string;
  permissions: string[];
  refreshToken?: string;
  refreshTokenExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
