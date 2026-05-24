import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Pause, Play, ChevronLeft, ChevronRight, CheckSquare, Square } from "lucide-react";

export default function ExamPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const [, setLocation] = useLocation();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  
  // Mock questions
  const questions = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    text: `Sample question ${i + 1} text goes here. Which of the following is correct?`,
    options: { A: "Option 1", B: "Option 2", C: "Option 3", D: "Option 4" },
    status: i === 0 ? "unanswered" : "not-visited"
  }));

  const submitExam = () => {
    setLocation(`/exam/results/demo-result`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6">
        <div className="font-bold text-lg hidden sm:block">Exam Simulation</div>
        <div className="flex items-center gap-4 mx-auto sm:mx-0">
          <div className="font-mono text-xl text-primary font-bold">01:45:30</div>
          <Button variant="outline" size="sm">
            <Pause className="w-4 h-4 mr-2" /> Pause
          </Button>
        </div>
        <Button variant="destructive" onClick={submitExam} size="sm">
          Submit Exam
        </Button>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Question {currentQuestion + 1}</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" id="mark" className="rounded border-input text-warning focus:ring-warning" />
              <label htmlFor="mark">Mark for Review</label>
            </div>
          </div>

          <div className="prose prose-invert max-w-none mb-8 text-lg">
            <p>{questions[currentQuestion].text}</p>
          </div>

          <div className="space-y-3 mt-auto">
            {Object.entries(questions[currentQuestion].options).map(([key, value]) => (
              <label key={key} className="flex items-center space-x-3 p-4 border border-border rounded-lg cursor-pointer hover:bg-muted transition-colors">
                <input type="radio" name={`q-${currentQuestion}`} className="h-4 w-4 text-primary border-border" />
                <span className="font-medium text-muted-foreground">{key}.</span>
                <span>{value}</span>
              </label>
            ))}
          </div>

          {/* Footer Navigation */}
          <div className="mt-8 flex justify-between border-t border-border pt-4">
            <Button variant="outline" onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))} disabled={currentQuestion === 0}>
              <ChevronLeft className="w-4 h-4 mr-2" /> Previous
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary">Clear Response</Button>
              <Button onClick={() => setCurrentQuestion(Math.min(questions.length - 1, currentQuestion + 1))}>
                Save & Next <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </main>

        {/* Sidebar */}
        <aside className="w-full md:w-80 border-l border-border bg-card p-4 overflow-y-auto shrink-0 flex flex-col">
          <div className="font-semibold mb-4">Question Palette</div>
          
          <div className="grid grid-cols-5 gap-2 mb-6">
            {questions.map((q, i) => (
              <button 
                key={i}
                onClick={() => setCurrentQuestion(i)}
                className={`w-10 h-10 rounded flex items-center justify-center font-medium text-sm border
                  ${i === currentQuestion ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : ''}
                  ${i === 0 ? 'bg-success text-success-foreground border-success' : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'}
                `}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <div className="mt-auto space-y-2 text-sm">
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-success"></div> Answered</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-destructive"></div> Not Answered</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-warning"></div> Marked for Review</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-muted border border-border"></div> Not Visited</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
