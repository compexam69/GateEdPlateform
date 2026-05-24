import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link } from "wouter";
import { ArrowLeft, Lock, CheckCircle, ChevronRight, PlayCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ChapterDetailPage() {
  const { chapterId } = useParams<{ chapterId: string }>();

  // Mock data since we need topic progress from API
  const topics = [
    { id: "1", title: "Introduction", status: "completed" },
    { id: "2", title: "Core Concepts", status: "unlocked" },
    { id: "3", title: "Advanced Applications", status: "locked" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Chapter Topics</h1>
            <p className="text-muted-foreground mt-1">Complete topics in order to unlock the next one.</p>
          </div>
        </div>

        <div className="space-y-4">
          {topics.map((topic, idx) => {
            const isLocked = topic.status === "locked";
            const isCompleted = topic.status === "completed";
            
            return (
              <Card key={topic.id} className={`bg-card transition-colors ${isLocked ? "opacity-60" : "hover:border-primary cursor-pointer group"}`}>
                <Link href={isLocked ? "#" : `/topics/${topic.id}`}>
                  <CardContent className="p-4 flex items-center space-x-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      isCompleted ? "bg-success/10 text-success" : 
                      isLocked ? "bg-muted text-muted-foreground" : 
                      "bg-primary/10 text-primary"
                    }`}>
                      {isCompleted ? <CheckCircle className="w-5 h-5" /> : 
                       isLocked ? <Lock className="w-5 h-5" /> : 
                       <PlayCircle className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{topic.title}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Topic {idx + 1}</p>
                    </div>
                    {!isLocked && <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />}
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
