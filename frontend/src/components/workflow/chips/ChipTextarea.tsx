import {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { CHIPS, CHIP_CATEGORY_COLORS, CATEGORY_LABELS, ChipCategory } from "./chipDefinitions";

interface ChipTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  textareaClassName?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

// Parse @tokens from text that match known chips
function parseActiveChips(text: string) {
  const found: Array<{ id: string; category: ChipCategory }> = [];
  const seen = new Set<string>();
  const regex = /@(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const id = match[1];
    const chip = CHIPS.find((c) => c.id === id);
    if (chip && !seen.has(id)) {
      seen.add(id);
      found.push({ id, category: chip.category });
    }
  }
  return found;
}

// Returns { query, start } when cursor is right after an @ trigger, else null
function getActiveQuery(
  value: string,
  cursorPos: number
): { query: string; start: number } | null {
  const before = value.slice(0, cursorPos);
  const match = before.match(/@(\w*)$/);
  if (!match) return null;
  return { query: match[1], start: cursorPos - match[0].length };
}

export const ChipTextarea = forwardRef<HTMLTextAreaElement, ChipTextareaProps>(
  function ChipTextarea(
    { value, onChange, placeholder, className = "", textareaClassName = "", disabled, readOnly, onKeyDown },
    forwardedRef
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(forwardedRef, () => textareaRef.current!);

    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [dropdownQuery, setDropdownQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

    const filteredChips = CHIPS.filter((c) =>
      c.id.toLowerCase().startsWith(dropdownQuery.toLowerCase())
    );

    const activeChips = parseActiveChips(value);

    const positionDropdown = useCallback(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      const rect = ta.getBoundingClientRect();
      // Position below the textarea for simplicity
      setDropdownPos({
        top: rect.bottom + window.scrollY + 4,
        left: Math.min(rect.left + window.scrollX, window.innerWidth - 260),
      });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      const cursor = e.target.selectionStart ?? newValue.length;
      const active = getActiveQuery(newValue, cursor);
      if (active) {
        setDropdownQuery(active.query);
        setDropdownOpen(true);
        setActiveIndex(0);
        positionDropdown();
      } else {
        setDropdownOpen(false);
      }
    };

    const insertChip = useCallback(
      (chipId: string) => {
        const ta = textareaRef.current;
        const cursorPos = ta?.selectionStart ?? value.length;
        const active = getActiveQuery(value, cursorPos);
        if (!active) return;
        const before = value.slice(0, active.start);
        const after = value.slice(cursorPos);
        const newValue = `${before}@${chipId} ${after}`;
        onChange(newValue);
        setDropdownOpen(false);
        requestAnimationFrame(() => {
          if (ta) {
            const pos = before.length + chipId.length + 2;
            ta.selectionStart = pos;
            ta.selectionEnd = pos;
            ta.focus();
          }
        });
      },
      [value, onChange]
    );

    const removeChip = useCallback(
      (chipId: string) => {
        const newValue = value.replace(new RegExp(`@${chipId}\\s?`, "g"), "");
        onChange(newValue);
      },
      [value, onChange]
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (dropdownOpen && filteredChips.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, filteredChips.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertChip(filteredChips[activeIndex].id);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setDropdownOpen(false);
          return;
        }
      }
      onKeyDown?.(e);
    };

    // Close dropdown on outside click
    useEffect(() => {
      if (!dropdownOpen) return;
      const handler = (e: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(e.target as Node) &&
          !textareaRef.current?.contains(e.target as Node)
        ) {
          setDropdownOpen(false);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [dropdownOpen]);

    const dropdown = dropdownOpen && filteredChips.length > 0 &&
      createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "absolute", top: dropdownPos.top, left: dropdownPos.left, zIndex: 99999 }}
          className="w-64 bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="px-3 py-1.5 border-b border-border text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
            Smart Chips
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filteredChips.map((chip, i) => (
              <li
                key={chip.id}
                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm transition-colors ${
                  i === activeIndex ? "bg-muted" : "hover:bg-muted/50"
                }`}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={() => insertChip(chip.id)}
              >
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    color: CHIP_CATEGORY_COLORS[chip.category],
                    backgroundColor: `${CHIP_CATEGORY_COLORS[chip.category]}20`,
                  }}
                >
                  {CATEGORY_LABELS[chip.category]}
                </span>
                <span
                  className="font-medium"
                  style={{ color: CHIP_CATEGORY_COLORS[chip.category] }}
                >
                  @{chip.id}
                </span>
              </li>
            ))}
          </ul>
        </div>,
        document.body
      );

    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          className={`nodrag w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none ${textareaClassName}`}
        />

        {/* Active chip badges */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {activeChips.map((chip) => (
              <span
                key={chip.id}
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{
                  color: CHIP_CATEGORY_COLORS[chip.category],
                  backgroundColor: `${CHIP_CATEGORY_COLORS[chip.category]}20`,
                }}
              >
                @{chip.id}
                {!readOnly && !disabled && (
                  <button
                    onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); removeChip(chip.id); }}
                    className="hover:opacity-70 transition-opacity"
                    title={`Remove @${chip.id}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {dropdown}
      </div>
    );
  }
);
