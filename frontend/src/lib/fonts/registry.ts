/**
 * The product UI uses one system font stack. Keeping a single registry value
 * lets legacy preference cookies fall back safely without loading web fonts.
 */
export const fontRegistry = {
  system: {
    label: "系统字体",
  },
} as const;

export type FontKey = keyof typeof fontRegistry;

export const fontKeys = Object.keys(fontRegistry) as FontKey[];
