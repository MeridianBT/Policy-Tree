"use client";

/**
 * The four controls this application needs. Deliberately hand-built and tiny:
 * the sheet is the product, and a control library would add weight without
 * adding anything the sheet uses.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center rounded-sm border border-rule">
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={option.hint}
          onClick={() => onChange(option.value)}
          className={`px-2 py-1 text-[11px] ${index > 0 ? "border-l border-rule" : ""} ${
            value === option.value
              ? "bg-ink text-paper"
              : "bg-paper text-ink-muted hover:bg-paper-sunken"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Select({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-sm border border-rule bg-paper px-1.5 py-1 text-[11px] text-ink"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MultiSelect({
  label,
  selected,
  options,
  onChange,
  renderOption,
}: {
  label: string;
  selected: string[];
  options: Array<{ value: string; label: string }>;
  onChange: (values: string[]) => void;
  renderOption?: (value: string, label: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] ${
          selected.length ? "border-ink bg-paper text-ink" : "border-rule bg-paper text-ink-muted"
        } hover:bg-paper-sunken`}
      >
        {label}
        {selected.length > 0 && <span className="num text-[10px]">({selected.length})</span>}
        <ChevronDown size={11} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute left-0 top-full z-50 mt-1 max-h-72 w-64 overflow-auto rounded-sm border border-rule-strong bg-paper py-1 shadow-lg"
        >
          {options.length === 0 && (
            <p className="px-2 py-1 text-[11px] text-ink-faint">Nothing to filter on.</p>
          )}
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => toggle(option.value)}
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] hover:bg-paper-sunken"
              >
                <span className="flex size-3.5 shrink-0 items-center justify-center border border-rule-strong">
                  {isSelected && <Check size={10} />}
                </span>
                <span className="truncate">{renderOption?.(option.value, option.label) ?? option.label}</span>
              </button>
            );
          })}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full border-t border-rule px-2 py-1 text-left text-[11px] text-ink-muted hover:bg-paper-sunken"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "default",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "default" | "primary" | "quiet";
  disabled?: boolean;
  title?: string;
}) {
  const tone =
    variant === "primary"
      ? "bg-ink text-paper hover:opacity-90"
      : variant === "quiet"
        ? "border border-transparent text-ink-muted hover:bg-paper-sunken"
        : "border border-rule bg-paper text-ink hover:bg-paper-sunken";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-sm px-2.5 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-50 ${tone}`}
    >
      {children}
    </button>
  );
}
