import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link } from "wouter";
import { ArrowLeft, PlayCircle, FileText, CheckSquare, Target, Lock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function TopicDetailPage() {
  const { topicId } = useParams<{ topicId: string }>();

  // Mock progress state
  const steps = [
    { id: "lecture", title: "Watch Lecture", icon: PlayCircle, status: "completed", action: "Open in Telegram" },
    { id: "quiz", title: "Lecture Quiz", icon: CheckSquare, status: "unlocked", action: "Start Quiz" },
    { id: "dpp", title: "Daily Practice Problem", icon: FileText, status: "locked", action: "Start DPP" },
    { id: "pyq", title: "Previous Year Questions", icon: Target, status: "locked", action: "Start PYQs" },
    { id: "test", title: "Topic Test", icon: CheckSquare, status: "locked", action: "Start Test" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Topic Details</h1>
            <p className="text-muted-foreground mt-1">Complete each step to master this topic.</p>
          </div>
        </div>

        <div className="relative space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isCompleted = step.status === "completed";
            const isLocked = step.status === "locked";
            const isUnlocked = step.status === "unlocked";

            return (
              <div key={step.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10 ${
                  isCompleted ? "bg-success text-success-foreground" : 
                  isUnlocked ? "bg-primary text-primary-foreground" : 
                  "bg-muted text-muted-foreground"
                }`}>
                  {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : 
                   isLocked ? <Lock className="w-4 h-4" /> : 
                   <Icon className="w-4 h-4" />}
                </div>

                <Card className={`w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] ${isLocked ? "opacity-60" : ""}`}>
                  <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Step {idx + 1}</div>
                      <h3 className="font-semibold text-lg">{step.title}</h3>
                    </div>
                    <Button 
                      disabled={isLocked} 
                      variant={isCompleted ? "outline" : "default"}
                      className={isCompleted ? "text-success border-success hover:text-success hover:bg-success/10" : ""}
                    >
                      {isCompleted ? "Review" : step.action}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
