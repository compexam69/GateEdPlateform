import { AppLayout } from "@/components/layout/AppLayout";
import { useGetSubjects, getGetSubjectsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { BookOpen, ChevronRight, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function SubjectsPage() {
  const { data: subjects, isLoading } = useGetSubjects({
    query: { queryKey: getGetSubjectsQueryKey() }
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Learning Path</h1>
          <p className="text-muted-foreground mt-2">Select a subject to begin your mastery journey.</p>
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {subjects?.map((subject) => (
              <Link key={subject.id} href={`/subjects/${subject.id}`}>
                <Card className="hover:border-primary transition-colors cursor-pointer bg-card group h-full">
                  <CardContent className="p-6 flex items-start space-x-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <BookOpen className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg truncate">{subject.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {subject.description || "Start learning " + subject.title}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
