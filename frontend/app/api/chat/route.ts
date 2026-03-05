import { NextRequest } from "next/server";
import OpenAI from "openai";

// Provider routing based on model name
function getClient(model: string): { client: OpenAI; model: string } {
  const m = model.toLowerCase();

  if (m.includes("deepseek")) {
    return {
      client: new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: "https://api.deepseek.com",
      }),
      model,
    };
  }

  if (m.includes("claude") || m.includes("anthropic")) {
    // Anthropic doesn't use the OpenAI SDK — use their compatible endpoint
    return {
      client: new OpenAI({
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseURL: "https://api.anthropic.com/v1/",
      }),
      model,
    };
  }

  if (m.includes("gemini")) {
    return {
      client: new OpenAI({
        apiKey: process.env.GOOGLE_API_KEY,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      }),
      model,
    };
  }

  if (m.includes("llama") || m.includes("mixtral") || m.includes("groq")) {
    return {
      client: new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
      }),
      model,
    };
  }

  // Default: OpenAI
  return {
    client: new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    }),
    model,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { messages, systemPrompt, model } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const llmModel = model || process.env.OPENAI_MODEL || "gpt-4";
    const { client, model: resolvedModel } = getClient(llmModel);

    const fullMessages = [
      { role: "system" as const, content: systemPrompt || "You are a helpful assistant." },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const stream = await client.chat.completions.create({
      model: resolvedModel,
      messages: fullMessages,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Chat request failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
