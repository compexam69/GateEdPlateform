import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, BookOpen, CheckCircle, XCircle } from "lucide-react";

const registerSchema = z.object({
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .regex(/^[a-zA-Z\s]+$/, "Full name must contain only letters and spaces"),
  mobile: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Must be a valid 10-digit number starting with 6–9"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "Must contain uppercase letter")
    .regex(/[a-z]/, "Must contain lowercase letter")
    .regex(/[0-9]/, "Must contain a number")
    .regex(/[^A-Za-z0-9]/, "Must contain a special character"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type FormValues = z.infer<typeof registerSchema>;

function PasswordStrengthIndicator({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", valid: password.length >= 8 },
    { label: "Uppercase letter", valid: /[A-Z]/.test(password) },
    { label: "Lowercase letter", valid: /[a-z]/.test(password) },
    { label: "Number", valid: /[0-9]/.test(password) },
    { label: "Special character", valid: /[^A-Za-z0-9]/.test(password) },
  ];

  const score = checks.filter(c => c.valid).length;
  const strengthColors = ["bg-destructive", "bg-destructive", "bg-warning", "bg-warning", "bg-success"];
  const strengthLabels = ["Very Weak", "Weak", "Fair", "Good", "Strong"];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {checks.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all ${i < score ? strengthColors[score - 1] : "bg-muted"}`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${score >= 4 ? "text-success" : score >= 3 ? "text-warning" : "text-destructive"}`}>
        {password ? strengthLabels[score - 1] || "Very Weak" : ""}
      </p>
      <div className="grid grid-cols-2 gap-1">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-1.5">
            {check.valid
              ? <CheckCircle className="w-3 h-3 text-success shrink-0" />
              : <XCircle className="w-3 h-3 text-muted-foreground shrink-0" />}
            <span className={`text-xs ${check.valid ? "text-success" : "text-muted-foreground"}`}>{check.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const { signUp } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      mobile: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      const { error } = await signUp({
        email: values.email,
        password: values.password,
        options: {
          data: {
            full_name: values.fullName,
            mobile_number: `+91${values.mobile}`,
            role: "student",
          },
        },
      });
      if (error) throw error;
      toast({
        title: "Account created!",
        description: "Please check your email to verify your account. You'll need admin approval to access the platform.",
      });
      setLocation("/login");
    } catch (error: unknown) {
      toast({ title: "Registration Failed", description: (error as Error).message || "Failed to register", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const allValid = form.formState.isValid;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Create your account</h2>
          <p className="text-muted-foreground mt-2">Join thousands of students preparing for JEE, NEET & GATE</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Rahul Sharma" autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mobile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mobile Number</FormLabel>
                  <FormControl>
                    <div className="flex">
                      <div className="flex items-center px-3 border border-r-0 border-input bg-muted rounded-l-md text-muted-foreground text-sm font-medium">
                        +91
                      </div>
                      <Input
                        className="rounded-l-none"
                        placeholder="9876543210"
                        maxLength={10}
                        autoComplete="tel"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Create a strong password"
                        autoComplete="new-password"
                        {...field}
                        onChange={(e) => { field.onChange(e); setPasswordValue(e.target.value); }}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword(v => !v)}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <PasswordStrengthIndicator password={passwordValue} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showConfirm ? "text" : "password"}
                        placeholder="Repeat your password"
                        autoComplete="new-password"
                        {...field}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowConfirm(v => !v)}
                        tabIndex={-1}
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full h-11 mt-2" disabled={loading || !allValid}>
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </Form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
