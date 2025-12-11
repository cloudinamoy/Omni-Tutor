import { AnalysisResult, HistoryItem } from "../types";

const HISTORY_KEY = "omni_tutor_history";

export const getHistory = (): HistoryItem[] => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Failed to load history", e);
    return [];
  }
};

export const saveToHistory = (result: AnalysisResult, userContext: string): HistoryItem => {
  const history = getHistory();
  const newItem: HistoryItem = {
    ...result,
    user_context: userContext,
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    timestamp: Date.now(),
  };
  
  // Prepend new item, limit to last 50
  const updated = [newItem, ...history].slice(0, 50);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  return newItem;
};

export const clearHistory = () => {
  localStorage.removeItem(HISTORY_KEY);
};
