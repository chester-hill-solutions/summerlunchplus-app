import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Database, Json } from '@/lib/database.types'

const AGREEMENT_OPTIONS = [
  'Strongly Agree',
  'Agree',
  'Neutral',
  'Disagree',
  'Strongly Disagree',
  "I'm not Sure",
]

const normalizeOptions = (options: Json): string[] => {
  if (!Array.isArray(options)) return []
  return options.filter((value): value is string => typeof value === 'string')
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export type FormQuestionData = {
  question_code: string
  prompt: string
  type: Database['public']['Enums']['form_question_type']
  options: Json
  metadata?: Json
  visibility_condition?: Json
}

type FormQuestionProps = {
  question: FormQuestionData
  value?: Json
  required?: boolean
}

export function FormQuestion({ question, value, required }: FormQuestionProps) {
  const name = `question_${question.question_code}`
  const options = question.type === 'agreement' ? AGREEMENT_OPTIONS : normalizeOptions(question.options)
  const metadata = (question.metadata ?? {}) as Record<string, Json>
  const ui = typeof metadata.ui === 'string' ? metadata.ui : null
  const inputType = typeof metadata.input_type === 'string' ? metadata.input_type : null
  const placeholder = typeof metadata.placeholder === 'string' ? metadata.placeholder : undefined
  const autoComplete = typeof metadata.autocomplete === 'string' ? metadata.autocomplete : undefined
  const min = typeof metadata.min === 'number' ? metadata.min : undefined
  const max = typeof metadata.max === 'number' ? metadata.max : undefined
  const step = typeof metadata.step === 'number' ? metadata.step : undefined
  const selectClasses =
    'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'

  const checkedValue = (option: string) => {
    if (Array.isArray(value)) {
      return value.includes(option)
    }
    return value === option
  }

  const renderRadioGroup = (items: string[]) => (
    <fieldset className="space-y-2">
      <Label className="text-base">{question.prompt}</Label>
      <div className="grid gap-3">
        {items.map(option => {
          const optionId = `${name}-${slugify(option)}`
          return (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={name}
                id={optionId}
                value={option}
                defaultChecked={checkedValue(option)}
                required={required}
                className="h-4 w-4"
              />
              <span className="text-slate-900">{option}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )

  if (question.type === 'single_choice' || question.type === 'agreement') {
    if (ui === 'select') {
      return (
        <div className="grid gap-2">
          <Label htmlFor={name}>{question.prompt}</Label>
          <select
            id={name}
            name={name}
            defaultValue={typeof value === 'string' ? value : ''}
            className={selectClasses}
            required={required}
          >
            <option value="" disabled>
              Select an option
            </option>
            {options.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      )
    }
    return renderRadioGroup(options)
  }

  if (question.type === 'multi_choice') {
    return (
      <fieldset className="space-y-2">
        <Label className="text-base">{question.prompt}</Label>
        <div className="grid gap-2">
          {options.map(option => {
            const optionId = `${name}-${slugify(option)}`
            return (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={name}
                  id={optionId}
                  value={option}
                  defaultChecked={Array.isArray(value) && value.includes(option)}
                  className="h-4 w-4"
                />
                <span className="text-slate-900">{option}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
    )
  }

  if (question.type === 'checkbox') {
    const isChecked = value === true || value === 'true'
    return (
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={name}
          name={name}
          value="true"
          defaultChecked={isChecked}
          className="h-4 w-4"
        />
        <Label htmlFor={name}>{question.prompt}</Label>
      </div>
    )
  }

  const resolvedInputType = inputType ?? (question.type === 'date' ? 'date' : 'text')
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{question.prompt}</Label>
      <Input
        id={name}
        name={name}
        type={resolvedInputType}
        defaultValue={typeof value === 'string' ? value : ''}
        placeholder={placeholder}
        autoComplete={autoComplete}
        min={min}
        max={max}
        step={step}
        required={required}
      />
    </div>
  )
}

export default FormQuestion
