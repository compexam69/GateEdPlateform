import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BookOpen, Brain, PlayCircle, Target, Rocket, ChevronRight, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const slides = [
  {
    title: "Smart Mastery Path",
    description: "Follow a structured, mastery-based learning path. Every topic is gated — you unlock the next level only when you've truly mastered the current one.",
    icon: BookOpen,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    title: "Real Exam Simulation",
    description: "Practice in an interface identical to JEE, NEET, and GATE. Full-screen, timed, with question palettes and negative marking — exactly like the real exam.",
    icon: Target,
    color: "text-secondary",
    bg: "bg-secondary/10",
  },
  {
    title: "Instant Video Solutions",
    description: "Stuck on a question? Scan the QR code or click to watch detailed video explanations instantly. Every question has a step-by-step solution.",
    icon: PlayCircle,
    color: "text-accent",
    bg: "bg-accent/10",
  },
  {
    title: "Distraction-Free Focus",
    description: "Built-in Pomodoro timer, smart study planner, and a fully focused exam environment to help you study smarter, not harder.",
    icon: Brain,
    color: "text-warning",
    bg: "bg-warning/10",
  },
  {
    title: "Start Your Journey",
    description: "Join thousands of JEE, NEET, and GATE aspirants mastering their syllabus one topic at a time. Your rank is waiting.",
    icon: Rocket,
    color: "text-primary",
    bg: "bg-primary/10",
    isCta: true,
  },
];

export default function OnboardingPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(1);

  const goTo = useCallback((idx: number) => {
    setDirection(idx > currentSlide ? 1 : -1);
    setCurrentSlide(idx);
  }, [currentSlide]);

  const nextSlide = useCallback(() => {
    if (currentSlide < slides.length - 1) goTo(currentSlide + 1);
  }, [currentSlide, goTo]);

  const prevSlide = useCallback(() => {
    if (currentSlide > 0) goTo(currentSlide - 1);
  }, [currentSlide, goTo]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") nextSlide();
      if (e.key === "ArrowLeft") prevSlide();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [nextSlide, prevSlide]);

  const slide = slides[currentSlide];
  const Icon = slide.icon;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-lg mx-auto w-full">
        <div className="flex-1 flex flex-col items-center justify-center w-full relative min-h-[360px]">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentSlide}
              custom={direction}
              initial={{ opacity: 0, x: direction * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -60 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex flex-col items-center text-center absolute inset-0 justify-center px-2"
            >
              <div className={`w-24 h-24 rounded-full ${slide.bg} flex items-center justify-center mb-8 border border-border`}>
                <Icon className={`w-12 h-12 ${slide.color}`} />
              </div>
              <h1 className="text-3xl font-bold mb-4 tracking-tight">{slide.title}</h1>
              <p className="text-muted-foreground text-base leading-relaxed">{slide.description}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 mb-8">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goTo(idx)}
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === currentSlide ? "w-8 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              }`}
            />
          ))}
        </div>

        <div className="w-full space-y-3">
          {slide.isCta ? (
            <>
              <Button asChild className="w-full h-12 text-base">
                <Link href="/register">Get Started — It's Free</Link>
              </Button>
              <Button variant="outline" asChild className="w-full h-12">
                <Link href="/login">I already have an account</Link>
              </Button>
            </>
          ) : (
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="icon"
                className="w-12 h-12 shrink-0"
                onClick={prevSlide}
                disabled={currentSlide === 0}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button className="flex-1 h-12 text-base" onClick={nextSlide}>
                Next <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            </div>
          )}

          {!slide.isCta && (
            <div className="text-center pt-1">
              <Link
                href="/login"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Already have an account? Sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
