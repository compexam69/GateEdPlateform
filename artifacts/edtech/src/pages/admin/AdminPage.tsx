import { AppLayout } from "@/components/layout/AppLayout";
import { Link } from "wouter";
import { Users, BookOpen, BarChart3, HelpCircle, Settings2, ShieldAlert, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function AdminPage() {
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";

  const adminSections = [
    { title: "User Management", desc: "Approve users, ban/reinstate, and reset progress.", href: "/admin/users", icon: Users, superAdminOnly: false },
    { title: "Content Editor", desc: "Manage subjects, chapters, and topics.", href: "/admin/subjects", icon: BookOpen, superAdminOnly: false },
    { title: "Quiz & Question Editor", desc: "Create quizzes, add questions, and generate QR video solutions.", href: "/admin/quizzes", icon: HelpCircle, superAdminOnly: false },
    { title: "Gate Configuration", desc: "Set passing score thresholds, retry limits, and storage caps.", href: "/admin/gate", icon: Settings2, superAdminOnly: false },
    { title: "Analytics & Storage", desc: "View platform usage, performance stats, and B2 storage monitor.", href: "/admin/analytics", icon: BarChart3, superAdminOnly: false },
    { title: "Rate Limit Monitor", desc: "Live view of active rate-limit windows and throttled users.", href: "/admin/rate-limits", icon: ShieldAlert, superAdminOnly: false },
    { title: "Content Access Control", desc: "Manage exam visibility per role and grant super admin access.", href: "/admin/content-access", icon: KeyRound, superAdminOnly: true },
  ].filter(s => !s.superAdminOnly || isSuperAdmin);

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Platform management and configuration.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {adminSections.map(section => (
            <Link key={section.href} href={section.href} className="block min-h-[100px] sm:min-h-0">
              <div className="h-full rounded-lg border border-border bg-card hover:border-primary transition-colors cursor-pointer group p-3 sm:p-5 flex flex-col gap-2.5 sm:gap-3">
                {/* Icon */}
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <section.icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <p className="text-sm sm:text-base font-semibold leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
                    {section.title}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-snug line-clamp-2 sm:line-clamp-3">
                    {section.desc}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
