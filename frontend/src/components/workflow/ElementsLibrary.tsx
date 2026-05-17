import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, MapPin, Camera, Sun, Sparkles, Package2, Plus, Loader2, Lock } from "lucide-react";
import { SceneElement, ElementType, listSceneElements } from "@/lib/scene-elements-api";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { isAdmin, isAdminOnly } from "@/lib/permissions";

const CATEGORIES: { type: ElementType; label: string; singular: string; icon: React.ReactNode; description: string }[] = [
  { type: "character",    label: "Characters",    singular: "Character",    icon: <User className="w-5 h-5" />,       description: "People and personas"          },
  { type: "camera_angle", label: "Camera Angles", singular: "Camera Angle", icon: <Camera className="w-5 h-5" />,     description: "Shots and framing styles"     },
  { type: "location",     label: "Locations",     singular: "Location",     icon: <MapPin className="w-5 h-5" />,     description: "Places and environments"      },
  { type: "lighting",     label: "Lighting",      singular: "Lighting",     icon: <Sun className="w-5 h-5" />,        description: "Light setups and moods"       },
  { type: "style",        label: "Style",         singular: "Style",        icon: <Sparkles className="w-5 h-5" />,   description: "Visual styles and aesthetics" },
  { type: "prop",         label: "Props",         singular: "Prop",         icon: <Package2 className="w-5 h-5" />,   description: "Objects and items"            },
];

// ─── Category card ────────────────────────────────────────────────────────────

function CategoryCard({
  category,
  elements,
  locked,
  onClick,
}: {
  category: typeof CATEGORIES[number];
  elements: SceneElement[];
  locked: boolean;
  onClick: () => void;
}) {
  const preview = elements.slice(0, 4);

  return (
    <div
      className="dash-card"
      style={{ cursor: locked ? "default" : "pointer", opacity: locked ? 0.45 : 1 }}
      onClick={locked ? undefined : onClick}
    >
      {/* Preview area */}
      <div
        className="relative rounded-[10px] mb-3"
        style={{
          aspectRatio: "16/10",
          background: "hsl(var(--background))",
          boxShadow: "inset 2px 2px 5px rgba(0,0,0,0.55), inset -2px -2px 5px rgba(30,100,105,0.22)",
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {preview.length === 0 ? (
          <div style={{ opacity: 0.15, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "hsl(var(--primary))", transform: "scale(1.6)" }}>{category.icon}</span>
          </div>
        ) : (
          <div style={{ position: "absolute", inset: "10px 12px", display: "flex", flexWrap: "wrap", gap: 5, alignContent: "flex-start" }}>
            {preview.map((el) => (
              <span
                key={el.id}
                style={{
                  fontSize: 10, fontWeight: 500, padding: "3px 8px",
                  background: "rgba(185,205,190,0.12)", borderRadius: 20,
                  color: "hsl(var(--primary))", whiteSpace: "nowrap",
                  maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis",
                }}
              >
                {el.name}
              </span>
            ))}
            {elements.length > 4 && (
              <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", padding: "3px 4px" }}>
                +{elements.length - 4} more
              </span>
            )}
          </div>
        )}

        {/* Icon badge top-right */}
        <div
          style={{
            position: "absolute", top: 8, right: 8,
            width: 28, height: 28, borderRadius: "50%",
            background: "rgba(185,205,190,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "hsl(var(--primary))",
          }}
        >
          <span style={{ transform: "scale(0.75)" }}>{category.icon}</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "0 2px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--foreground))", margin: 0 }}>
              {category.label}
            </p>
            {locked && (
              <span
                style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
                  padding: "2px 6px", borderRadius: 4,
                  background: "rgba(185,205,190,0.08)",
                  color: "hsl(var(--muted-foreground))",
                  textTransform: "uppercase",
                }}
              >
                <Lock className="w-2.5 h-2.5" />Admin
              </span>
            )}
          </div>
          <p style={{ fontSize: 10, color: "#7A8E90", margin: 0 }}>
            {elements.length} {elements.length === 1 ? "element" : "elements"} · {category.description}
          </p>
        </div>
        {!locked && (
          <div
            style={{
              width: 26, height: 26, borderRadius: 8, flexShrink: 0,
              background: "rgba(185,205,190,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ElementsLibrary() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [elements, setElements] = useState<SceneElement[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const userIsAdmin = isAdmin(user?.email);

  useEffect(() => {
    listSceneElements()
      .then(setElements)
      .catch((e) => toast({ title: "Failed to load elements", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
      {CATEGORIES.map((category) => {
        const locked = isAdminOnly(category.type) && !userIsAdmin;
        return (
          <CategoryCard
            key={category.type}
            category={category}
            elements={elements.filter((e) => e.element_type === category.type)}
            locked={locked}
            onClick={() => navigate(`/elements/${category.type}`)}
          />
        );
      })}
    </div>
  );
}
