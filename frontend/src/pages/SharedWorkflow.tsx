import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Play, Download, AlertCircle, Plus, X, RefreshCw, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getShareSchema,
  runVariations,
  ShareSchema,
  ExposedInput,
  ResultCard,
} from "@/lib/shared-api";

const MAX_RUNS = 12;
const CONCURRENCY = 4;

// ── Helpers ──────────────────────────────────────────────────────────────────

function cartesian(arrays: string[][]): string[][] {
  return arrays.reduce<string[][]>(
    (acc, arr) => acc.flatMap((a) => arr.map((v) => [...a, v])),
    [[]],
  );
}

function buildVariations(
  exposedInputs: ExposedInput[],
  rows: Record<string, string[]>,
): Record<string, string>[] {
  const ids = exposedInputs.map((inp) => inp.node_id);
  const filledRows = ids.map((id) => (rows[id] ?? [""]).filter((v) => v.trim()));
  if (filledRows.some((r) => r.length === 0)) return [];
  const combos = cartesian(filledRows);
  return combos.map((combo) =>
    Object.fromEntries(ids.map((id, i) => [id, combo[i]])),
  );
}

function cardLabel(inputs: Record<string, string>, exposedInputs: ExposedInput[]): string {
  return exposedInputs
    .map((inp) => {
      const val = inputs[inp.node_id];
      if (!val) return null;
      const preview = val.length > 30 ? val.slice(0, 30) + "…" : val;
      return `${inp.label}: "${preview}"`;
    })
    .filter(Boolean)
    .join(" × ");
}

