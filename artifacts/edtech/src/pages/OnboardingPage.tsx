import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BookOpen, Brain, PlayCircle, Target, ChevronRight, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const slides = [
  {
    title: "Smart Mastery Path",
    description: "Follow a structured, mastery-based approach. Unlock new topics only when you've truly understood the current ones.",
    icon: BookOpen,
    color: "text-primary"
  },
  {
    title: "Real Exam Simulation",
    description: "Practice in an interface identical to JEE/NEET/GATE. Build stamina and get comfortable with the real deal.",
    icon: Target,
    color: "text-secondary"
  },
  {
    title: "Instant Video Solutions",
    description: "Stuck on a question? Scan the QR code or click to watch detailed video explanations immediately.",
    icon: PlayCircle,
    color: "text-accent"
  },
  {
    title: "Distraction-Free Focus",
    description: "Built-in Pomodoro timers and a cockpit-like interface to keep you in the zone for hours.",
    icon: Brain,
    color: "text-warning"
  }
];

export default function OnboardingPage() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) setCurrentSlide(curr => curr + 1);
  };

  const prevSlide = () => {
    if (currentSlide > 0) setCurrentSlide(curr => curr - 1);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto w-full">
        
        <div className="flex-1 flex flex-col items-center justify-center w-full relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center absolute inset-0 justify-center"
            >
              {(() => {
                const Icon = slides[currentSlide].icon;
                return (
                  <>
                    <div className="w-24 h-24 rounded-full bg-card flex items-center justify-center mb-8 border border-border">
                      <Icon className={`w-12 h-12 ${slides[currentSlide].color}`} />
                    </div>
                    <h1 className="text-3xl font-bold mb-4">{slides[currentSlide].title}</h1>
                    <p className="text-muted-foreground text-lg px-4">
                      {slides[currentSlide].description}
                    </p>
                  </>
                );
              })()}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 mt-8 mb-12 h-8">
          {slides.map((_, idx) => (
            <div
              key={idx}
              className={`h-2 rounded-full transition-all ${
                idx === currentSlide ? "w-8 bg-primary" : "w-2 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        <div className="w-full space-y-4">
          <div className="flex gap-4">
            <Button
              variant="outline"
              size="icon"
              className="w-12 h-12 shrink-0"
              onClick={prevSlide}
              disabled={currentSlide === 0}
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
            
            {currentSlide < slides.length - 1 ? (
              <Button className="flex-1 h-12 text-lg" onClick={nextSlide}>
                Next <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            ) : (
              <Button asChild className="flex-1 h-12 text-lg">
                <Link href="/register">Get Started</Link>
              </Button>
            )}
          </div>
          
          {currentSlide === slides.length - 1 && (
            <div className="pt-2">
              <Link href="/login" className="text-muted-foreground text-sm hover:text-primary transition-colors">
                Already have an account? Sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
