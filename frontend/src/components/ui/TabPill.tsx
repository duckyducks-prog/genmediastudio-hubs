import { type ReactNode } from "react";

export interface TabPillOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface TabPillProps<T extends string> {
  options: TabPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export function TabPill<T extends string>({ options, value, onChange, ariaLabel }: TabPillProps<T>) {
  return (
    <div className="mode-toggle" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`mode-opt${value === opt.value ? " active" : ""}`}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
