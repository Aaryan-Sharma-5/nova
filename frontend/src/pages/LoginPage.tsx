import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { CirclePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { UserRole } from "@/types/auth";

function getLandingPath(role: UserRole): string {
  return role === "employee" ? "/your-data" : "/org-health";
}

export default function LoginPage() {
  useDocumentTitle("NOVA — Sign In");
  const { login, signInWithGoogle, completeGoogleSignIn, isAuthenticated, isLoading, user } = useAuth();

  const isGoogleConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
  const [email, setEmail] = useState("hr.admin@company.com");
  const [password, setPassword] = useState("secret");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const redirectPath = (location.state as { from?: string } | null)?.from ?? "/";

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("oauth") !== "google") return;

    let mounted = true;
    const run = async () => {
      setOauthLoading(true);
      setError(null);
      try {
        const signedInUser = await completeGoogleSignIn();
        navigate(redirectPath === "/" ? getLandingPath(signedInUser.role) : redirectPath, { replace: true });
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Google sign-in failed");
        }
      } finally {
        if (mounted) {
          setOauthLoading(false);
        }
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [completeGoogleSignIn, location.search, navigate, redirectPath]);

  if (isAuthenticated && !isLoading) {
    const landingPath = redirectPath === "/" ? getLandingPath(user?.role ?? "hr") : redirectPath;
    return <Navigate to={landingPath} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const signedInUser = await login(email, password);
      navigate(redirectPath === "/" ? getLandingPath(signedInUser.role) : redirectPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-[#fffff8] px-6 py-24 text-[#111111]">
      <Link
        to="/"
        className="absolute left-6 top-6 inline-flex items-center gap-2 text-base font-black tracking-tight text-[#111111]"
      >
        <CirclePlus className="h-5 w-5 text-[#F5C518]" strokeWidth={2.2} />
        <span>NOVA</span>
      </Link>

      <div className="mx-auto w-full max-w-[460px] border-[3px] border-black bg-white p-8 shadow-[8px_8px_0_#000] sm:p-10">
        <h1 className="text-3xl font-black">Sign In</h1>
        <p className="mt-2 text-sm font-medium text-[#525252]">
          Access your role-based workforce intelligence dashboard.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <GoogleSignInButton
            onClick={async () => {
              if (!isGoogleConfigured) return;
              setError(null);
              setOauthLoading(true);
              try {
                await signInWithGoogle();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Google sign-in failed");
                setOauthLoading(false);
              }
            }}
            loading={oauthLoading}
            disabled={!isGoogleConfigured}
            className="h-12 rounded-none border-2 border-black text-[#1f2937] shadow-none"
          />

          {!isGoogleConfigured && (
            <p className="text-xs font-medium text-[#6b7280]">Google sign-in is not configured in this local environment.</p>
          )}

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t-2 border-black" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-[11px] font-black tracking-[0.15em] text-[#4b5563]">OR CONTINUE WITH EMAIL</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="hr.admin@company.com"
              autoComplete="email"
              required
              className="h-12 rounded-none border-2 border-black bg-white text-sm shadow-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="h-12 rounded-none border-2 border-black bg-white text-sm shadow-none"
            />
          </div>

          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

          <button
            type="submit"
            className="h-12 w-full border-2 border-black bg-[#F5C518] text-sm font-black text-black transition-colors hover:bg-[#ebbc08] disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-sm text-[#4b5563]">
          New here?{" "}
          <Link to="/register" className="font-semibold text-black underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
