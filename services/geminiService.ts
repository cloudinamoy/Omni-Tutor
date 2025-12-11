import { GoogleGenAI, Type, Schema } from "@google/genai";
import { InitialDiagnosis, FeedbackResult, ChatMessage } from "../types";
import { fileToGenerativePart, blobToGenerativePart } from "./utils";

// Schema for Stage 1: Initial Diagnosis
const diagnosisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    stage: { type: Type.STRING, enum: ["INITIAL_DIAGNOSIS"] },
    conceptual_misunderstanding: { type: Type.STRING },
    new_practice_question: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING },
        question_text: { type: Type.STRING },
      },
      required: ["topic", "question_text"],
    },
    tutor_feedback: { type: Type.STRING },
    next_instruction: { type: Type.STRING },
  },
  required: ["stage", "conceptual_misunderstanding", "new_practice_question", "tutor_feedback", "next_instruction"],
};

// Schema for Stage 2: Conversational Feedback
const feedbackSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    stage: { type: Type.STRING, enum: ["CONVERSATIONAL_FEEDBACK"] },
    evaluation_result: { type: Type.STRING, enum: ["CORRECT", "CONCEPT_ERROR", "CALCULATION_ERROR"] },
    feedback_message: { type: Type.STRING },
    dialogue_action: { type: Type.STRING, enum: ["CONTINUE", "MASTERY_ACHIEVED"] },
    next_instruction: { type: Type.STRING },
  },
  required: ["stage", "evaluation_result", "feedback_message", "dialogue_action", "next_instruction"],
};

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please set process.env.API_KEY.");
  }
  return new GoogleGenAI({ apiKey });
};

// Stage 1: Initial Diagnosis
export const analyzeHomework = async (
  imageFile: File | null,
  textContext: string,
  audioBlob: Blob | null
): Promise<InitialDiagnosis> => {
  const ai = getAIClient();
  const parts: any[] = [];

  const promptText = `
# 角色定义：多模态学习过程诊断与辅导专家

**核心任务:**
你是一位经验丰富、充满耐心的专业导师。你的任务是分析学生首次提交的作业（包含手写图片和口述思路），识别其核心概念错误，并生成一个针对性强的定制化练习题，同时开启一段指导学生解决该题的对话。

**输入数据:**
[User Text/Speech Transcript]: ${textContext || "No specific text provided."}

---

**分步推理与输出格式要求 (严格遵循):**

1.  **多模态整合分析：** 准确识别图片中的手写内容，并结合学生的口述，确定学生在**哪个具体的步骤或哪个知识点上**出现了偏差。
2.  **核心错误诊断：** 确定学生偏差的**根本原因**（例如：混淆了“动量”和“能量”的概念；误解了“匀加速”的定义）。
3.  **定制化练习题生成：** 根据**[步骤 2]** 识别出的单一核心错误，创作一道**全新的、最小修改**的练习题，这道题的唯一目标是**测试和强化**该知识点。
4.  **启发式反馈与对话起点：** 基于诊断结果，生成一段**友善且不透露答案**的反馈，并以一个明确的“行动号召”结束，将学生带入对话循环。

**最终输出格式（必须是有效的 JSON，用于应用前端解析）:**
Reference the defined JSON Schema.
`;

  parts.push({ text: promptText });

  if (imageFile) {
    const imageBase64 = await fileToGenerativePart(imageFile);
    parts.push({
      inlineData: {
        mimeType: imageFile.type,
        data: imageBase64,
      },
    });
  }

  if (audioBlob) {
    const audioBase64 = await blobToGenerativePart(audioBlob);
    parts.push({
      inlineData: {
        mimeType: "audio/wav",
        data: audioBase64,
      },
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: diagnosisSchema,
      },
    });

    const textResponse = response.text;
    if (!textResponse) throw new Error("No response from Gemini.");
    
    // Normalize data structure for compatibility if needed
    const data = JSON.parse(textResponse) as InitialDiagnosis;
    // Map new fields to old UI fields for fallback compatibility
    data.diagnosed_error_step = "Concept Error"; 
    data.status = "Diagnosis";
    
    return data;
  } catch (error) {
    console.error("Stage 1 Error:", error);
    throw new Error("Failed to diagnose homework.");
  }
};

// Stage 2: Conversational Feedback
export const evaluatePracticeResponse = async (
  practiceContext: { topic: string; question: string },
  chatHistory: ChatMessage[],
  currentInput: string,
  audioBlob: Blob | null
): Promise<FeedbackResult> => {
  const ai = getAIClient();
  const parts: any[] = [];

  // Construct history string
  const historyStr = chatHistory.map(msg => 
    `${msg.role === 'user' ? 'Student' : 'Tutor'}: ${msg.content}`
  ).join('\n');

  const promptText = `
# 角色定义：持续、情境感知、启发式辅导专家

**核心任务:**
你是一位专业的导师，正在指导学生解决一道**${practiceContext.topic}**的定制练习题。你的任务是基于学生当前的输入，判断其解题步骤是否正确，并提供即时、最小干预的引导，直到学生完全掌握知识点。

**输入数据:**
[Custom Question Topic]: ${practiceContext.topic}
[Custom Question Text]: ${practiceContext.question}
[Student Previous Attempts History]: 
${historyStr}

[Current Student Input]: ${currentInput || "(Audio Input Provided)"}

---

**分步推理与输出格式要求 (严格遵循):**

1.  **情境分析与步骤评估：** 基于定制题文本和历史记录，判断学生输入是否是解决该题的**正确下一步**。
2.  **错误类型鉴定：** 如果步骤错误，请精准判断错误类型：
    * **Type A (概念错误):** 学生再次在核心概念上犯错（需要重点引导）。
    * **Type B (计算/操作错误):** 仅是简单的计算或抄写错误（只需简单提醒）。
3.  **生成定制化反馈：**
    * **IF 正确：** 提供简洁的肯定和鼓励，并提示下一步操作。
    * **IF 错误 (Type A 概念错误)：** **绝对不能直接纠正公式或答案。** 提出一个反思性的问题，或者要求学生回顾一个关键定义，以引导他们自我发现错误。
    * **IF 错误 (Type B 计算错误)：** 明确指出错误所在（例如：检查负号或单位），但仍保持鼓励。

**最终输出格式（必须是有效的 JSON）:**
Reference the defined JSON Schema.
`;

  parts.push({ text: promptText });

  if (audioBlob) {
    const audioBase64 = await blobToGenerativePart(audioBlob);
    parts.push({
      inlineData: {
        mimeType: "audio/wav",
        data: audioBase64,
      },
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: feedbackSchema,
      },
    });

    const textResponse = response.text;
    if (!textResponse) throw new Error("No response from Gemini.");

    return JSON.parse(textResponse) as FeedbackResult;
  } catch (error) {
    console.error("Stage 2 Error:", error);
    throw new Error("Failed to evaluate answer.");
  }
};
