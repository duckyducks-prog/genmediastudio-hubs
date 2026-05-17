interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  size?: "sm" | "md";
}

export function Toggle({ checked, onChange, label, size = "md" }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`${size === "sm" ? "toggle-sm" : "settings-toggle"}${checked ? " on" : ""}`}
      onClick={() => onChange(!checked)}
    />
  );
}
