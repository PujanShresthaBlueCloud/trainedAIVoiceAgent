"""Document processing: parse, chunk, embed, upsert."""
import io
import csv
import logging
import uuid
from app.config import settings

logger = logging.getLogger(__name__)


def parse_file(content: bytes, filename: str) -> str:
    """Extract text from PDF/TXT/DOCX/CSV files."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "txt":
        return content.decode("utf-8", errors="ignore")

    if ext == "csv":
        text_io = io.StringIO(content.decode("utf-8", errors="ignore"))
        reader = csv.reader(text_io)
        rows = []
        for row in reader:
            rows.append(" | ".join(row))
        return "\n".join(rows)

    if ext == "pdf":
        from PyPDF2 import PdfReader
        reader = PdfReader(io.BytesIO(content))
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n\n".join(pages)

    if ext in ("docx", "doc"):
        from docx import Document
        doc = Document(io.BytesIO(content))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paragraphs)

    raise ValueError(f"Unsupported file type: .{ext}")


def chunk_text(text: str, chunk_size: int | None = None, chunk_overlap: int | None = None) -> list[str]:
    """Split text into overlapping chunks by approximate token count."""
    import tiktoken

    chunk_size = chunk_size or settings.CHUNK_SIZE
    chunk_overlap = chunk_overlap or settings.CHUNK_OVERLAP

    enc = tiktoken.get_encoding("cl100k_base")
    tokens = enc.encode(text)

    chunks = []
    start = 0
    while start < len(tokens):
        end = start + chunk_size
        chunk_tokens = tokens[start:end]
        chunk_text = enc.decode(chunk_tokens)
        if chunk_text.strip():
            chunks.append(chunk_text.strip())
        start = end - chunk_overlap

    logger.info(f"Split text into {len(chunks)} chunks (size={chunk_size}, overlap={chunk_overlap})")
    return chunks


async def generate_embedding(text: str) -> list[float]:
    """Generate embedding for a single text using OpenAI."""
    import openai

    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    response = await client.embeddings.create(
        model=settings.EMBEDDING_MODEL,
        input=text,
    )
    return response.data[0].embedding


async def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for multiple texts using OpenAI."""
    import openai

    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    batch_size = 100
    all_embeddings = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        response = await client.embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=batch,
        )
        all_embeddings.extend([item.embedding for item in response.data])

    return all_embeddings


async def process_and_upsert(
    content: bytes,
    filename: str,
    file_id: str,
    provider,
    namespace: str | None = None,
) -> int:
    """Full pipeline: parse → chunk → embed → upsert to vector DB. Returns chunk count."""
    text = parse_file(content, filename)
    if not text.strip():
        raise ValueError("No text content extracted from file")

    chunks = chunk_text(text)
    embeddings = await generate_embeddings(chunks)

    vectors = []
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        vectors.append({
            "id": f"{file_id}_{i}",
            "values": embedding,
            "metadata": {
                "text": chunk,
                "file_id": file_id,
                "filename": filename,
                "chunk_index": i,
            },
        })

    await provider.upsert(vectors, namespace=namespace)
    logger.info(f"Processed {filename}: {len(chunks)} chunks embedded and upserted")
    return len(chunks)
