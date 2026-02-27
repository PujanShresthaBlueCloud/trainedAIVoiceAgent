"""Vector DB provider abstraction for RAG."""
import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class VectorDBProvider(ABC):
    @abstractmethod
    async def connect(self):
        pass

    @abstractmethod
    async def upsert(self, vectors: list[dict], namespace: str | None = None):
        """Upsert vectors: [{"id": str, "values": list[float], "metadata": dict}]"""
        pass

    @abstractmethod
    async def query(self, embedding: list[float], top_k: int = 5, namespace: str | None = None) -> list[dict]:
        """Query and return [{"id": str, "score": float, "text": str, "metadata": dict}]"""
        pass

    @abstractmethod
    async def delete(self, ids: list[str] | None = None, namespace: str | None = None, delete_all: bool = False):
        pass


class PineconeProvider(VectorDBProvider):
    def __init__(self, config: dict):
        self.api_key = config.get("api_key", "")
        self.index_name = config.get("index_name", "knowledge-base")
        self.host = config.get("host", "")
        self._index = None

    async def connect(self):
        from pinecone import Pinecone
        pc = Pinecone(api_key=self.api_key)
        self._index = pc.Index(self.index_name, host=self.host) if self.host else pc.Index(self.index_name)
        logger.info(f"Connected to Pinecone index: {self.index_name}")

    async def upsert(self, vectors: list[dict], namespace: str | None = None):
        if not self._index:
            await self.connect()
        batch_size = 100
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i + batch_size]
            upsert_data = [(v["id"], v["values"], v.get("metadata", {})) for v in batch]
            self._index.upsert(vectors=upsert_data, namespace=namespace or "")
        logger.info(f"Upserted {len(vectors)} vectors to Pinecone")

    async def query(self, embedding: list[float], top_k: int = 5, namespace: str | None = None) -> list[dict]:
        if not self._index:
            await self.connect()
        result = self._index.query(
            vector=embedding,
            top_k=top_k,
            include_metadata=True,
            namespace=namespace or "",
        )
        return [
            {
                "id": match["id"],
                "score": match["score"],
                "text": match.get("metadata", {}).get("text", ""),
                "metadata": match.get("metadata", {}),
            }
            for match in result.get("matches", [])
        ]

    async def delete(self, ids: list[str] | None = None, namespace: str | None = None, delete_all: bool = False):
        if not self._index:
            await self.connect()
        if delete_all:
            self._index.delete(delete_all=True, namespace=namespace or "")
        elif ids:
            self._index.delete(ids=ids, namespace=namespace or "")


def get_provider(name: str, config: dict) -> VectorDBProvider:
    """Factory function to get a vector DB provider by name."""
    providers = {
        "pinecone": PineconeProvider,
    }
    provider_cls = providers.get(name)
    if not provider_cls:
        raise ValueError(f"Unsupported vector DB provider: {name}. Available: {list(providers.keys())}")
    return provider_cls(config)
