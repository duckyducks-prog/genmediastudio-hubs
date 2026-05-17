import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { SidePanel } from "@/components/ui/SidePanel";
import { Toggle } from "@/components/ui/Toggle";
import { CardPicker } from "@/components/ui/CardPicker";
import { useWorkflow, GenerationMode } from "@/contexts/WorkflowContext";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  parallelExecution: boolean;
  onToggleParallelExecution: () => void;
}

export function SettingsPanel({
  isOpen,
  onClose,
  parallelExecution,
  onToggleParallelExecution,
}: SettingsPanelProps) {
  const { theme, setTheme } = useTheme();
  const { state, dispatch } = useWorkflow();

  const [reduceMotion, setReduceMotion] = useState(false);
  const [showDotGrid, setShowDotGrid] = useState(true);

  // Persist reduce-motion preference
  useEffect(() => {
    const saved = localStorage.getItem("reduceMotion") === "true";
    setReduceMotion(saved);
    document.documentElement.setAttribute("data-reduced-motion", saved ? "true" : "false");
  }, []);

  const handleReduceMotion = (val: boolean) => {
    setReduceMotion(val);
    localStorage.setItem("reduceMotion", String(val));
    document.documentElement.setAttribute("data-reduced-motion", val ? "true" : "false");
  };

  const handleDotGrid = (val: boolean) => {
    setShowDotGrid(val);
    // Dispatch to workflow canvas via custom event
    window.dispatchEvent(new CustomEvent("toggle-dot-grid", { detail: { show: val } }));
  };

  const isLight = theme === "light";
  const handleLightTheme = (val: boolean) => setTheme(val ? "light" : "dark");

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="Settings" width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, overflowY: "auto", scrollbarWidth: "thin" }}>

        {/* ── Appearance ─────────────────────────────────────── */}
        <section className="settings-section" aria-labelledby="settings-appearance-label">
          <p id="settings-appearance-label" className="settings-section-label">Appearance</p>

          {/* Light theme toggle — off = dark (default), on = light */}
          <div className="setting-row">
            <div className="setting-info">
              <p className="setting-name">Light theme</p>
              <p className="setting-desc">Use the light interface instead of the default dark</p>
            </div>
            <Toggle checked={isLight} onChange={handleLightTheme} label="Light theme" />
          </div>

          {/* Reduce motion */}
          <div className="setting-row">
            <div className="setting-info">
              <p className="setting-name">Reduce motion</p>
              <p className="setting-desc">Disable entrance animations and transitions</p>
            </div>
            <Toggle checked={reduceMotion} onChange={handleReduceMotion} label="Reduce motion" />
          </div>

          {/* Hide canvas dot grid — off = grid visible (default), on = hidden */}
          <div className="setting-row">
            <div className="setting-info">
              <p className="setting-name">Hide canvas dot grid</p>
              <p className="setting-desc">Remove the background pattern from the canvas</p>
            </div>
            <Toggle checked={!showDotGrid} onChange={(v) => handleDotGrid(!v)} label="Hide canvas dot grid" />
          </div>
        </section>

        <div className="settings-divider" aria-hidden="true" />

        {/* ── Generation ─────────────────────────────────────── */}
        <section className="settings-section" aria-labelledby="settings-generation-label">
          <p id="settings-generation-label" className="settings-section-label">Generation</p>

          <div className="setting-row vertical">
            <div className="setting-info">
              <p className="setting-name">Default model tier</p>
              <p className="setting-desc">Used for new workflows. Can be changed per node.</p>
            </div>
            <CardPicker
              options={[
                { value: "explore", title: "Explore", description: "Lightweight models — fast, low-cost experimentation" },
                { value: "project", title: "Project", description: "Premium models — final-quality output" },
              ]}
              value={state.mode}
              onChange={(v) => dispatch({ type: "SET_MODE", payload: v as GenerationMode })}
              label="Default model tier"
            />
          </div>
        </section>

        <div className="settings-divider" aria-hidden="true" />

        {/* ── Execution ──────────────────────────────────────── */}
        <section className="settings-section" aria-labelledby="settings-execution-label">
          <p id="settings-execution-label" className="settings-section-label">Execution</p>

          <div className="setting-row vertical">
            <div className="setting-info">
              <p className="setting-name">Run mode</p>
              <p className="setting-desc">How nodes are executed when you run the workflow</p>
            </div>
            <CardPicker
              options={[
                { value: "sequential", title: "Sequential", description: "Nodes run one at a time — safer for complex workflows" },
                { value: "parallel",   title: "Parallel",   description: "API nodes run simultaneously — faster, may hit rate limits" },
              ]}
              value={parallelExecution ? "parallel" : "sequential"}
              onChange={(v) => { if ((v === "parallel") !== parallelExecution) onToggleParallelExecution(); }}
              label="Run mode"
            />
          </div>
        </section>

      </div>
    </SidePanel>
  );
}
