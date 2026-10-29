"""Deterministic EDA plumbing: compile + simulate with Icarus Verilog.

Agents should call tools like this rather than 'imagining' simulator results.
"""
import subprocess
import tempfile
from pathlib import Path

MAX_LOG = 4000


def run_simulation(files: list[str], top: str, timeout: int = 30) -> dict:
    """Compile `files` with iverilog and run `top`. Returns status + (truncated) log.

    status: "compile_error" | "timeout" | "fail" | "pass"
    A testbench must print a line containing "FAIL" on any mismatch and "PASS" at the end.
    """
    with tempfile.TemporaryDirectory() as tmp:
        out = str(Path(tmp) / "sim.vvp")
        comp = subprocess.run(
            ["iverilog", "-g2012", "-s", top, "-o", out, *files],
            capture_output=True, text=True,
        )
        if comp.returncode != 0:
            return {"status": "compile_error", "log": (comp.stdout + comp.stderr)[:MAX_LOG]}
        try:
            run = subprocess.run(["vvp", out], capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            return {"status": "timeout", "log": f"simulation exceeded {timeout}s (missing $finish?)"}
    log = (run.stdout + run.stderr)[:MAX_LOG]
    if "FAIL" in log:
        status = "fail"
    elif "PASS" in log:
        status = "pass"
    else:
        status = "fail"
        log += "\n[harness] testbench printed neither PASS nor FAIL"
    return {"status": status, "log": log}
