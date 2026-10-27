/**
 * Centralized reply texts and message templates for the Telegram Bot.
 * All bot replies, prompts, error messages, and notifications are managed here.
 */

export const REPLY_TEXTS = {
  // Common / Defaults
  DEFAULT_USER_NAME: 'کاربر',
  UNEXPECTED_ERROR: 'خطای غیرمنتظره‌ای رخ داد. لطفاً بعداً دوباره تلاش کنید.',

  // Menu
  CHAT_MENU_TITLE: 'منوی چت:',

  // Start & Referral Flow
  START_ORGANIC:
    'خوش آمدید! شما بدون لینک مچ وارد شدید. هنگامی که در ربات همراز مچ شدید، روی لینک اختصاصی گفتگو کلیک کنید تا چت خصوصی شما آغاز شود.',
  START_INVALID_REFERRAL:
    'لینکی که استفاده کردید نامعتبر است. لطفاً به ربات همراز مچ بازگردید و مجدداً روی لینک گفتگو کلیک کنید.',
  START_WAITING_FOR_PARTNER:
    '⏳ شما با موفقیت به این لینک گفتگو متصل شدید!\n\nدر انتظار پیوستن هم‌صحبت شما... به محض اینکه طرف مقابل هم روی این لینک کلیک کند، چت خصوصی شما آغاز می‌شود.',
  START_PARTNER_WAITING:
    '🎉 هم‌صحبت شما منتظر شما بود! چت خصوصی شما آغاز شد. اکنون هر پیامی ارسال کنید به صورت مستقیم برای او ارسال می‌شود.',
  START_CONNECTED:
    '🎉 شما به یک چت خصوصی با هم‌صحبت خود متصل شدید! هر پیامی که اینجا ارسال کنید به صورت خصوصی بین شما دو نفر خواهد بود.',
  START_ALREADY_CONNECTED:
    'شما هم‌اکنون به چت خصوصی با هم‌صحبت خود متصل هستید! پیام خود را در زیر ارسال کنید.',
  START_MATCH_NOT_FOUND:
    'هیچ چت فعالی برای این لینک یافت نشد. ممکن است چت قبلاً بسته یا حذف شده باشد.',
  START_MATCH_EXPIRED:
    'مهلت استفاده از این لینک مچ به پایان رسیده است. لطفاً برای دریافت موارد جدید به ربات مراجعه کنید.',
  START_UNAUTHORIZED:
    'شما دسترسی لازم برای ورود به این گفتگوی خصوصی را ندارید.',
  START_ERROR:
    'خطایی در برقراری اتصال به چت رخ داد. لطفاً بعداً دوباره تلاش کنید.',
  PARTNER_JOINED_CHAT:
    '🎉 هم‌صحبت شما به چت پیوست! اکنون می‌توانید با ارسال پیام، گفتگو را آغاز کنید.',

  // Messaging & Relay
  RELAY_MESSAGE: (content: string): string => `💬 ${content}`,
  MESSAGE_NOTIFICATION: (senderName: string): string =>
    `یک پیام از کاربر ${senderName} دارید`,
  MEDIA_NOTIFICATION: (senderName: string, mediaLabel?: string): string =>
    `یک ${mediaLabel ?? 'پیام'} از کاربر ${senderName} دارید`,
  NO_ACTIVE_CHAT_RELAY_ERROR:
    'شما در حال حاضر هیچ چت فعالی ندارید. لطفاً ابتدا از طریق لینک مچ وارد شوید.',
  MEDIA_FILE_TOO_LARGE: (maxSizeMB: number): string =>
    `حجم فایل ارسالی بیشتر از حد مجاز (${maxSizeMB} مگابایت) است.`,
  MEDIA_RATE_LIMIT_EXCEEDED: (count: number, unitText: string): string =>
    `شما به سقف مجاز ارسال رسانه رسیده‌اید. حداکثر مجاز: ${count} رسانه در هر ${unitText}. لطفاً بعداً تلاش کنید.`,

  // Profile View
  PROFILE_NO_ACTIVE_CHAT:
    'شما در حال حاضر در هیچ چت فعالی نیستید. لطفاً ابتدا از دکمه «چت ها» یک گفتگو را انتخاب کنید.',
  PROFILE_CAPTION: (partnerName: string): string =>
    `👤 نام کاربر: ${partnerName}`,
  PROFILE_NO_PHOTO_CAPTION: (partnerName: string): string =>
    `👤 نام کاربر: ${partnerName}\n(این کاربر تصویر پروفایل ندارد یا نمایش آن را در تنظیمات تلگرام محدود کرده است)`,
  PROFILE_FETCH_ERROR:
    'خطایی در دریافت اطلاعات پروفایل رخ داد.',

  // Chat List & Switching
  CHATS_NO_ACTIVE:
    'شما در حال حاضر هیچ چت فعالی ندارید. برای شروع گفتگو باید از طریق لینک همسان‌سازی وارد شوید.',
  CHATS_LIST_TITLE:
    '📋 چت‌های شما:\nبرای گفتگو، کاربر مورد نظر را انتخاب کنید:',
  CHATS_FETCH_ERROR:
    'خطایی در دریافت لیست چت‌ها رخ داد.',
  INVALID_CHAT_ID:
    'شناسه چت نامعتبر است.',
  CHAT_ACCESS_DENIED:
    'دسترسی به این چت امکان‌پذیر نیست یا چت یافت نشد.',
  SWITCH_CHAT_ALERT: (partnerName: string): string =>
    `ورود به چت با ${partnerName}`,
  SWITCH_CHAT_SUCCESS: (partnerName: string): string =>
    `✅ شما وارد چت با **${partnerName}** شدید.\nاز این پس پیام‌های ارسالی شما به این کاربر تحویل داده می‌شود.`,
  ALREADY_IN_CHAT: (partnerName: string): string =>
    `شما در حال حاضر در چت ${partnerName} هستید`,
  LAST_RECEIVED_MESSAGE: (partnerName: string, content: string): string =>
    `📩 آخرین پیام دریافتی از ${partnerName}:\n💬 ${content}`,
  SWITCH_CHAT_ERROR:
    'خطایی در تغییر چت رخ داد.',
  AUTO_SWITCH_SUCCESS: (partnerName: string): string =>
    `✅ شما به چت با ${partnerName} منتقل شدید.`,

  // Terminate Chat
  TERMINATE_NO_ACTIVE_CHAT:
    'شما در حال حاضر در هیچ چت فعالی نیستید.',
  TERMINATE_CONFIRM_PROMPT: (partnerName: string): string =>
    `آیا مطمئن هستید که می‌خواهید چت با ${partnerName} را پایان دهید؟`,
  TERMINATE_PROMPT_ERROR:
    'خطایی در درخواست پایان چت رخ داد.',
  TERMINATE_CANCELLED:
    'عملیات پایان چت لغو شد.',
  TERMINATE_SYSTEM_UNAVAILABLE:
    'سیستم پایان چت در دسترس نیست.',
  TERMINATE_FORBIDDEN:
    'خطا در پایان چت یا شما عضو این چت نیستید.',
  CHAT_CLOSED_BY_USER: (userName: string): string =>
    `کاربر ${userName} چت را بست`,
  TERMINATE_ERROR:
    'خطایی در پایان چت رخ داد.',
} as const;

export default REPLY_TEXTS;
