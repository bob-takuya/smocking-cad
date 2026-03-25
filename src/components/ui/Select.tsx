import { forwardRef, type SelectHTMLAttributes } from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, value, onChange, className = '', ...props }, ref) => {
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        {label && (
          <label className="text-xs text-[var(--text-secondary)]">{label}</label>
        )}
        <select
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="px-2 py-1.5 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)]
                     border border-[var(--border)] rounded cursor-pointer
                     focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                     hover:border-[var(--border-light)]"
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
);

Select.displayName = 'Select';
