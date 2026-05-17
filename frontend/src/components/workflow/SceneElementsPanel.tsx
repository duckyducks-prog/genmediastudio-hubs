import { useState, useEffect } from "react";
import { User, MapPin, Camera, Sun, Sparkles, Package2, Plus, Trash2, Loader2, X, Check } from "lucide-react";
import {
  SceneElement,
  ElementType,
  listSceneElements,
  createSceneElement,
  deleteSceneElement,
} from "@/lib/scene-elements-api";
import { useToast } from "@/hooks/use-toast";

const TYPE_ICONS: Record<ElementType, React.ReactNode> = {
  character:    <User className="w-3.5 h-3.5" />,
  location:     <MapPin className="w-3.5 h-3.5" />,
  camera_angle: <Camera className="w-3.5 h-3.5" />,
  lighting:     <Sun className="w-3.5 h-3.5" />,
  style:        <Sparkles className="w-3.5 h-3.5" />,
  prop:         <Package2 className="w-3.5 h-3.5" />,
};

const TYPE_LABELS: Record<ElementType, string> = {
  character:    "Characters",
  location:     "Locations",
  camera_angle: "Camera Angles",
  lighting:     "Lighting",
  style:        "Style",
  prop:         "Props",
};

interface AddFormProps {
  type: ElementType;
  onSave: (el: SceneElement) => void;
  onCancel: () => void;
}

function AddForm({ type, onSave, onCancel }: AddFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const el = await createSceneElement({ name: name.trim(), element_type: type, description: description.trim() || undefined, reference_image_urls: [] });
      onSave(el);
    } catch (e) {
      toast({ title: "Failed to save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 p-3 rounded-lg bg-muted/40 border border-border">
      <input
        autoFocus
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
        className="w-full text-sm bg-background border border-input rounded px-2 py-1.5 outline-none focus:border-[rgba(252,195,220,0.5)] focus:[box-shadow:0_0_2px_rgba(252,195,220,0.5)]"
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full text-xs bg-background border border-input rounded px-2 py-1.5 outline-none resize-none focus:border-[rgba(252,195,220,0.5)] focus:[box-shadow:0_0_2px_rgba(252,195,220,0.5)]"
      />
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="p-1 rounded hover:bg-muted transition-colors">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-primary" />}
        </button>
      </div>
    </div>
  );
}

interface SceneElementsSectionProps {
  type: ElementType;
  elements: SceneElement[];
  onInject: (el: SceneElement) => void;
  onAdd: (el: SceneElement) => void;
  onDelete: (id: string) => void;
}

function SceneElementsSection({ type, elements, onInject, onAdd, onDelete }: SceneElementsSectionProps) {
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteSceneElement(id);
      onDelete(id);
    } catch (err) {
      toast({ title: "Failed to delete", description: (err as Error).message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {TYPE_ICONS[type]}
          {TYPE_LABELS[type]}
        </div>
        <button
          onClick={() => setAdding(true)}
          className="p-0.5 rounded hover:bg-muted transition-colors"
          title={`Add ${type}`}
        >
          <Plus className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      </div>

      <div className="space-y-1.5">
        {adding && (
          <AddForm
            type={type}
            onSave={(el) => { onAdd(el); setAdding(false); }}
            onCancel={() => setAdding(false)}
          />
        )}

        {elements.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground/60 py-1">
            No {TYPE_LABELS[type].toLowerCase()} yet
          </p>
        )}

        {elements.map((el) => (
          <button
            key={el.id}
            onClick={() => onInject(el)}
            title={el.description ?? `Inject ${el.name} into prompt`}
            className="palette-item w-full flex items-start gap-2 p-2.5 rounded-lg cursor-pointer group text-left"
          >
            <div className="text-primary mt-0.5 shrink-0 group-hover:scale-110 transition-transform">
              {TYPE_ICONS[type]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{el.name}</div>
              {el.description && (
                <div className="text-xs text-muted-foreground truncate">{el.description}</div>
              )}
            </div>
            <button
              onClick={(e) => handleDelete(el.id, e)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20 transition-all shrink-0"
            >
              {deletingId === el.id
                ? <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                : <Trash2 className="w-3 h-3 text-destructive" />}
            </button>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SceneElementsPanel() {
  const [elements, setElements] = useState<SceneElement[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    listSceneElements()
      .then(setElements)
      .catch((e) => toast({ title: "Failed to load scene elements", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const characters = elements.filter((e) => e.element_type === "character");
  const locations = elements.filter((e) => e.element_type === "location");

  const handleInject = (el: SceneElement) => {
    window.dispatchEvent(new CustomEvent("inject-scene-element", {
      detail: {
        text: el.name,
        elementId: el.id,
        elementType: el.element_type,
        referenceImageUrls: el.reference_image_urls,
      },
    }));
  };

  const handleAdd = (el: SceneElement) => setElements((prev) => [el, ...prev]);
  const handleDelete = (id: string) => setElements((prev) => prev.filter((e) => e.id !== id));

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground pr-4">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <div className="pr-4 space-y-5">
      <SceneElementsSection type="character" elements={characters} onInject={handleInject} onAdd={handleAdd} onDelete={handleDelete} />
      <SceneElementsSection type="location" elements={locations} onInject={handleInject} onAdd={handleAdd} onDelete={handleDelete} />
    </div>
  );
}
