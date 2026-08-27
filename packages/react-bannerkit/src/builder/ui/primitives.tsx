/*
 * The editor's component primitives.
 *
 * shadcn/ui's idiom - `cn()`, `cva` variants, the same class strings and prop
 * shapes - implemented here rather than copied in, for one reason: shadcn's
 * overlay components are built on Radix, and Radix portals to `document.body`,
 * which is outside `.bnb-root`. That is precisely the isolation hole this package
 * exists to close, and a portal container prop is a patch that has to be applied
 * correctly to every primitive forever.
 *
 * So overlays use the native `<dialog>` element, which renders in the top layer
 * while staying in the DOM where it sits - inheriting our scope, our reset, and
 * our palette, with focus trapping and Escape handling supplied by the browser.
 * The package ships zero portals as a result.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import { clsx, type ClassValue } from 'clsx'
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/* ------------------------------------------------------------------- button */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--bnb-radius)] text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'border border-border bg-background text-foreground hover:bg-muted',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        destructive: 'border border-border text-destructive hover:bg-destructive/10',
      },
      size: {
        default: 'h-7 px-2.5',
        sm: 'h-6 px-2 text-[11px]',
        icon: 'h-6 w-6 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

/* -------------------------------------------------------------------- input */

const controlClass =
  'w-full rounded-[var(--bnb-radius)] border border-input bg-background px-2 py-[5px] text-[12px] text-foreground placeholder:text-muted-foreground disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(controlClass, className)} {...props} />
  ),
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(controlClass, 'leading-[1.5]', className)} {...props} />
  ),
)
Textarea.displayName = 'Textarea'

/* -------------------------------------------------------------------- label */

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-[11px] text-foreground', className)}>{children}</span>
}

/** The 10px uppercase section heading from the design handoff. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="bnb-label mb-2">{children}</h3>
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn('h-px w-full bg-border', className)} />
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------- segmented */

export interface SegmentedOption<T> {
  value: T
  label: string
}

/*
 * A segmented control, built as a radiogroup rather than a row of buttons.
 * Arrow-key navigation between options and a single tab stop come from the
 * roles, so keyboard users are not forced to tab through every option.
 */
export function Segmented<T extends string | number | boolean>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
  label: string
}) {
  const index = options.findIndex((option) => option.value === value)

  const move = (delta: number) => {
    const next = options[(index + delta + options.length) % options.length]
    if (next) onChange(next.value)
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || index === -1 ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault()
                move(1)
              }
              if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault()
                move(-1)
              }
            }}
            className={cn(
              'rounded-[var(--bnb-radius)] border px-2 py-[3px] text-[11px] transition-colors',
              active
                ? 'border-ring bg-accent/15 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ swatches */

export const TRANSPARENT = 'transparent'

export function Swatches({
  value,
  swatches,
  onChange,
  allowTransparent,
  label,
}: {
  value: string
  swatches: readonly { value: string; label: string }[]
  onChange: (value: string) => void
  allowTransparent?: boolean | undefined
  label: string
}) {
  const id = useId()
  const options = allowTransparent
    ? [{ value: TRANSPARENT, label: 'Transparent' }, ...swatches]
    : swatches

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {options.map((swatch) => {
        const active = swatch.value === value
        const transparent = swatch.value === TRANSPARENT
        return (
          <button
            key={swatch.value}
            type="button"
            title={swatch.label}
            aria-label={swatch.label}
            aria-pressed={active}
            onClick={() => onChange(swatch.value)}
            className={cn(
              'h-6 w-6 rounded-[3px] border transition-shadow',
              // The checkerboard is how transparent reads as a colour choice.
              transparent && 'bnb-checker',
              active ? 'border-ring ring-1 ring-ring' : 'border-border',
            )}
            style={transparent ? undefined : { backgroundColor: swatch.value }}
          />
        )
      })}
      {/*
        A free-form colour input alongside the swatches: the swatch row is a
        shortcut, not a restriction, and a brand colour will rarely be in it.
      */}
      <label className="ml-0.5 inline-flex" title="Custom colour">
        <span className="sr-only">{`${label}: custom colour`}</span>
        <input
          id={id}
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
          onChange={(event) => onChange(event.target.value)}
          className="h-6 w-6 cursor-pointer rounded-[3px] border border-border bg-background p-0"
        />
      </label>
    </div>
  )
}

/* -------------------------------------------------------------------- range */

export function Range({
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
  label,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  /** Called when the drag ends, so a slider sweep is one undo step. */
  onCommit?: () => void
  label: string
}) {
  return (
    <input
      type="range"
      className="bnb-range w-full"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(Number.parseFloat(event.target.value))}
      onPointerUp={onCommit}
      onKeyUp={onCommit}
      onBlur={onCommit}
    />
  )
}

/* ------------------------------------------------------------------- dialog */

/*
 * Built on the native `<dialog>` element.
 *
 * It stays where it is in the DOM, so it inherits `.bnb-root` and cannot lose
 * its styling the way a portalled overlay does. The browser supplies the modal
 * backdrop, focus trapping, and Escape-to-close, which is a great deal of
 * fiddly behaviour not to have to reimplement.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string | undefined
  children?: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Escape and backdrop dismissal both come back through here.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose()
      }}
      className="bnb-dialog"
    >
      <div className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-[17px] font-semibold text-foreground">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="text-[12px] leading-[1.6] text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {children}
        {footer ? <div className="flex justify-end gap-2 pt-1">{footer}</div> : null}
      </div>
    </dialog>
  )
}
