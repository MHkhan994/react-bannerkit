/*
 * The inspector: a dumb renderer of the field descriptors from
 * `state/inspector.ts`.
 *
 * Every decision about which control appears, what it is bounded to, and what it
 * writes lives in that pure module and is tested there. This file only knows how
 * to draw each `kind`.
 */
import { useRef, useState } from 'react'

import { iconPath } from '../../core/icons'
import { inspectorModel, type Field } from '../state/inspector'
import type { EditorAction, EditorState } from '../state/reducer'
import {
  Button,
  Input,
  Range,
  Segmented,
  Swatches,
  Textarea,
  cn,
} from '../ui/primitives'

export interface InspectorProps {
  state: EditorState
  dispatch: (action: EditorAction) => void
  /** Uploads a chosen file and resolves its URL. */
  onUploadImage?: ((file: File) => Promise<string>) | undefined
}

export function Inspector({ state, dispatch, onUploadImage }: InspectorProps) {
  const model = inspectorModel(state)

  return (
    <div className="bnb-inspector border-l border-border">
      <div className="flex flex-col gap-1 px-4 py-3">
        <span className="bnb-label">{model.kicker}</span>
        <h2 className="text-[17px] font-semibold leading-tight text-foreground">{model.title}</h2>
        {model.note ? (
          <p className="mt-1 text-[11.5px] leading-[1.55] text-muted-foreground">{model.note}</p>
        ) : null}
      </div>

      <div className="h-px w-full bg-border" />

      <div className="flex flex-col gap-3.5 px-4 py-3">
        {model.fields.map((field) => (
          <FieldRow
            key={field.label}
            field={field}
            dispatch={dispatch}
            onUploadImage={onUploadImage}
          />
        ))}

        {state.selection.kind === 'element' ? (
          <Button
            variant="destructive"
            className="mt-1"
            onClick={() => {
              if (state.selection.kind !== 'element') return
              dispatch({
                type: 'removeElement',
                panelId: state.selection.panelId,
                elementId: state.selection.elementId,
              })
            }}
          >
            Delete element
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function FieldRow({
  field,
  dispatch,
  onUploadImage,
}: {
  field: Field
  dispatch: (action: EditorAction) => void
  onUploadImage?: ((file: File) => Promise<string>) | undefined
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-foreground">{field.label}</span>
        {field.hint ? (
          <span className="shrink-0 text-[10.5px] text-muted-foreground">{field.hint}</span>
        ) : null}
      </span>
      <Control field={field} dispatch={dispatch} onUploadImage={onUploadImage} />
    </label>
  )
}

function Control({
  field,
  dispatch,
  onUploadImage,
}: {
  field: Field
  dispatch: (action: EditorAction) => void
  onUploadImage?: ((file: File) => Promise<string>) | undefined
}) {
  switch (field.kind) {
    case 'text':
      return (
        <Input
          value={field.value}
          placeholder={field.placeholder}
          onChange={(event) => dispatch(field.onChange(event.target.value))}
        />
      )

    case 'textarea':
      return (
        <Textarea
          value={field.value}
          rows={field.rows}
          placeholder={field.placeholder}
          onChange={(event) => dispatch(field.onChange(event.target.value))}
        />
      )

    case 'number':
      return (
        <Input
          type="number"
          value={field.value}
          min={field.min}
          max={field.max}
          step={field.step}
          className="w-24"
          onChange={(event) => {
            const parsed = Number.parseFloat(event.target.value)
            if (Number.isFinite(parsed)) dispatch(field.onChange(parsed))
          }}
        />
      )

    case 'range':
      return (
        <Range
          label={field.label}
          value={field.value}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(value) => dispatch(field.onChange(value))}
        />
      )

    case 'segmented':
      return (
        <Segmented
          label={field.label}
          value={field.value}
          options={field.options}
          onChange={(value) =>
            // The descriptor's value type and its handler always agree; the
            // union of three instantiations cannot express that correlation.
            dispatch((field.onChange as (v: typeof value) => EditorAction)(value))
          }
        />
      )

    case 'color':
      return (
        <Swatches
          label={field.label}
          value={field.value}
          swatches={field.swatches}
          allowTransparent={field.allowTransparent}
          onChange={(value) => dispatch(field.onChange(value))}
        />
      )

    case 'image':
      return (
        <ImageControl
          value={field.value}
          onChange={(value) => dispatch(field.onChange(value))}
          onUploadImage={onUploadImage}
        />
      )

    case 'icon':
      return (
        <div className="grid grid-cols-7 gap-1" role="group" aria-label={field.label}>
          {field.options.map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.label}
              aria-label={option.label}
              aria-pressed={option.value === field.value}
              onClick={() => dispatch(field.onChange(option.value))}
              className={cn(
                'grid h-6 place-items-center rounded-[3px] border transition-colors',
                option.value === field.value
                  ? 'border-ring bg-accent/15 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <svg
                viewBox="0 0 24 24"
                width={13}
                height={13}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={iconPath(option.value)} />
              </svg>
            </button>
          ))}
        </div>
      )
  }
}

/*
 * Choosing an image.
 *
 * With `onUploadImage` the file goes wherever the consumer sends it and the
 * returned URL is stored. Without it the file becomes an object URL, which works
 * for trying things out but dies with the page - so it says so rather than
 * letting someone build a banner that silently breaks on save.
 */
function ImageControl({
  value,
  onChange,
  onUploadImage,
}: {
  value: string
  onChange: (value: string) => void
  onUploadImage?: ((file: File) => Promise<string>) | undefined
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionOnly, setSessionOnly] = useState(false)

  const pick = async (file: File) => {
    setError(null)
    if (!onUploadImage) {
      onChange(URL.createObjectURL(file))
      setSessionOnly(true)
      return
    }
    setBusy(true)
    try {
      onChange(await onUploadImage(file))
      setSessionOnly(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Uploading…' : 'Choose image'}
        </Button>
        {value ? (
          <span
            aria-hidden="true"
            className="h-6 w-9 shrink-0 rounded-[3px] border border-border bg-muted"
            style={{ background: `center/cover no-repeat url(${JSON.stringify(value)})` }}
          />
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void pick(file)
          event.target.value = ''
        }}
      />
      <Input
        value={value}
        placeholder="or paste an image URL"
        onChange={(event) => {
          onChange(event.target.value)
          setSessionOnly(false)
        }}
      />
      {sessionOnly ? (
        <p className="text-[10.5px] leading-[1.5] text-destructive">
          This image only exists in your browser for this session. Pass an{' '}
          <code>onUploadImage</code> handler to store it properly.
        </p>
      ) : null}
      {error ? <p className="text-[10.5px] text-destructive">{error}</p> : null}
    </div>
  )
}
