import { AppLayout } from "@/components/layout/AppLayout";
import { useGetSubject, getGetSubjectQueryKey, useGetChapters, getGetChaptersQueryKey } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { BookOpen, ChevronRight, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>();

  const { data: subject, isLoading: subjectLoading } = useGetSubject(subjectId!, {
    query: { enabled: !!subjectId, queryKey: getGetSubjectQueryKey(subjectId!) }
  });

  const { data: chapters, isLoading: chaptersLoading } = useGetChapters(subjectId!, {
    query: { enabled: !!subjectId, queryKey: getGetChaptersQueryKey(subjectId!) }
  });

  const isLoading = subjectLoading || chaptersLoading;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/subjects">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{subject?.title || "Subject"}</h1>
            <p className="text-muted-foreground mt-1">{subject?.description || "Select a chapter to continue"}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4">
            {chapters?.map((chapter, idx) => (
              <Link key={chapter.id} href={`/chapters/${chapter.id}`}>
                <Card className="hover:border-primary transition-colors cursor-pointer bg-card group">
                  <CardContent className="p-4 flex items-center space-x-4">
                    <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center shrink-0 text-secondary font-medium">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold">{chapter.title}</h3>
                      {chapter.description && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5">{chapter.description}</p>
                      )}
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
