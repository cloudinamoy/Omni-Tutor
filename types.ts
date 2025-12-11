export interface PracticeQuestion {
  subject?: string; // Optional as per new prompt
  topic: string;
  question_text: string;
}

// Stage 1 Output
export interface InitialDiagnosis {
  stage: "INITIAL_DIAGNOSIS";
  conceptual_misunderstanding: string;
  new_practice_question: PracticeQuestion;
  tutor_feedback: string;
  next_instruction: string;
  // Legacy/Compatibility fields (mapped from new fields if needed)
  diagnosed_error_step?: string;
  status?: string;
}

// Stage 2 Output
export interface FeedbackResult {
  stage: "CONVERSATIONAL_FEEDBACK";
  evaluation_result: "CORRECT" | "CONCEPT_ERROR" | "CALCULATION_ERROR";
  feedback_message: string;
  dialogue_action: "CONTINUE" | "MASTERY_ACHIEVED";
  next_instruction: string;
}

export type AnalysisResult = InitialDiagnosis;

export interface ChatMessage {
  role: 'user' | 'tutor';
  content: string;
  audioUrl?: string;
  timestamp: number;
  // For tutor messages
  feedbackType?: "CORRECT" | "CONCEPT_ERROR" | "CALCULATION_ERROR" | "INFO"; 
}

export interface HistoryItem extends InitialDiagnosis {
  id: string;
  timestamp: number;
  user_context?: string;
}

export interface AnalysisError {
  message: string;
}
