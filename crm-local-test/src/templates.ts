import { readFileSync } from 'fs';
import { CampaignConfig } from './types';

const STRATEGY_A_TEMPLATE = `{name} 👋

نُدرج مشروعك في Iraq Compass — أكبر دليل أعمال عراقي مجاني.
يساعد العملاء يلقونك بسهولة على الإنترنت.

أضف مشروعك الآن 👇
https://iraq-compass.pages.dev

يستغرق دقيقتين فقط.
— فريق Iraq Compass`;

const STRATEGY_B_MESSAGE_1 = `مرحباً {name} 👋

عندنا طريقة تساعد عملاء جدد يلقون مشروعك أونلاين — ومجانية تماماً.

رد بـ نعم وأرسلك التفاصيل 🙂`;

const STRATEGY_B_MESSAGE_2 = `ممتاز! 🎉

Iraq Compass هو دليل الأعمال العراقي الأول.
500+ مشروع مسجل. العملاء يبحثون عنك كل يوم.

سجّل مشروعك مجاناً هنا 👇
https://iraq-compass.pages.dev`;

const STRATEGY_C_TEMPLATE = `{name}، سؤال سريع 🤔

كم عميل جديد تجيبهم من الإنترنت شهرياً؟

معظم الأعمال العراقية تفقد عملاء لأنهم ما يظهرون أونلاين.
لو تبغى تعرف كيف تحل هذا — رد وأخبرك.`;

export function getMessageTemplate(
  name: string,
  config: CampaignConfig,
  isFollowUp: boolean = false
): string {
  // Custom template file takes precedence
  if (config.templatePath) {
    try {
      const customTemplate = readFileSync(config.templatePath, 'utf-8');
      return customTemplate.replace(/\{name\}/g, name);
    } catch (err) {
      console.warn(`Failed to load custom template: ${err}. Using strategy ${config.strategy}.`);
    }
  }

  switch (config.strategy) {
    case 'A':
      return STRATEGY_A_TEMPLATE.replace(/\{name\}/g, name);
    case 'B':
      return isFollowUp ? STRATEGY_B_MESSAGE_2 : STRATEGY_B_MESSAGE_1.replace(/\{name\}/g, name);
    case 'C':
      return STRATEGY_C_TEMPLATE.replace(/\{name\}/g, name);
    default:
      return STRATEGY_A_TEMPLATE.replace(/\{name\}/g, name);
  }
}

export function shouldSendFollowUp(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  const positiveResponses = ['نعم', 'yes', 'yeah', 'yup', 'sure', 'ok', 'تمام', 'أكيد', 'بالتأكيد'];
  return positiveResponses.some((response) => normalized.includes(response));
}

export function getStrategyDescription(strategy: string): string {
  switch (strategy) {
    case 'A':
      return 'Direct Link (single message with link)';
    case 'B':
      return 'Reply Hook (2-step: request reply, then send link on positive response)';
    case 'C':
      return 'Curiosity Hook (question-based engagement)';
    default:
      return 'Unknown strategy';
  }
}
