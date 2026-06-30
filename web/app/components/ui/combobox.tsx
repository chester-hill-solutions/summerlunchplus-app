import { useEffect, useMemo, useState } from 'react'

import { Check } from 'lucide-react'

import { Input } from '@/components/ui/input'

type ComboboxOption = {
  value: string
  label: string
  keywords?: string[]
}

type ComboboxProps = {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  disabled?: boolean
}

const optionLabel = (options: ComboboxOption[], value: string) => {
  const option = options.find(item => item.value === value)
  return option?.label ?? ''
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const fuzzyMatch = (option: ComboboxOption, query: string) => {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return true

  const haystacks = [option.label, option.value, ...(option.keywords ?? [])].map(value => value.toLowerCase())
  if (haystacks.some(value => value.includes(trimmed))) return true

  const normalizedQuery = normalize(trimmed)
  if (!normalizedQuery) return true
  return haystacks.some(value => normalize(value).includes(normalizedQuery))
}

export function Combobox({ value, onChange, options, placeholder, disabled }: ComboboxProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setQuery(optionLabel(options, value))
  }, [value, options])

  const filteredOptions = useMemo(() => {
    return options
      .filter(option => fuzzyMatch(option, query))
      .slice(0, 50)
  }, [options, query])

  const handleSelect = (nextValue: string) => {
    onChange(nextValue)
    setQuery(optionLabel(options, nextValue))
    setOpen(false)
  }

  return (
    <div className="relative z-40">
      <Input
        value={query}
        placeholder={placeholder ?? 'Search...'}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 100)
        }}
        onChange={event => {
          const next = event.target.value
          setQuery(next)
          setOpen(true)
          const exactMatch = options.find(
            option => option.label.toLowerCase() === next.toLowerCase() || option.value === next
          )
          if (exactMatch) {
            onChange(exactMatch.value)
          } else if (!next) {
            onChange('')
          }
        }}
        disabled={disabled}
      />
      {open ? (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {filteredOptions.length ? (
            filteredOptions.map(option => {
              const isSelected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => handleSelect(option.value)}
                  className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected ? <Check className="ml-2 size-4" /> : null}
                </button>
              )
            })
          ) : (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
