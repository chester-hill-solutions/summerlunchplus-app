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
}

type FormQuestionProps = {
  question: FormQuestionData
  value?: Json
  required?: boolean
}

export function FormQuestion({ question, value, required }: FormQuestionProps) {
  const name = `question_${question.question_code}`
  const options = question.type === 'agreement' ? AGREEMENT_OPTIONS : normalizeOptions(question.options)

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

  const inputType = question.type === 'date' ? 'date' : 'text'
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{question.prompt}</Label>
      <Input id={name} name={name} type={inputType} defaultValue={typeof value === 'string' ? value : ''} required={required} />
    </div>
  )
}

export default FormQuestion
