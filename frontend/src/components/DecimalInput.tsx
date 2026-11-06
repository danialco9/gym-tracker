import { useState, type ComponentProps } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { parseOptionalNumber } from '@/features/routines/routine-form'

/** Spanish decimals, as everywhere else in the app: 37,5 rather than 37.5. */
const toInputText = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value).replace('.', ',') : ''

type DecimalInputProps<T extends FieldValues> = Omit<
  ComponentProps<typeof Input>,
  'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'ref'
> & {
  control: Control<T>
  name: FieldPath<T>
}

/**
 * A number field of a react-hook-form form that reads and writes Spanish decimals. It keeps the
 * typed text, so "37," lives until the 5 arrives, and hands the form the parsed number (null when
 * empty, NaN when it is not a number, for the schema to reject).
 */
export function DecimalInput<T extends FieldValues>({ control, name, ...props }: DecimalInputProps<T>) {
  const {
    field: { ref, value, onChange, onBlur },
  } = useController({ control, name })
  const [text, setText] = useState(() => toInputText(value))
  const [shown, setShown] = useState<unknown>(value)
  // The form changed the value itself (a reset that loads another entry): show the new one.
  if (!Object.is(value, shown)) {
    setShown(value)
    if (!Object.is(parseOptionalNumber(text), value)) {
      setText(toInputText(value))
    }
  }

  return (
    <Input
      inputMode="decimal"
      {...props}
      ref={ref}
      name={name}
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        onChange(parseOptionalNumber(event.target.value))
      }}
      onBlur={onBlur}
    />
  )
}
