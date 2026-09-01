"use client";

/**
 * The four controls this application needs. Deliberately hand-built and tiny:
 * the sheet is the product, and a control library would add weight without
 * adding anything the sheet uses.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, X } from "lucide-react";

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

/**
 * A search box that can be cleared without reaching for the keyboard.
 *
 * `type="search"` rather than `type="text"`: it gets the browser's own clear
 * affordance and, on the iPad the sheet is read on, a keyboard with a Search
 * key instead of a Return key. Escape clears it too, because a filter nobody
 * can see the end of is a filter people think is a bug.
 */
export function SearchBox({
  value,
  onChange,
  label,
  placeholder,
  title,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  title?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-ink-muted" title={title}>
      {label}
      <span className="relative flex items-center">
        <input
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onChange("");
            }
          }}
          className="w-40 rounded-sm border border-rule bg-paper px-1.5 py-1 text-[11px] text-ink placeholder:text-ink-faint"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            title="Clear the search"
            aria-label="Clear the search"
            className="absolute right-1 flex size-4 items-center justify-center rounded-sm text-ink-faint hover:bg-rule hover:text-ink"
          >
            <X size={11} />
          </button>
        )}
      </span>
    </label>
  );
}

/** Panel geometry, shared by the measurement and the panel itself so the two
 *  cannot disagree about how much room it needs. */
const PANEL_WIDTH_PX = 256;
const PANEL_MARGIN_PX = 8;

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
  // Which edge the panel hangs from. Decided when it opens, because a panel
  // anchored left from a button near the right of the window runs off the
  // screen - and there is nothing to scroll to reach it, so the options simply
  // are not there. See `openPanel`.
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    /*
     * Dismissal listens on `pointerdown` rather than `mousedown` so that a
     * touch or a pen closes the panel the same way a mouse does, and on
     * `focusin` as well so that tabbing away closes it too - a panel left
     * hanging over the sheet after the keyboard moved on is the "menu that
     * would not go away".
     */
    function onAway(event: Event) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    // A resize has no meaningful target - `event.target` is the window, and
    // `Node.contains(window)` throws rather than returning false, which is
    // enough to swallow the close entirely. Nothing to test: the window moved,
    // so the panel's measured position is stale by definition.
    function onWindowChange() {
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onAway);
    document.addEventListener("focusin", onAway);
    document.addEventListener("keydown", onKeyDown);
    // A panel positioned against the window has to go when the window moves
    // under it, rather than float over content it no longer belongs to.
    window.addEventListener("resize", onWindowChange);
    return () => {
      document.removeEventListener("pointerdown", onAway);
      document.removeEventListener("focusin", onAway);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onWindowChange);
    };
  }, [open]);

  /**
   * Opening measures the button against the window and picks the edge that
   * keeps the whole panel on screen. Done here, in the event handler, because
   * the button's position is known at the moment of the click and nothing has
   * to re-render to find it out.
   */
  function openPanel() {
    if (!open) {
      const rect = button.current?.getBoundingClientRect();
      if (rect) setAlignRight(rect.left + PANEL_WIDTH_PX > window.innerWidth - PANEL_MARGIN_PX);
    }
    setOpen((previous) => !previous);
  }

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={button}
        type="button"
        onClick={openPanel}
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
          className={`absolute top-full z-50 mt-1 max-h-72 overflow-auto rounded-sm border border-rule-strong bg-paper py-1 shadow-lg ${
            alignRight ? "right-0" : "left-0"
          }`}
          style={{ width: PANEL_WIDTH_PX }}
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
