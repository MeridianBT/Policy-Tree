"use client";

/**
 * The handful of controls this application needs. Deliberately hand-built and
 * tiny: the sheet is the product, and a control library would add weight
 * without adding anything the sheet uses.
 *
 * Anything that opens over the page - the filter panels, the Share menu - goes
 * through `usePanel`, so there is one definition of how a panel opens, where it
 * hangs from and what closes it. Two of those would drift, and the way they
 * drift is invisible until somebody's panel opens off the side of the screen.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

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
  /*
   * The glass sits inside the field and the label comes off the row entirely.
   *
   * That is the convention everywhere else - a field with a magnifier in it is
   * a search box without having to be told - and it gives the toolbar back the
   * width the word "Find" was spending. The label is not deleted though, it
   * moves to `aria-label`: it is what a screen reader announces, and trading
   * that for a few pixels would be a regression dressed as a tidy-up. The
   * placeholder keeps the word too, since a placeholder is the one instruction
   * still visible when the field is empty.
   */
  return (
    <label className="flex items-center text-[11px] text-ink-muted" title={title}>
      <span className="relative flex items-center">
        <Search
          size={11}
          aria-hidden
          className="pointer-events-none absolute left-1.5 text-ink-faint"
        />
        <input
          type="search"
          value={value}
          aria-label={label}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onChange("");
            }
          }}
          className="w-44 rounded-sm border border-rule bg-paper py-1 pl-6 pr-6 text-[11px] text-ink placeholder:text-ink-faint"
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

/**
 * Everything a panel hanging off a button has to get right.
 *
 * Opening measures the button against the window and picks the edge that keeps
 * the whole panel on screen - done in the handler, because the button's
 * position is known at the moment of the click and nothing has to re-render to
 * find it out.
 *
 * Dismissal listens on `pointerdown` rather than `mousedown` so a touch or a
 * pen closes it the same way a mouse does, and on `focusin` as well so tabbing
 * away closes it too: a panel left hanging over the sheet after the keyboard
 * has moved on is the "menu that would not go away". Escape closes it and puts
 * focus back on the button, which is where the reader expects to be.
 *
 * A resize closes it outright. `event.target` for a resize is the window, and
 * `Node.contains(window)` throws rather than returning false - enough to
 * swallow the close entirely - and the measured position is stale anyway.
 */
function usePanel(width: number = PANEL_WIDTH_PX) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onAway(event: Event) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
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
    window.addEventListener("resize", onWindowChange);
    return () => {
      document.removeEventListener("pointerdown", onAway);
      document.removeEventListener("focusin", onAway);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onWindowChange);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      const rect = button.current?.getBoundingClientRect();
      if (rect) setAlignRight(rect.left + width > window.innerWidth - PANEL_MARGIN_PX);
    }
    setOpen((previous) => !previous);
  }

  return { open, setOpen, alignRight, ref, button, toggle };
}

/**
 * A menu of actions hanging off a button.
 *
 * Actions rather than options, which is the whole difference from
 * `MultiSelect`: choosing one does something and closes the menu, so the items
 * are `menuitem`s and the panel is a `menu`. It exists because a toolbar that
 * shows every action at once stops being a toolbar - four labelled links across
 * the top of the sheet were spending the width the filters need.
 *
 * The button keeps its word beside its icon. An icon alone is a guess for
 * anybody who has not used the app before, and the pair is still narrower than
 * the links it replaces.
 */
export function Menu({
  label,
  icon,
  title,
  children,
  width = PANEL_WIDTH_PX,
  panelRole = "menu",
  onOpenChange,
  labelClassName,
  buttonClassName = "flex items-center gap-1 rounded-sm border border-rule bg-paper px-2 py-1 text-[11px] text-ink hover:bg-paper-sunken",
}: {
  label: string;
  icon?: ReactNode;
  title?: string;
  /** Rendered inside the panel. `MenuItem` and `MenuLink` are what belongs here. */
  children: ReactNode | ((close: () => void) => ReactNode);
  width?: number;
  /**
   * `menu` for a list of actions. `group` for a panel of controls - the account
   * panel holds two forms, and calling a form a menu would tell a screen reader
   * to expect menu items it will not find.
   */
  panelRole?: "menu" | "group";
  buttonClassName?: string;
  /**
   * Applied to the label text alone. The account menu hides its name below
   * `sm`, where a nav bar has no room for it and the icons say enough.
   */
  labelClassName?: string;
  /**
   * Told when the panel opens and closes. A caller whose panel has more than
   * one state - the Share menu turns into a send form - needs to know when it
   * was reopened so it can start again from the top.
   */
  onOpenChange?: (open: boolean) => void;
}) {
  const { open, setOpen, alignRight, ref, button, toggle } = usePanel(width);

  /*
   * Arrow keys move between items, which is what a menu is expected to do and
   * what a keyboard reader will try. The items are whatever the caller passed,
   * so they are found in the DOM rather than tracked in state - there is no
   * list to keep in step that way.
   */
  function closeMenu() {
    setOpen(false);
    onOpenChange?.(false);
  }

  function onButtonClick() {
    onOpenChange?.(!open);
    toggle();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
      .filter((item) => !item.hasAttribute("disabled"));
    if (items.length === 0) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? at + 1 : at - 1;
    items[(next + items.length) % items.length]?.focus();
  }

  return (
    <div ref={ref} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        onClick={onButtonClick}
        aria-expanded={open}
        aria-haspopup={panelRole === "menu" ? "menu" : "dialog"}
        title={title}
        className={buttonClassName}
      >
        {icon}
        <span className={labelClassName}>{label}</span>
        <ChevronDown size={11} />
      </button>

      {open && (
        <div
          role={panelRole}
          aria-label={label}
          className={`absolute top-full z-50 mt-1 rounded-sm border border-rule-strong bg-paper py-1 shadow-lg ${
            alignRight ? "right-0" : "left-0"
          }`}
          style={{ width }}
        >
          {typeof children === "function" ? children(closeMenu) : children}
        </div>
      )}
    </div>
  );
}

/**
 * One row in a panel. Exported because the account menu's rows are a link, a
 * link and a form rather than menu items, and a second set of paddings beside
 * this one would drift from it the first time either changed.
 */
export const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] text-ink hover:bg-paper-sunken focus:bg-paper-sunken focus:outline-none";

/** One action in a `Menu`. */
export function MenuItem({
  children,
  onClick,
  icon,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  title?: string;
}) {
  return (
    <button type="button" role="menuitem" onClick={onClick} title={title} className={MENU_ITEM_CLASS}>
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

/**
 * One item in a `Menu` that is really a link.
 *
 * A link rather than a button on purpose: Export and the print views are URLs a
 * reader may want to open in a new tab, copy, or bookmark, and a button that
 * calls `location.assign` takes all three away.
 */
export function MenuLink({
  children,
  href,
  icon,
  title,
  newTab,
  onNavigate,
}: {
  children: ReactNode;
  href: string;
  icon?: ReactNode;
  title?: string;
  newTab?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <a
      role="menuitem"
      href={href}
      title={title}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noreferrer" : undefined}
      onClick={onNavigate}
      className={MENU_ITEM_CLASS}
    >
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
    </a>
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
  // Opening, dismissal and the edge it hangs from are `usePanel`'s - the same
  // behaviour the Share menu has, defined once.
  const { open, alignRight, ref, button, toggle: togglePanel } = usePanel();

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={button}
        type="button"
        onClick={togglePanel}
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
