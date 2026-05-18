import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
from pathlib import Path
import hashlib
import structlog
from typing import Optional, Any

log = structlog.get_logger()

EXCLUDED_FILES = {"task_queue.md", "received_files.md", "state.md"}

class RAGManager:
    def __init__(self, config: Any):
        self.config = config
        self.enabled = config.enabled
        if not self.enabled:
            return

        # Embedded ChromaDB — stores at /memory/rag/
        try:
            self.client = chromadb.PersistentClient(
                path="/memory/rag",
                settings=Settings(anonymized_telemetry=False)
            )
            self.collection = self.client.get_or_create_collection(
                name="agent_knowledge",
                metadata={"hnsw:space": "cosine"}
            )
            self.embedder = SentenceTransformer(config.embedding_model)
            log.info("rag.initialized", collection_count=self.collection.count())
        except Exception as e:
            log.error("rag.init_error", error=str(e))
            self.enabled = False

    async def index_file(self, file_path: Path) -> None:
        """Index or re-index a single file. Called after every memory write."""
        if not self.enabled:
            return
        if file_path.name in EXCLUDED_FILES:
            return
        if not self._should_index(file_path):
            return

        try:
            content = file_path.read_text(encoding="utf-8")
            if not content.strip():
                return

            # Chunk the content
            chunks = self._chunk(content)
            file_hash = hashlib.md5(content.encode()).hexdigest()

            # Delete existing chunks for this file before re-indexing
            existing = self.collection.get(where={"source": str(file_path)})
            if existing["ids"]:
                self.collection.delete(ids=existing["ids"])

            if not chunks:
                return

            # Generate embeddings for all chunks at once (batch is faster)
            embeddings = self.embedder.encode(chunks, show_progress_bar=False).tolist()

            ids = [f"{file_hash}-{i}" for i in range(len(chunks))]
            metadatas = [{"source": str(file_path), "file": file_path.name, "chunk": i} for i in range(len(chunks))]

            self.collection.add(documents=chunks, embeddings=embeddings, ids=ids, metadatas=metadatas)
            log.info("rag.indexed", file=str(file_path), chunks=len(chunks))

        except Exception as e:
            # RAG indexing failure must NEVER crash the agent
            log.error("rag.index_error", file=str(file_path), error=str(e))

    async def index_folder(self, folder_path: Path, file_types: list[str] = None) -> None:
        """Index all files in a folder. Called on startup and on new file receipt."""
        if not self.enabled:
            return
        allowed = set(file_types) if file_types else {".md", ".txt", ".pdf"}
        for file_path in folder_path.rglob("*"):
            if file_path.is_file() and file_path.suffix in allowed:
                await self.index_file(file_path)

    async def query(self, query_text: str, top_k: int = None) -> str:
        """Return relevant context as a formatted string for LLM injection."""
        if not self.enabled or self.collection.count() == 0:
            return ""
        k = top_k or self.config.top_k
        try:
            query_embedding = self.embedder.encode([query_text]).tolist()
            results = self.collection.query(
                query_embeddings=query_embedding,
                n_results=min(k, self.collection.count()),
                include=["documents", "metadatas", "distances"]
            )
            # Filter by relevance (cosine distance < 0.5 means relevant)
            output_parts = []
            for doc, meta, dist in zip(results["documents"][0], results["metadatas"][0], results["distances"][0]):
                if dist < 0.5:
                    output_parts.append(f"[From {meta['file']}]\n{doc}")
            return "\n\n---\n\n".join(output_parts)
        except Exception as e:
            log.error("rag.query_error", error=str(e))
            return ""

    async def force_reindex(self) -> int:
        """Full re-index of all configured folders. Returns chunk count."""
        if not self.enabled:
            return 0
        try:
            self.collection.delete(where={})  # Clear all
            for folder_config in self.config.folders:
                path = Path(folder_config.path)
                if path.exists():
                    await self.index_folder(path, folder_config.file_types)
            return self.collection.count()
        except Exception as e:
            log.error("rag.reindex_error", error=str(e))
            return 0

    def _chunk(self, text: str) -> list[str]:
        size = self.config.chunk_size
        overlap = self.config.chunk_overlap
        chunks = []
        start = 0
        while start < len(text):
            end = start + size
            chunks.append(text[start:end])
            start += size - overlap
        return [c for c in chunks if c.strip()]

    def _should_index(self, file_path: Path) -> bool:
        if not file_path.exists():
            return False
        if file_path.stat().st_size > self.config.max_file_size_kb * 1024:
            return False
        return True
