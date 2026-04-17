import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/auth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

function getLandingPath(role: UserRole): string {
  return role === "employee" ? "/your-data" : "/org-health";
}

export default function RegisterPage() {
  useDocumentTitle('NOVA — Create Account');
  const { register, isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    password: "",
    role: "employee" as UserRole,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated && !isLoading) {
    return <Navigate to={getLandingPath(user?.role ?? formData.role)} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const user = await register(formData);
      navigate(getLandingPath(user.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Create Account</CardTitle>
          <CardDescription>Register a NOVA user and continue directly into the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Full Name</label>
                <Input
                  value={formData.full_name}
                  onChange={(event) => setFormData((prev) => ({ ...prev, full_name: event.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Email</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Password</label>
              <Input
                type="password"
                value={formData.password}
                onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Role</label>
              <select
                className="flex h-11 w-full border-2 border-foreground bg-card px-4 py-2 text-sm"
                value={formData.role}
                onChange={(event) => setFormData((prev) => ({ ...prev, role: event.target.value as UserRole }))}
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="hr">HR</option>
                <option value="leadership">Leadership</option>
              </select>
            </div>

            {error && (
              <p className="text-sm text-destructive font-semibold">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating account..." : "Create Account"}
            </Button>
          </form>

          <div className="mt-4 text-sm text-muted-foreground">
            Already have an account? <Link to="/login" className="underline text-foreground">Sign in</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
