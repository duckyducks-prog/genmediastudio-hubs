interface CardPickerOption {
  value: string;
  title: string;
  description: string;
}

interface CardPickerProps<T extends string> {
  options: CardPickerOption[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}

export function CardPicker<T extends string>({ options, value, onChange, label }: CardPickerProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="card-picker">
      {options.map((opt) => (
        <button
          key={opt.value}
          role="radio"
          aria-checked={value === opt.value}
          className={`picker-card${value === opt.value ? " active" : ""}`}
          onClick={() => onChange(opt.value as T)}
        >
          <div className="picker-card-radio" aria-hidden="true" />
          <div className="picker-card-content">
            <p className="picker-card-title">{opt.title}</p>
            <p className="picker-card-desc">{opt.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
