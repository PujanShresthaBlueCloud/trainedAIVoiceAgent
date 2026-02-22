import json
import logging
from typing import AsyncGenerator
from config import settings

logger = logging.getLogger(__name__)


async def stream_llm_response(
    messages: list[dict],
    model: str = "gpt-4",
    tools: list[dict] | None = None,
) -> AsyncGenerator[dict, None]:
    """Stream LLM response. Yields: text_delta, tool_call, done."""
    provider = _get_provider(model)

    if provider == "openai":
        async for chunk in _stream_openai(messages, model, tools):
            yield chunk
    elif provider == "anthropic":
        async for chunk in _stream_anthropic(messages, model, tools):
            yield chunk
    elif provider == "deepseek":
        async for chunk in _stream_openai(messages, model, tools, base_url="https://api.deepseek.com", api_key=settings.DEEPSEEK_API_KEY):
            yield chunk
    elif provider == "groq":
        async for chunk in _stream_openai(messages, model, tools, base_url="https://api.groq.com/openai/v1", api_key=settings.GROQ_API_KEY):
            yield chunk
    elif provider == "google":
        async for chunk in _stream_google(messages, model, tools):
            yield chunk
    else:
        async for chunk in _stream_openai(messages, model, tools):
            yield chunk


def _get_provider(model: str) -> str:
    model_lower = model.lower()
    if "claude" in model_lower:
        return "anthropic"
    if "deepseek" in model_lower:
        return "deepseek"
    if "gemini" in model_lower:
        return "google"
    if "llama" in model_lower or "mixtral" in model_lower:
        return "groq"
    return "openai"


async def _stream_openai(
    messages: list[dict], model: str, tools: list[dict] | None = None,
    base_url: str | None = None, api_key: str | None = None,
) -> AsyncGenerator[dict, None]:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key or settings.OPENAI_API_KEY, base_url=base_url)
    kwargs = {"model": model, "messages": messages, "stream": True}
    if tools:
        kwargs["tools"] = [{"type": "function", "function": t} for t in tools]

    stream = await client.chat.completions.create(**kwargs)
    tool_calls_acc = {}

    async for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if not delta:
            continue
        if delta.content:
            yield {"type": "text_delta", "content": delta.content}
        if delta.tool_calls:
            for tc in delta.tool_calls:
                idx = tc.index
                if idx not in tool_calls_acc:
                    tool_calls_acc[idx] = {"name": "", "arguments": ""}
                if tc.function.name:
                    tool_calls_acc[idx]["name"] = tc.function.name
                if tc.function.arguments:
                    tool_calls_acc[idx]["arguments"] += tc.function.arguments
        if chunk.choices[0].finish_reason:
            break

    for tc in tool_calls_acc.values():
        try:
            args = json.loads(tc["arguments"]) if tc["arguments"] else {}
        except json.JSONDecodeError:
            args = {}
        yield {"type": "tool_call", "name": tc["name"], "arguments": args}

    yield {"type": "done"}


async def _stream_anthropic(
    messages: list[dict], model: str, tools: list[dict] | None = None,
) -> AsyncGenerator[dict, None]:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    system_msg = ""
    user_messages = []
    for m in messages:
        if m["role"] == "system":
            system_msg = m["content"]
        else:
            user_messages.append(m)

    kwargs = {"model": model, "messages": user_messages, "max_tokens": 1024, "stream": True}
    if system_msg:
        kwargs["system"] = system_msg
    if tools:
        kwargs["tools"] = [
            {"name": t["name"], "description": t.get("description", ""), "input_schema": t.get("parameters", {})}
            for t in tools
        ]

    async with client.messages.stream(**kwargs) as stream:
        async for event in stream:
            if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                yield {"type": "text_delta", "content": event.delta.text}

    final = await stream.get_final_message()
    for block in final.content:
        if block.type == "tool_use":
            yield {"type": "tool_call", "name": block.name, "arguments": block.input}

    yield {"type": "done"}


async def _stream_google(
    messages: list[dict], model: str, tools: list[dict] | None = None,
) -> AsyncGenerator[dict, None]:
    import google.generativeai as genai

    genai.configure(api_key=settings.GOOGLE_API_KEY)
    gmodel = genai.GenerativeModel(model)

    history = []
    for m in messages:
        role = "user" if m["role"] in ("user", "system") else "model"
        history.append({"role": role, "parts": [m["content"]]})

    if not history:
        yield {"type": "done"}
        return

    last_msg = history.pop()
    chat = gmodel.start_chat(history=history)
    response = await chat.send_message_async(last_msg["parts"][0], stream=True)

    async for chunk in response:
        if chunk.text:
            yield {"type": "text_delta", "content": chunk.text}

    yield {"type": "done"}


async def get_llm_response(messages: list[dict], model: str = "gpt-4", tools: list[dict] | None = None) -> str:
    text = ""
    async for chunk in stream_llm_response(messages, model, tools):
        if chunk["type"] == "text_delta":
            text += chunk["content"]
    return text
