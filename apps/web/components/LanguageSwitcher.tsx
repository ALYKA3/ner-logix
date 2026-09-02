"use client";

import type {AppLanguage} from "@/lib/i18n";
import {languages} from "@/lib/i18n";

export default function LanguageSwitcher({language,onChange}:{language:AppLanguage;onChange:(language:AppLanguage)=>void}){
  return <label className="language-switcher"><span>भाषा / ভাষা</span><select aria-label="Interface language" value={language} onChange={(event)=>onChange(event.target.value as AppLanguage)}>{languages.map((item)=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label>;
}
