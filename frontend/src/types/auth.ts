export type UserRole = "employee" | "manager" | "hr" | "leadership";

export interface AuthUser {
  email: string;
  full_name: string;
  role: UserRole;
  disabled?: boolean;
  avatar_url?: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface RegisterPayload {
  email: string;
  full_name: string;
  password: string;
  role: UserRole;
}
