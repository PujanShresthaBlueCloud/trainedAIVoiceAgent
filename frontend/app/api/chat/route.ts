import { NextRequest } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions";

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

  return {
    client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    model,
  };
}

interface ToolDef {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  webhook_url: string | null;
  method: string;
  headers: Record<string, any> | null;
  timeout_seconds: number;
  payload_mode: string;
}

// Execute a webhook for a tool call
async function executeWebhook(
  tool: ToolDef,
  args: Record<string, any>
): Promise<string> {
  if (!tool.webhook_url) {
    return JSON.stringify({ error: "No webhook URL configured" });
  }

  const timeoutMs = (tool.timeout_seconds || 30) * 1000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (tool.headers && typeof tool.headers === "object") {
      for (const [k, v] of Object.entries(tool.headers)) {
        headers[k] = String(v);
      }
    }

    const isGet = tool.method.toUpperCase() === "GET";
    let url = tool.webhook_url;

    // For GET, append args as query params
    if (isGet && args && Object.keys(args).length > 0) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) {
        params.append(k, String(v));
      }
      url += (url.includes("?") ? "&" : "?") + params.toString();
    }

    const body =
      !isGet && args
        ? JSON.stringify(tool.payload_mode === "args_only" ? args : { args })
        : undefined;

    const res = await fetch(url, {
      method: tool.method.toUpperCase(),
      headers,
      body,
      signal: controller.signal,
    });

    const text = await res.text();

    // Try to parse as JSON for cleaner output
    try {
      const json = JSON.parse(text);
      return JSON.stringify(json);
    } catch {
      return text;
    }
  } catch (err: any) {
    if (err.name === "AbortError") {
      return JSON.stringify({ error: "Webhook timed out" });
    }
    return JSON.stringify({ error: err.message || "Webhook request failed" });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { messages, systemPrompt, model, tools: toolDefs } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const llmModel = model || process.env.OPENAI_MODEL || "gpt-4";
    const { client, model: resolvedModel } = getClient(llmModel);

    // Debug: log what tools are received
    console.log("[chat] model:", resolvedModel);
    console.log("[chat] tools received:", toolDefs?.length ?? 0);
    if (toolDefs) {
      toolDefs.forEach((t: ToolDef) => {
        console.log(`  -> ${t.name} | params type: ${t.parameters?.type ?? "NULL"} | url: ${t.webhook_url}`);
      });
    }

    // Build conversation messages
    const fullMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt || "You are a helpful assistant." },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // Convert custom functions to OpenAI tool format
    // Ensure every function has a valid JSON Schema with type: "object"
    const openaiTools: ChatCompletionTool[] | undefined =
      toolDefs && toolDefs.length > 0
        ? toolDefs.map((t: ToolDef) => {
            let params = t.parameters;
            if (
              !params ||
              typeof params !== "object" ||
              params.type !== "object"
            ) {
              params = { type: "object", properties: {} };
            }
            if (!params.properties) {
              params = { ...params, properties: {} };
            }
            return {
              type: "function" as const,
              function: {
                name: t.name,
                description: t.description || `Call the ${t.name} function`,
                parameters: params,
              },
            };
          })
        : undefined;

    // Log the tools being sent to LLM
    console.log("[chat] openaiTools:", openaiTools ? JSON.stringify(openaiTools) : "NONE");

    // Build a lookup map for tool execution
    const toolMap = new Map<string, ToolDef>();
    if (toolDefs) {
      for (const t of toolDefs) {
        toolMap.set(t.name, t);
      }
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const conversationMessages = [...fullMessages];
          let maxRounds = 5; // prevent infinite tool-call loops

          while (maxRounds-- > 0) {
            const completion = await client.chat.completions.create({
              model: resolvedModel,
              messages: conversationMessages,
              ...(openaiTools && openaiTools.length > 0 ? { tools: openaiTools } : {}),
              stream: true,
            });

            let assistantContent = "";
            const toolCalls: {
              id: string;
              name: string;
              arguments: string;
            }[] = [];

            // Accumulate tool call data by index
            const toolCallAccum: Map<
              number,
              { id: string; name: string; arguments: string }
            > = new Map();

            for await (const chunk of completion) {
              const choice = chunk.choices[0];
              if (!choice) continue;

              // Stream text content to client
              const content = choice.delta?.content;
              if (content) {
                assistantContent += content;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                );
              }

              // Accumulate tool calls
              const deltaToolCalls = choice.delta?.tool_calls;
              if (deltaToolCalls) {
                for (const tc of deltaToolCalls) {
                  const idx = tc.index;
                  if (!toolCallAccum.has(idx)) {
                    toolCallAccum.set(idx, {
                      id: tc.id || "",
                      name: tc.function?.name || "",
                      arguments: "",
                    });
                  }
                  const entry = toolCallAccum.get(idx)!;
                  if (tc.id) entry.id = tc.id;
                  if (tc.function?.name) entry.name = tc.function.name;
                  if (tc.function?.arguments) entry.arguments += tc.function.arguments;
                }
              }

              // Check for finish
              if (choice.finish_reason === "stop") {
                // Normal completion, no tool calls
                break;
              }

              if (choice.finish_reason === "tool_calls") {
                // Tool calls ready to execute
                break;
              }
            }

            // Collect completed tool calls
            toolCallAccum.forEach((tc) => {
              if (tc.name) toolCalls.push(tc);
            });

            console.log(`[chat] round done — content: ${assistantContent.length} chars, tool_calls: ${toolCalls.length}`);
            if (toolCalls.length > 0) {
              toolCalls.forEach((tc) => console.log(`  -> tool_call: ${tc.name}(${tc.arguments.slice(0, 100)})`));
            }

            // If no tool calls, we're done
            if (toolCalls.length === 0) {
              break;
            }

            // Build the assistant message with tool_calls
            conversationMessages.push({
              role: "assistant",
              content: assistantContent || null,
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.arguments },
              })),
            } as ChatCompletionMessageParam);

            // Execute each tool call and add results
            for (const tc of toolCalls) {
              let parsedArgs: Record<string, any> = {};
              try {
                parsedArgs = JSON.parse(tc.arguments);
              } catch {
                // use empty args
              }

              // Notify client about the tool call
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    tool_call: { name: tc.name, arguments: parsedArgs },
                  })}\n\n`
                )
              );

              const toolDef = toolMap.get(tc.name);
              let result: string;

              if (toolDef) {
                result = await executeWebhook(toolDef, parsedArgs);
              } else {
                result = JSON.stringify({
                  error: `Unknown tool: ${tc.name}`,
                });
              }

              // Notify client about the result
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    tool_result: { name: tc.name, result },
                  })}\n\n`
                )
              );

              conversationMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: result,
              } as ChatCompletionMessageParam);
            }

            // Loop will continue — LLM gets the tool results and generates a response
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err: any) {
          // Send error as SSE before closing
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ content: `\n\nError: ${err.message}` })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
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
