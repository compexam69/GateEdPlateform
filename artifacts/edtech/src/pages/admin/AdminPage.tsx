import { AppLayout } from "@/components/layout/AppLayout";
import { Link } from "wouter";
import { Users, BookOpen, BarChart3, HelpCircle, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminPage() {
  const adminSections = [
    { title: "User Management", desc: "Approve users, ban/reinstate, and reset progress.", href: "/admin/users", icon: Users },
    { title: "Content Editor", desc: "Manage subjects, chapters, and topics.", href: "/admin/subjects", icon: BookOpen },
    { title: "Quiz & Question Editor", desc: "Create quizzes, add questions, and generate QR video solutions.", href: "/admin/quizzes", icon: HelpCircle },
    { title: "Gate Configuration", desc: "Set passing score thresholds, retry limits, and storage caps. No code changes required.", href: "/admin/gate", icon: Settings2 },
    { title: "Analytics & Storage", desc: "View platform usage, performance stats, and B2 storage monitor.", href: "/admin/analytics", icon: BarChart3 },
  ];

  return (
    <AppLayout requireAdmin>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
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
