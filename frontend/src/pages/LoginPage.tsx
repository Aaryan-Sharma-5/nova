import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";

export default function LoginPage() {
  const { login, signInWithGoogle, completeGoogleSignIn, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState("hr.admin@company.com");
  const [password, setPassword] = useState("secret");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const redirectPath = (location.state as { from?: string } | null)?.from ?? "/";

  if (isAuthenticated && !isLoading) {
    return <Navigate to={redirectPath} replace />;
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("oauth") !== "google") {
      return;
    }

    let mounted = true;
    const run = async () => {
      setOauthLoading(true);
      setError(null);
      try {
        await completeGoogleSignIn();
        navigate(redirectPath, { replace: true });
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      navigate(redirectPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>Login to access role-based NOVA endpoints and dashboards.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <GoogleSignInButton
              onClick={async () => {
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
            />

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or continue with email</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="hr.admin@company.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="secret"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive font-semibold">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-4 text-sm text-muted-foreground">
            New here? <Link to="/register" className="underline text-foreground">Create an account</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
