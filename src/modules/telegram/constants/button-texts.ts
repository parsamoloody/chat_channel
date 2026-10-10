/**
 * Centralized button texts and emojis for the Telegram Bot.
 * All button labels, emojis, and dynamic button generators are managed here.
 */

export const BUTTON_EMOJIS = {
  PROFILE: '👤',
  CHAT: '💬',
  CLOSE: '❌',
  CONFIRM: '✅',
  CANCEL: '❌',
} as const;

export const RAW_BUTTON_TEXTS = {
  SHOW_PROFILE: 'نمایش پروفایل کاربر',
  CHATS: 'چت ها',
  TERMINATE_CHAT: 'پایان چت',
  CONFIRM_TERMINATE: 'بله، مطمئنم',
  CANCEL_TERMINATE: 'خیر',
  CLOSE_CHAT_LIST: 'بستن لیست',
} as const;

export const BUTTON_TEXTS = {
  // Main Menu / Reply Keyboard Buttons
  SHOW_PROFILE: `${RAW_BUTTON_TEXTS.SHOW_PROFILE} ${BUTTON_EMOJIS.PROFILE}`,
  CHATS: `${RAW_BUTTON_TEXTS.CHATS} ${BUTTON_EMOJIS.CHAT}`,
  TERMINATE_CHAT: `${RAW_BUTTON_TEXTS.TERMINATE_CHAT} ${BUTTON_EMOJIS.CLOSE}`,

  // Inline Termination Confirmation Buttons
  CONFIRM_TERMINATE: `${BUTTON_EMOJIS.CONFIRM} ${RAW_BUTTON_TEXTS.CONFIRM_TERMINATE}`,
  CANCEL_TERMINATE: `${BUTTON_EMOJIS.CANCEL} ${RAW_BUTTON_TEXTS.CANCEL_TERMINATE}`,

  // Inline Chat List Buttons
  CLOSE_CHAT_LIST: `${BUTTON_EMOJIS.CLOSE} ${RAW_BUTTON_TEXTS.CLOSE_CHAT_LIST}`,

  // Dynamic Inline Button Generators
  SWITCH_TO_CHAT: (senderName?: string): string =>
    `${BUTTON_EMOJIS.CHAT} رفتن به چت با ${senderName ?? 'کاربر'}`,

  CHAT_LIST_ITEM: (partnerName?: string, isCurrentActive = false): string =>
    `${BUTTON_EMOJIS.CHAT} ${partnerName ?? 'کاربر'}${isCurrentActive ? ' (فعال)' : ''}`,
} as const;

export const {
  SHOW_PROFILE,
  CHATS,
  TERMINATE_CHAT,
  CONFIRM_TERMINATE,
  CANCEL_TERMINATE,
  CLOSE_CHAT_LIST,
  SWITCH_TO_CHAT,
  CHAT_LIST_ITEM,
} = BUTTON_TEXTS;

export default BUTTON_TEXTS;
