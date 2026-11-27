import { supabase } from "@/lib/supabase";

export type AssistantChatHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

export type AssistantChatSource = {
  id: string;
  title: string;
  version: number;
  reference: string;
};

export type AssistantChatReply = {
  answer: string;
  sources: AssistantChatSource[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function functionErrorMessage(error: unknown): Promise<string> {
  let errorCode = "";
  if (error && typeof error === "object" && "context" in error) {
    const context = error.context;
    if (context instanceof Response) {
      const payload = asRecord(await context.clone().json().catch(() => null));
      errorCode = typeof payload?.errorCode === "string" ? payload.errorCode : "";
    }
  }

  if (errorCode === "AI_NOT_CONFIGURED") {
    return "BUSI ще не налаштований: адміністратору потрібно додати AI_API_URL, AI_API_KEY та AI_MODEL у Supabase Edge Function Secrets.";
  }
  if (errorCode === "FORBIDDEN") {
    return "Для чату BUSNET потрібен активний обліковий запис адміністратора.";
  }
  if (errorCode === "KNOWLEDGE_LOOKUP_FAILED") {
    return "Не вдалося прочитати перевірені знання BUSNET. Спробуйте пізніше або зверніться до адміністратора.";
  }
  if (errorCode === "AI_PROVIDER_ERROR") {
    return "AI-модель не відповіла. Перевірте налаштування провайдера й спробуйте ще раз.";
  }

  return error instanceof Error
    ? `Не вдалося отримати відповідь: ${error.message}`
    : "Не вдалося отримати відповідь від BUSI.";
}

export async function askBusnetAssistant(
  message: string,
  history: AssistantChatHistoryMessage[],
): Promise<AssistantChatReply> {
  const { data, error } = await supabase.functions.invoke("assistant-chat", {
    body: { message, history },
  });

  if (error) throw new Error(await functionErrorMessage(error));

  const result = asRecord(data);
  if (typeof result?.answer !== "string" || !result.answer.trim()) {
    throw new Error("BUSI повернув відповідь у невідомому форматі.");
  }

  const sources = Array.isArray(result.sources)
    ? result.sources.flatMap((item): AssistantChatSource[] => {
      const source = asRecord(item);
      if (
        !source ||
        typeof source.id !== "string" ||
        typeof source.title !== "string" ||
        typeof source.version !== "number" ||
        typeof source.reference !== "string"
      ) {
        return [];
      }
      return [{
        id: source.id,
        title: source.title,
        version: source.version,
        reference: source.reference,
      }];
    })
    : [];

  return { answer: result.answer, sources };
}
