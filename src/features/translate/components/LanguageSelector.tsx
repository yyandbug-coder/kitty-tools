import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@translate/components/ui/select'
import { SUPPORTED_LANGUAGES } from '@translate/types'
import type { Language } from '@translate/types'

interface LanguageSelectorProps {
  value: string
  onChange: (value: string) => void
  excludeCodes?: string[]
}

export function LanguageSelector({ value, onChange, excludeCodes = [] }: LanguageSelectorProps) {
  const languages = SUPPORTED_LANGUAGES.filter(
    (lang: Language) => !excludeCodes.includes(lang.code)
  )

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="选择语言" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {languages.map((lang: Language) => (
            <SelectItem key={lang.code} value={lang.code}>
              {lang.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
