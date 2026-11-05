import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** What onChange receives. Same shape the code used with a native <select>: e.target.value. */
export interface SelectChangeEvent {
  target: { value: string; name: string };
  currentTarget: { value: string; name: string };
}

interface ParsedOption {
  value: string;
  label: ReactNode;
  disabled: boolean;
  group?: string;
}

export interface SelectProps {
  value?: string | number | null;
  defaultValue?: string | number;
  onChange?: (event: SelectChangeEvent) => void;
  /** Plain <option> / <optgroup> children, exactly as for a native <select>. */
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  title?: string;
  /** Shown when the selected option is the empty one (value="") or nothing is selected. */
  placeholder?: string;
  'aria-label'?: string;
}

/** Flattens <option>, <optgroup> and fragments (including .map() output) into a plain list. */
function parseOptions(children: ReactNode, group?: string, out: ParsedOption[] = []): ParsedOption[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const element = child as ReactElement<{ value?: string | number; disabled?: boolean; label?: string; children?: ReactNode }>;
    if (element.type === Fragment) {
      parseOptions(element.props.children, group, out);
    } else if (element.type === 'optgroup') {
      parseOptions(element.props.children, element.props.label, out);
    } else if (element.type === 'option') {
      const content = element.props.children;
      const text = Children.toArray(content).join('');
      out.push({
        value: element.props.value !== undefined ? String(element.props.value) : text,
        label: content ?? element.props.label ?? '',
        disabled: element.props.disabled === true,
        group,
      });
    }
  });
  return out;
}

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 288;

/**
 * Themed dropdown that replaces the browser's native <select>.
 *
 * - Works as a drop-in: keep the <option> children and `onChange={(e) => e.target.value}`.
 * - Selected option gets a tick on the right. Light and dark mode follow the app theme.
 * - The list renders in a portal so modals and overflow:hidden cards never clip it, and it
 *   opens upward when there is not enough room below.
 * - Keyboard: Enter/Space/Arrows open, Arrows move, Home/End jump, Enter selects, Esc closes.
 * - A hidden input mirrors the value so `required` and FormData keep working.
 */
export default function Select({
  value,
  defaultValue,
  onChange,
  children,
  className,
  disabled = false,
  required = false,
  name,
  id,
  title,
  placeholder = 'Select...',
  'aria-label': ariaLabel,
}: SelectProps) {
  const options = useMemo(() => parseOptions(children), [children]);

  const isControlled = value !== undefined;
  const [inner, setInner] = useState(String(defaultValue ?? ''));
  const current = isControlled ? String(value ?? '') : inner;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedIndex = options.findIndex((option) => option.value === current);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const showPlaceholder = !selected || selected.value === '';

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - MENU_GAP - 8;
    const above = rect.top - MENU_GAP - 8;
    const openUp = below < 180 && above > below;
    const maxHeight = Math.max(120, Math.min(MENU_MAX_HEIGHT, openUp ? above : below));
    const width = Math.max(rect.width, 160);
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    setPosition(
      openUp
        ? { bottom: window.innerHeight - rect.top + MENU_GAP, left, width, maxHeight }
        : { top: rect.bottom + MENU_GAP, left, width, maxHeight },
    );
  }, []);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const openMenu = () => {
    if (disabled) return;
    place();
    setActive(selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled));
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    if (!isControlled) setInner(option.value);
    if (option.value !== current) {
      const target = { value: option.value, name: name ?? '' };
      onChange?.({ target, currentTarget: target });
    }
    close(true);
  };

  // Keep the list attached to the trigger while it is open.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = (event: Event) => {
      // Scrolling inside the list itself must not close it.
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) return;
      close();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, place, close]);

  // Close on outside press.
  useEffect(() => {
    if (!open) return;
    const onPress = (event: PointerEvent) => {
      const node = event.target as Node;
      if (triggerRef.current?.contains(node) || menuRef.current?.contains(node)) return;
      close();
    };
    document.addEventListener('pointerdown', onPress);
    return () => document.removeEventListener('pointerdown', onPress);
  }, [open, close]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!open || active < 0) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const step = (from: number, direction: 1 | -1) => {
    for (let i = from + direction; i >= 0 && i < options.length; i += direction) {
      if (!options[i].disabled) return i;
    }
    return from;
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); setActive((i) => step(i, 1)); break;
      case 'ArrowUp': event.preventDefault(); setActive((i) => step(i, -1)); break;
      case 'Home': event.preventDefault(); setActive(step(-1, 1)); break;
      case 'End': event.preventDefault(); setActive(step(options.length, -1)); break;
      case 'Enter':
      case ' ': event.preventDefault(); choose(active); break;
      case 'Escape': event.preventDefault(); close(true); break;
      case 'Tab': close(); break;
      default: break;
    }
  };

  let lastGroup: string | undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        title={title}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          'input-field flex w-full items-center justify-between gap-2 pr-3 text-left',
          className,
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', showPlaceholder && 'text-gray-400 dark:text-gray-500')}>
          {showPlaceholder ? (selected && selected.label !== '' ? selected.label : placeholder) : selected.label}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {/* Mirrors the value so `required` validation and FormData behave like a native select. */}
      {(required || name) && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          required={required}
          value={current}
          onChange={() => undefined}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      )}

      {open && position && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            style={{
              position: 'fixed',
              top: position.top,
              bottom: position.bottom,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
            className="z-[10050] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-1 shadow-xl ring-1 ring-black/5 animate-fade-in dark:border-brand-700 dark:bg-brand-900 dark:ring-white/5"
          >
            {options.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No options</div>}
            {options.map((option, index) => {
              const header = option.group && option.group !== lastGroup ? option.group : null;
              lastGroup = option.group;
              const isSelected = index === selectedIndex;
              return (
                <Fragment key={`${option.value}-${index}`}>
                  {header && (
                    <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{header}</div>
                  )}
                  <div
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    data-index={index}
                    onMouseEnter={() => !option.disabled && setActive(index)}
                    onClick={() => choose(index)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm',
                      isSelected ? 'font-semibold text-brand-700 dark:text-brand-300' : 'text-gray-700 dark:text-gray-200',
                      index === active && !option.disabled && 'bg-brand-50 dark:bg-brand-800',
                      option.disabled && 'cursor-not-allowed opacity-40',
                      option.value === '' && !isSelected && 'text-gray-400 dark:text-gray-500',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label !== '' ? option.label : placeholder}</span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />}
                  </div>
                </Fragment>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
