import { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type GoogleSignInButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

export default function GoogleSignInButton({
  className,
  loading = false,
  disabled,
  ...props
}: GoogleSignInButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "h-11 w-full rounded-md border border-[#dadce0] bg-white px-4 text-[14px] font-medium text-[#3c4043] shadow-sm transition hover:bg-[#f8f9fa] disabled:cursor-not-allowed disabled:opacity-70",
        "flex items-center justify-center gap-3",
        className,
      )}
      style={{ fontFamily: "Roboto, Arial, sans-serif" }}
      {...props}
    >
      <span aria-hidden>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18">
          <path fill="#EA4335" d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.46 0 9 0 5.48 0 2.44 2.02.96 4.96l2.96 2.3C4.64 5.17 6.64 3.48 9 3.48z"/>
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.81 2.73l2.8 2.17C16.43 14.21 17.64 11.95 17.64 9.2z"/>
          <path fill="#FBBC05" d="M3.92 10.74a5.4 5.4 0 010-3.48l-2.96-2.3A8.96 8.96 0 000 9c0 1.45.35 2.82.96 4.04l2.96-2.3z"/>
          <path fill="#34A853" d="M9 18c2.46 0 4.53-.81 6.04-2.2l-2.8-2.17c-.78.52-1.77.83-3.24.83-2.36 0-4.36-1.69-5.08-3.96l-2.96 2.3C2.44 15.98 5.48 18 9 18z"/>
        </svg>
      </span>
      <span>{loading ? "Connecting..." : "Continue with Google"}</span>
    </button>
  );
}
