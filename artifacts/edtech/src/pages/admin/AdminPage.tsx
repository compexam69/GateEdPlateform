import { AppLayout } from "@/components/layout/AppLayout";
import { Link } from "wouter";
import { Users, BookOpen, BarChart3, HelpCircle, Settings2, ShieldAlert, KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

export default function AdminPage() {
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";

  const adminSections = [
    { title: "User Management", desc: "Approve users, ban/reinstate, and reset progress.", href: "/admin/users", icon: Users, superAdminOnly: false },
    { title: "Content Editor", desc: "Manage subjects, chapters, and topics.", href: "/admin/subjects", icon: BookOpen, superAdminOnly: false },
    { title: "Quiz & Question Editor", desc: "Create quizzes, add questions, and generate QR video solutions.", href: "/admin/quizzes", icon: HelpCircle, superAdminOnly: false },
    { title: "Gate Configuration", desc: "Set passing score thresholds, retry limits, and storage caps. No code changes required.", href: "/admin/gate", icon: Settings2, superAdminOnly: false },
    { title: "Analytics & Storage", desc: "View platform usage, performance stats, and B2 storage monitor.", href: "/admin/analytics", icon: BarChart3, superAdminOnly: false },
    { title: "Rate Limit Monitor", desc: "Live view of active rate-limit windows. See who is throttled and when their block clears.", href: "/admin/rate-limits", icon: ShieldAlert, superAdminOnly: false },
    { title: "Content Access Control", desc: "Manage exam visibility per role and grant other super admins access to your content.", href: "/admin/content-access", icon: KeyRound, superAdminOnly: true },
  ].filter(s => !s.superAdminOnly || isSuperAdmin);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Platform management and configuration.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {adminSections.map(section => (
            <Link key={section.href} href={section.href}>
              <Card className="bg-card hover:border-primary transition-colors cursor-pointer group h-full">
                <CardHeader>
                  <section.icon className="w-8 h-8 text-primary mb-2" />
                  <CardTitle>{section.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{section.desc}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
