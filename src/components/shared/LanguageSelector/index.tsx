// 语言选择器 - 复用的语言下拉选择组件
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SUPPORTED_LANGUAGES } from '@/types'
import type { Language } from '@/types'

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
        {languages.map((lang: Language) => (
          <SelectItem key={lang.code} value={lang.code}>
            {lang.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
