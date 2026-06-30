export type Role = 'ADMIN' | 'AGENT' | 'COMPTABLE' | 'SUPERVISEUR';

export interface User {
  id: string;
  username: string;
  email: string;
  phoneNumber: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface OtpSentPayload {
  maskedPhone: string;
}

export interface AuthPayload {
  accessToken: string;
  expiresIn: number;
  user: User;
}
