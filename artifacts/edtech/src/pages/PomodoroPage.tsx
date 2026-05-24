import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Pause, RotateCcw, Settings } from "lucide-react";

export default function PomodoroPage() {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<"focus" | "break">("focus");

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0) {
      setIsRunning(false);
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  const toggleTimer = () => setIsRunning(!isRunning);
  
  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(mode === "focus" ? 25 * 60 : 5 * 60);
  };

  const setModeFocus = (newMode: "focus" | "break") => {
    setMode(newMode);
    setIsRunning(false);
    setTimeLeft(newMode === "focus" ? 25 * 60 : 5 * 60);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  
  const progress = mode === "focus" 
    ? ((25 * 60 - timeLeft) / (25 * 60)) * 100 
    : ((5 * 60 - timeLeft) / (5 * 60)) * 100;

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)]">
        <div className="w-full max-w-md space-y-8">
          <div className="flex justify-center space-x-2">
            <Button 
              variant={mode === "focus" ? "default" : "outline"}
              onClick={() => setModeFocus("focus")}
              className="w-32"
            >
              Focus
            </Button>
            <Button 
              variant={mode === "break" ? "secondary" : "outline"}
              onClick={() => setModeFocus("break")}
              className="w-32"
            >
              Short Break
            </Button>
          </div>

          <Card className="border-none shadow-none bg-transparent">
            <CardContent className="flex flex-col items-center p-0">
              <div className="relative w-64 h-64 flex items-center justify-center mb-8">
                {/* Progress Ring */}
                <svg className="w-full h-full transform -rotate-90 absolute inset-0">
                  <circle
                    cx="128" cy="128" r="120"
                    fill="none"
                    stroke="hsl(var(--muted))"
                    strokeWidth="8"
                  />
                  <circle
                    cx="128" cy="128" r="120"
                    fill="none"
                    stroke={mode === "focus" ? "hsl(var(--primary))" : "hsl(var(--secondary))"}
                    strokeWidth="8"
                    strokeDasharray={2 * Math.PI * 120}
                    strokeDashoffset={2 * Math.PI * 120 * (1 - progress / 100)}
                    className="transition-all duration-1000 ease-linear"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="text-6xl font-bold font-mono tracking-tighter">
                  {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <Button 
                  size="icon" 
                  variant="outline" 
                  className="w-12 h-12 rounded-full"
                  onClick={resetTimer}
                >
                  <RotateCcw className="w-5 h-5" />
                </Button>
                <Button 
                  size="icon" 
                  className={`w-16 h-16 rounded-full shadow-lg hover:scale-105 transition-transform ${mode === 'break' ? 'bg-secondary hover:bg-secondary/90' : ''}`}
                  onClick={toggleTimer}
                >
                  {isRunning ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
                </Button>
                <Button 
                  size="icon" 
                  variant="outline" 
                  className="w-12 h-12 rounded-full"
                >
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
