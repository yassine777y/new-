/** The React side of i18n: one hook, bound to the store's current language. */

import { useCallback } from 'react'
import { useStore } from '@/state/store'
import { LANG_META, dirFor, speechLangFor, translate, type I18nKey, type Lang } from './index'

export interface I18n {
  lang: Lang
  dir: 'ltr' | 'rtl'
  /** BCP-47 tag for speech recognition and synthesis. */
  speech: string
  /** Native name of the language, for the switcher. */
  label: string
  t: (key: I18nKey, vars?: Record<string, string | number>) => string
  setLang: (lang: Lang) => void
}

export function useI18n(): I18n {
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const t = useCallback((key: I18nKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang])
  return { lang, dir: dirFor(lang), speech: speechLangFor(lang), label: LANG_META[lang].native, t, setLang }
}
