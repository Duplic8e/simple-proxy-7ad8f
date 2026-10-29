"""LangChain tools that give an agent hands: a sandboxed workspace + the simulator."""
from pathlib import Path

from langchain.tools import tool

from .sim import run_simulation as _simulate


def make_tools(workdir: str):
    root = Path(workdir).resolve()
    root.mkdir(parents=True, exist_ok=True)

    def _safe(rel: str) -> Path:
        p = (root / rel).resolve()
        if root not in p.parents and p != root:
            raise ValueError(f"path escapes workspace: {rel}")
        return p

    @tool
    def read_file(path: str) -> str:
        """Read a text file (RTL, testbench, spec) from the workspace."""
        return _safe(path).read_text()

    @tool
    def write_file(path: str, content: str) -> str:
        """Write a file into the workspace (e.g. a SystemVerilog/Verilog testbench)."""
        p = _safe(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)
        return f"wrote {len(content)} bytes to {path}"

    @tool
    def run_simulation(files: list[str], top: str) -> str:
        """Compile the given workspace files with iverilog and simulate module `top`.
        Returns status (compile_error|fail|pass|timeout) and the simulator log."""
        res = _simulate([str(_safe(f)) for f in files], top)
        return f"status={res['status']}\n{res['log']}"

    return [read_file, write_file, run_simulation]
