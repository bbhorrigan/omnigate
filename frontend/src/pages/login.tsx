import * as React from "react";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, ArrowRight, Eye, EyeOff, ShieldCheck, Loader2, KeyRound, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils"; // optional: shadcn utility; replace with classnames if not available
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// --- Utility ---
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function useDarkMode() {
  const [isDark, setIsDark] = useState(false);
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);
  return { isDark, setIsDark } as const;
}

// --- Mock API helpers (replace with your Omnigate endpoints) ---
async function discoverSso(email: string): Promise<{ provider?: string; redirectUrl?: string }> {
  // Example: POST /api/auth/discover -> { provider: "okta", redirectUrl: "https://idp.example.com/authorize?..." }
  try {
    const res = await fetch("/api/auth/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error("discovery_failed");
    return res.json();
  } catch {
    return {};
  }
}

async function loginPassword(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("invalid_credentials");
  return res.json();
}

async function sendMagicLink(email: string) {
  const res = await fetch("/api/auth/magic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error("magic_link_failed");
  return res.json();
}

async function beginPasskey(email?: string) {
  // Placeholder for WebAuthn. In a real app you'll fetch options from server first.
  // const options = await fetch("/api/auth/webauthn/options", { method: "POST", body: JSON.stringify({ email })});
  // const cred = await navigator.credentials.get({ publicKey: options });
  // send to server for verification
  return new Promise((resolve) => setTimeout(resolve, 900));
}

// --- Component ---
export default function OmnigateLogin() {
  const { isDark, setIsDark } = useDarkMode();
  const [step, setStep] = useState<"email" | "password" | "alt" | "done">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenant, setTenant] = useState("omni");

  const emailValid = useMemo(() => emailRegex.test(email), [email]);

  const onEmailContinue = async () => {
    setError(null);
    if (!emailValid) {
      setError("Enter a valid email.");
      return;
    }
    setLoading(true);
    const sso = await discoverSso(email);
    setLoading(false);
    if (sso.redirectUrl) {
      // If your discovery says this email is managed by an IdP, go there.
      window.location.href = sso.redirectUrl;
      return;
    }
    setStep("password");
  };

  const onPasswordLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginPassword(email, password);
      setStep("done");
    } catch (e: any) {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const onMagicLink = async () => {
    setError(null);
    setLoading(true);
    try {
      await sendMagicLink(email);
      setStep("done");
    } catch (e) {
      setError("Couldn’t send magic link.");
    } finally {
      setLoading(false);
    }
  };

  const onPasskey = async () => {
    setError(null);
    setLoading(true);
    try {
      await beginPasskey(email);
      setStep("done");
    } catch (e) {
      setError("Passkey sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      "min-h-screen w-full",
      "bg-[radial-gradient(60%_60%_at_50%_10%,rgba(59,130,246,0.15),transparent_60%),radial-gradient(40%_40%_at_80%_70%,rgba(34,197,94,0.12),transparent_60%)]",
      "dark:bg-[radial-gradient(60%_60%_at_50%_10%,rgba(96,165,250,0.2),transparent_60%),radial-gradient(40%_40%_at_80%_70%,rgba(52,211,153,0.18),transparent_60%)]",
      "flex items-center justify-center p-6"
    )}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Card className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 border-zinc-200/60 dark:border-zinc-800/60 shadow-xl rounded-2xl">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Sign in to Omnigate</CardTitle>
                  <CardDescription>Secure universal auth proxy</CardDescription>
                </div>
              </div>
              <Toggle
                aria-label="Toggle dark mode"
                pressed={isDark}
                onPressedChange={setIsDark}
                className="rounded-full"
              >
                {isDark ? <Moon /> : <Sun />}
              </Toggle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <TenantPicker tenant={tenant} setTenant={setTenant} />

            <AnimatePresence mode="wait">
              {step === "email" && (
                <motion.div
                  key="email-step"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <div className="grid gap-2">
                    <Label htmlFor="email">Work email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-9"
                        autoFocus
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
                  )}

                  <Button className="w-full" onClick={onEmailContinue} disabled={!emailValid || loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                    Continue
                  </Button>

                  <div className="text-xs text-muted-foreground text-center">
                    We’ll route you to your identity provider if your domain is managed.
                  </div>

                  <div className="flex items-center gap-2">
                    <Separator className="flex-1" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <Separator className="flex-1" />
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <Button variant="outline" onClick={onPasskey} disabled={loading}>
                      <KeyRound className="mr-2 h-4 w-4" /> Use a passkey
                    </Button>
                    <Button variant="outline" onClick={onMagicLink} disabled={!emailValid || loading}>
                      <Mail className="mr-2 h-4 w-4" /> Email me a magic link
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === "password" && (
                <motion.div
                  key="password-step"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-9 pr-10"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
                  )}

                  <Button className="w-full" onClick={onPasswordLogin} disabled={!password || loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                    Sign in
                  </Button>

                  <div className="text-xs text-muted-foreground text-center">
                    <button className="underline underline-offset-4" onClick={() => setStep("email")}>Use a different method</button>
                  </div>
                </motion.div>
              )}

              {step === "done" && (
                <motion.div
                  key="done-step"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4 text-center"
                >
                  <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                    <ShieldCheck className="h-5 w-5" />
                    <span>Authenticated. Redirecting…</span>
                  </div>
                  <div className="text-xs text-muted-foreground">You can safely close this window.</div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="text-xs text-muted-foreground text-center">
              By continuing, you agree to the <a className="underline underline-offset-4" href="#">Terms</a> and <a className="underline underline-offset-4" href="#">Privacy</a>.
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Omnigate</span>
        </div>
      </motion.div>
    </div>
  );
}

// --- Small Sun/Moon icons (avoid extra deps); you can swap with lucide-react icons if preferred ---
function Sun(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} {...props}>
      <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66 6.66 1.41 1.41M4.93 4.93 6.34 6.34m0 11.32-1.41 1.41m13.13-13.13-1.41 1.41" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}
function Moon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function TenantPicker({ tenant, setTenant }: { tenant: string; setTenant: (t: string) => void }) {
  const tenants = ["omni", "prod", "dev"]; // replace with your org/tenant list
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="text-muted-foreground">Environment</div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <span className="font-medium">{tenant}</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {tenants.map((t) => (
            <DropdownMenuItem key={t} onClick={() => setTenant(t)}>
              {t}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
