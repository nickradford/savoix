import { useState, useEffect } from "react";

export type FontFamily = "sans" | "serif" | "mono" | "dyslexic";

interface FontSettings {
  fontFamily: FontFamily;
  fontSize: number;
}

export const DEFAULT_FONT_SETTINGS: FontSettings = {
  fontFamily: "sans",
  fontSize: 30,
};

const STORAGE_KEY = "savoix-font-settings";

function loadSettings(): FontSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        fontFamily: parsed.fontFamily ?? DEFAULT_FONT_SETTINGS.fontFamily,
        fontSize: parsed.fontSize ?? DEFAULT_FONT_SETTINGS.fontSize,
      };
    }
  } catch {
    // Ignore localStorage errors
  }
  return DEFAULT_FONT_SETTINGS;
}

function saveSettings(settings: FontSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore localStorage errors
  }
}

export function useFontSettings() {
  const [settings, setSettings] = useState<FontSettings>(DEFAULT_FONT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setSettings(loadSettings());
    setIsLoaded(true);
  }, []);

  // Persist to localStorage when settings change
  useEffect(() => {
    if (isLoaded) {
      saveSettings(settings);
    }
  }, [settings, isLoaded]);

  const setFontFamily = (fontFamily: FontFamily) => {
    setSettings((prev) => ({ ...prev, fontFamily }));
  };

  const setFontSize = (fontSize: number) => {
    setSettings((prev) => ({ ...prev, fontSize }));
  };

  return {
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    setFontFamily,
    setFontSize,
    isLoaded,
  };
}
