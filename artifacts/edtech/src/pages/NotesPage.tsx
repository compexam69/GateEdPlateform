import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Download, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotesPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Study Notes</h1>
            <p className="text-muted-foreground mt-1">Manage and access your PDF notes.</p>
          </div>
          <Button>
            <UploadCloud className="w-4 h-4 mr-2" /> Upload PDF
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-card">
              <CardContent className="p-4 flex items-start space-x-4">
                <div className="w-10 h-10 rounded bg-accent/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">Physics Chapter {i} Notes</h3>
                  <p className="text-xs text-muted-foreground mt-1">Added 2 days ago • 2.4 MB</p>
                </div>
                <Button variant="ghost" size="icon">
                  <Download className="w-4 h-4 text-muted-foreground" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
