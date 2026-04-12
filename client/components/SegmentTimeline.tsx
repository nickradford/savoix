import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface Segment {
  id: string;
  startTime: number;
  endTime: number;
  label: string;
  color?: string;
}

interface SegmentTimelineProps {
  segments: Segment[];
  currentTime?: number;
  duration?: number;
  onAddSegment: (segment: Segment) => void;
  onDeleteSegment: (id: string) => void;
  onUpdateSegment: (id: string, segment: Segment) => void;
}

const LABEL_COLORS = [
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#eab308" },
  { name: "Green", value: "#22c55e" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#a855f7" },
];

export function SegmentTimeline({
  segments,
  currentTime = 0,
  duration = 0,
  onAddSegment,
  onDeleteSegment,
  onUpdateSegment,
}: SegmentTimelineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [formData, setFormData] = useState({
    startTime: 0,
    endTime: 0,
    label: "",
    color: LABEL_COLORS[0].value,
  });

  const handleOpenDialog = (segment?: Segment) => {
    if (segment) {
      setEditingSegment(segment);
      setFormData({
        startTime: segment.startTime,
        endTime: segment.endTime,
        label: segment.label,
        color: segment.color || LABEL_COLORS[0].value,
      });
    } else {
      setEditingSegment(null);
      setFormData({
        startTime: currentTime,
        endTime: currentTime + 5,
        label: "",
        color: LABEL_COLORS[0].value,
      });
    }
    setIsOpen(true);
  };

  const handleSave = () => {
    if (!formData.label.trim()) return;

    if (editingSegment) {
      onUpdateSegment(editingSegment.id, {
        ...editingSegment,
        ...formData,
      });
    } else {
      onAddSegment({
        id: Date.now().toString(),
        ...formData,
      });
    }

    setIsOpen(false);
    setEditingSegment(null);
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="border-t border-border bg-white px-6 py-4">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-foreground text-sm">Segments</h3>
          {segments.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {segments.length} segment{segments.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Segments List */}
        {segments.length > 0 && (
          <div className="space-y-2 max-h-32 overflow-auto">
            {segments.map((segment) => (
              <div
                key={segment.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-border"
                style={{
                  borderLeftColor: segment.color,
                  borderLeftWidth: "4px",
                }}
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {segment.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(segment.startTime)} -{" "}
                    {formatTime(segment.endTime)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenDialog(segment)}
                    className="text-muted-foreground hover:text-foreground p-1"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onDeleteSegment(segment.id)}
                    className="text-muted-foreground hover:text-destructive p-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => handleOpenDialog()}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Segment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingSegment ? "Edit Segment" : "Add Segment"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Label
                </label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) =>
                    setFormData({ ...formData, label: e.target.value })
                  }
                  placeholder="e.g., Introduction, Verse 1, Chorus"
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Start Time (s)
                  </label>
                  <input
                    type="number"
                    value={formData.startTime}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        startTime: Number(e.target.value),
                      })
                    }
                    step="0.1"
                    className="w-full mt-1 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">
                    End Time (s)
                  </label>
                  <input
                    type="number"
                    value={formData.endTime}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        endTime: Number(e.target.value),
                      })
                    }
                    step="0.1"
                    className="w-full mt-1 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">
                  Color
                </label>
                <div className="flex gap-2 mt-2">
                  {LABEL_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() =>
                        setFormData({ ...formData, color: color.value })
                      }
                      className="w-8 h-8 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: color.value,
                        borderColor:
                          formData.color === color.value
                            ? "#000"
                            : "#e5e7eb",
                      }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              <Button onClick={handleSave} className="w-full">
                {editingSegment ? "Update Segment" : "Add Segment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
