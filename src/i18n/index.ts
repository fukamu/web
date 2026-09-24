import { en } from "./en.ts";
import { ja } from "./ja.ts";
import type { Locale } from "../data/site.ts";

export const messages = Object.freeze({ ja, en });

export type Messages = (typeof messages)[Locale];

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}
