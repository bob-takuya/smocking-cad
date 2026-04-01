import { forwardRef, type InputHTMLAttributes } from 'react';

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  showValue?: boolean;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      label,
      value,
      min = 0,
      max = 100,
      step = 1,
      showValue = true,
      formatValue,
      onChange,
      className = '',
      ...props
    },
    ref
  ) => {
    const displayValue = formatValue ? formatValue(value) : value.toFixed(step < 1 ? 2 : 0);

    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        {(label || showValue) && (
          <div className="flex justify-between items-center text-xs">
            {label && <span className="text-[var(--text-secondary)]">{label}</span>}
            {showValue && (
              <span className="text-[var(--text-primary)] mono tabular-nums">{displayValue}</span>
            )}
          </div>
        )}
        <input
          ref={ref}
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-2 md:h-1 rounded-full appearance-none cursor-pointer bg-[var(--border-light)]
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                     md:[&::-webkit-slider-thumb]:w-3 md:[&::-webkit-slider-thumb]:h-3
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)]
                     [&::-webkit-slider-thumb]:hover:bg-[var(--accent-hover)] [&::-webkit-slider-thumb]:cursor-pointer
                     [&::-webkit-slider-thumb]:transition-colors
                     [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5
                     md:[&::-moz-range-thumb]:w-3 md:[&::-moz-range-thumb]:h-3
                     [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--accent)]
                     [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
          {...props}
        />
      </div>
    );
  }
);

Slider.displayName = 'Slider';
