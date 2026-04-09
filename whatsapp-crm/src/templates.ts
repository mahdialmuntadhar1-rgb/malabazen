import { promises as fs } from 'node:fs';
import { Strategy } from './types.js';

const builtInTemplates: Record<Strategy, string> = {
  A: `{name} 👋

نُدرج مشروعك في Iraq Compass — أكبر دليل أعمال عراقي مجاني.
يساعد العملاء يلقونك بسهولة على الإنترنت.

أضف مشروعك الآن 👇
https://iraq-compass.pages.dev

يستغرق دقيقتين فقط.
— فريق Iraq Compass`,
  B: `مرحباً {name} 👋

عندنا طريقة تساعد عملاء جدد يلقون مشروعك أونلاين — ومجانية تماماً.

رد بـ نعم وأرسلك التفاصيل 🙂`,
  C: `{name}، سؤال سريع 🤔

كم عميل جديد تجيبهم من الإنترنت شهرياً؟

معظم الأعمال العراقية تفقد عملاء لأنهم ما يظهرون أونلاين.
لو تبغى تعرف كيف تحل هذا — رد وأخبرك.`
};

const strategyBFollowup = `ممتاز! 🎉

Iraq Compass هو دليل الأعمال العراقي الأول.
500+ مشروع مسجل. العملاء يبحثون عنك كل يوم.

سجّل مشروعك مجاناً هنا 👇
https://iraq-compass.pages.dev`;

export async function loadTemplate(strategy: Strategy, templatePath?: string): Promise<string> {
  if (!templatePath) {
    return builtInTemplates[strategy];
  }

  const raw = await fs.readFile(templatePath, 'utf-8');
  return raw.trim();
}

export function renderTemplate(template: string, name: string): string {
  return template.replaceAll('{name}', name.trim());
}

export function getStrategyBFollowupTemplate(): string {
  return strategyBFollowup;
}