function isVideo(url: string) {
  return url.startsWith("data:video") || /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldInput({
  inp,
  rows,
  onChange,
  onAddRow,
  onRemoveRow,
}: {
  inp: ExposedInput;
  rows: string[];
  onChange: (rowIdx: number, value: string) => void;
  onAddRow: () => void;
  onRemoveRow: (rowIdx: number) => void;
}) {
  const multi = rows.length > 1;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{inp.label}</label>
        {multi && (
          <span className="text-xs text-muted-foreground">{rows.length} rows</span>
        )}
      </div>

      <div className="space-y-2">
        {rows.map((val, rowIdx) => (
          <div key={rowIdx} className="flex gap-2 items-start">
            {multi && (
              <span className="mt-2.5 text-xs text-muted-foreground w-4 shrink-0 text-right">
                {rowIdx + 1}
              </span>
            )}
            <textarea
              value={val}
              onChange={(e) => onChange(rowIdx, e.target.value)}
              placeholder={`Enter ${inp.label.toLowerCase()}…`}
              rows={3}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {multi && (
              <button
                onClick={() => onRemoveRow(rowIdx)}
                className="mt-2 p-1 rounded hover:bg-muted transition-colors shrink-0"
                title="Remove row"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={onAddRow}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="w-3 h-3" />
        Add row
      </button>
    </div>
  );
}

function ResultCardView({
  card,
  exposedInputs,
  onRegenerate,
}: {
  card: ResultCard;
  exposedInputs: ExposedInput[];
  onRegenerate: (card: ResultCard) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Card header */}
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground truncate">
          {cardLabel(card.inputs, exposedInputs)}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {card.status === "completed" && (
            <button
              onClick={() => onRegenerate(card)}
              className="p-1 rounded hover:bg-muted transition-colors"
              title="Regenerate (same inputs, new output)"
            >
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="p-3">
        {card.status === "pending" && (
          <div className="h-32 flex items-center justify-center">
            <div className="w-full h-full rounded-md bg-muted animate-pulse" />
          </div>
        )}

        {card.status === "running" && (
          <div className="h-32 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Generating…</p>
          </div>
        )}

        {card.status === "failed" && (
          <div className="h-32 flex flex-col items-center justify-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <p className="text-xs text-center">{card.error || "Generation failed"}</p>
            <button
              onClick={() => onRegenerate(card)}
              className="text-xs underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {card.status === "completed" &&
          card.outputs.map((url, i) => (
            <div key={i} className="space-y-2">
              {isVideo(url) ? (
                <video src={url} controls className="w-full rounded-md" />
              ) : (
                <img src={url} alt={`output-${i}`} className="w-full rounded-md" />
              )}
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  download={`output-${card.variationIndex + 1}-${i + 1}`}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </a>
                <button
                  onClick={() => handleCopy(url)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  Copy link
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SharedWorkflow() {
  const { token } = useParams<{ token: string }>();
  const [schema, setSchema] = useState<ShareSchema | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string[]>>({});
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [resultCards, setResultCards] = useState<ResultCard[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!token) return;
    getShareSchema(token)
      .then((s) => {
        setSchema(s);
        const initial: Record<string, string[]> = {};
        s.exposed_inputs.forEach((inp) => {
          initial[inp.node_id] = [""];
        });
        setRows(initial);
      })
      .catch((e) => setLoadError((e as Error).message));
  }, [token]);

  const updateRow = (nodeId: string, rowIdx: number, value: string) => {
    setRows((prev) => ({
      ...prev,
      [nodeId]: prev[nodeId].map((v, i) => (i === rowIdx ? value : v)),
    }));
  };

  const addRow = (nodeId: string) => {
    setRows((prev) => ({ ...prev, [nodeId]: [...prev[nodeId], ""] }));
  };

  const removeRow = (nodeId: string, rowIdx: number) => {
    setRows((prev) => ({
      ...prev,
      [nodeId]: prev[nodeId].filter((_, i) => i !== rowIdx),
    }));
  };

  const variations = schema ? buildVariations(schema.exposed_inputs, rows) : [];
  const runCount = variations.length;
  const canRun = runCount > 0 && runCount <= MAX_RUNS && !running;

  const executeRun = useCallback(
    async (varList: Record<string, string>[]) => {
      if (!token) return;
      setRunning(true);
      setRunError(null);
      setShowConfirm(false);

      const initial: ResultCard[] = varList.map((inputs, i) => ({
        variationIndex: i,
        status: "pending",
        inputs,
        outputs: [],
      }));
      setResultCards(initial);

      try {
        await runVariations(
          token,
          varList,
          (card) =>
            setResultCards((prev) =>
              prev.map((c) => (c.variationIndex === card.variationIndex ? card : c)),
            ),
          CONCURRENCY,
        );
      } catch (e) {
        setRunError((e as Error).message);
      } finally {
        setRunning(false);
      }
    },
    [token],
  );

  const handleGenerate = () => {
    if (runCount > 1) {
      setShowConfirm(true);
    } else {
      executeRun(variations);
    }
  };

  const handleRegenerate = (card: ResultCard) => {
    executeRun([card.inputs]);
  };

  // ── Loading / error states ──────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-destructive" />
          <p className="text-lg font-medium">Link unavailable</p>
          <p className="text-sm text-muted-foreground">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Main UI ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold">{schema.title}</h1>
      </header>

      <main className="flex-1 flex flex-col items-center py-10 px-4">
        <div className="w-full max-w-xl space-y-6">
          {/* Fields */}
          {schema.exposed_inputs.map((inp) => (
            <FieldInput
              key={inp.node_id}
              inp={inp}
              rows={rows[inp.node_id] ?? [""]}
              onChange={(rowIdx, val) => updateRow(inp.node_id, rowIdx, val)}
              onAddRow={() => addRow(inp.node_id)}
              onRemoveRow={(rowIdx) => removeRow(inp.node_id, rowIdx)}
            />
          ))}

          {/* Cap warning */}
          {runCount > MAX_RUNS && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {runCount} runs exceeds the {MAX_RUNS}-run limit. Remove some rows to continue.
            </div>
          )}

          {runError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {runError}
            </div>
          )}

          {/* Confirm dialog */}
          {showConfirm ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium">
                This will generate <span className="text-primary">{runCount} videos</span>. Continue?
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => executeRun(variations)} className="flex-1">
                  Generate {runCount} videos
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowConfirm(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={!canRun}
              className="w-full"
              size="lg"
            >
              {running ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
              ) : runCount > 1 ? (
                <><Play className="w-4 h-4 mr-2" />Generate {runCount} videos</>
              ) : (
                <><Play className="w-4 h-4 mr-2" />Generate</>
              )}
            </Button>
          )}

          {/* Result cards */}
          {resultCards.length > 0 && (
            <div className="space-y-4 pt-2">
              <h2 className="text-sm font-medium">
                Results{" "}
                <span className="text-muted-foreground font-normal">
                  ({resultCards.filter((c) => c.status === "completed").length}/
                  {resultCards.length} done)
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {resultCards.map((card) => (
                  <ResultCardView
                    key={card.variationIndex}
                    card={card}
                    exposedInputs={schema.exposed_inputs}
                    onRegenerate={handleRegenerate}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
