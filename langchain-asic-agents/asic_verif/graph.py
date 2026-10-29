"""Capstone: a LangGraph verification flow.

  plan -> write_tb -> simulate -+-> report            (pass)
                ^               +-> triage -> report  (dut_bug)
                |               |      |
                +---------------+------+ (tb_error, retry up to max_iters)

LLM nodes decide (plan, write, triage); the simulator node is plain deterministic code.
`llm` is anything exposing `.with_structured_output(schema)` (any LangChain chat model).
"""
from pathlib import Path
from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from .sim import run_simulation


class VerifPlan(BaseModel):
    scenarios: list[str] = Field(description="Directed test scenarios, one line each")


class TbCode(BaseModel):
    code: str = Field(description="Complete self-checking Verilog testbench. Module name must be `tb`. "
                      "Print 'FAIL: ...' on any mismatch, 'PASS' at the end, then $finish.")


class Triage(BaseModel):
    verdict: Literal["tb_error", "dut_bug"]
    explanation: str = Field(description="Why; cite the failing log line and the spec clause")


class State(TypedDict, total=False):
    spec: str
    dut_path: str
    workdir: str
    plan: list[str]
    tb_code: str
    sim_status: str
    sim_log: str
    verdict: str
    explanation: str
    iters: int
    max_iters: int
    report: str


def build_graph(llm):
    planner = llm.with_structured_output(VerifPlan)
    writer = llm.with_structured_output(TbCode)
    triager = llm.with_structured_output(Triage)

    def plan(s: State):
        r = planner.invoke(f"You are a DV engineer. Spec:\n{s['spec']}\nList directed scenarios incl. corner cases.")
        return {"plan": r.scenarios, "iters": 0}

    def write_tb(s: State):
        feedback = ""
        if s.get("sim_log"):
            feedback = (f"\nYour previous testbench:\n{s['tb_code']}\nSimulator said ({s['sim_status']}):\n"
                        f"{s['sim_log']}\nFix the TESTBENCH.")
        r = writer.invoke(f"Spec:\n{s['spec']}\nScenarios:\n" + "\n".join(s["plan"]) + feedback)
        return {"tb_code": r.code, "iters": s.get("iters", 0) + 1}

    def simulate(s: State):
        wd = Path(s["workdir"]); wd.mkdir(parents=True, exist_ok=True)
        tb = wd / "tb.v"; tb.write_text(s["tb_code"])
        res = run_simulation([s["dut_path"], str(tb)], top="tb")
        return {"sim_status": res["status"], "sim_log": res["log"]}

    def triage(s: State):
        r = triager.invoke(
            f"Spec:\n{s['spec']}\nTbCode:\n{s['tb_code']}\nSimulation log:\n{s['sim_log']}\n"
            "Is the failure caused by a testbench mistake or a real DUT bug?")
        return {"verdict": r.verdict, "explanation": r.explanation}

    def report(s: State):
        v = "pass" if s["sim_status"] == "pass" else s.get("verdict", "unresolved")
        text = (f"RESULT: {v}\niterations: {s.get('iters')}\nstatus: {s['sim_status']}\n"
                f"{s.get('explanation', '')}\n--- log ---\n{s['sim_log']}")
        return {"verdict": v, "report": text}

    def after_sim(s: State) -> Literal["triage", "write_tb", "report"]:
        if s["sim_status"] == "pass":
            return "report"
        if s["sim_status"] in ("compile_error", "timeout"):   # cheap, deterministic routing: no LLM needed
            return "write_tb" if s["iters"] < s.get("max_iters", 3) else "report"
        return "triage"

    def after_triage(s: State) -> Literal["write_tb", "report"]:
        if s["verdict"] == "tb_error" and s["iters"] < s.get("max_iters", 3):
            return "write_tb"
        return "report"

    g = StateGraph(State)
    for n, f in [("plan", plan), ("write_tb", write_tb), ("simulate", simulate),
                 ("triage", triage), ("report", report)]:
        g.add_node(n, f)
    g.add_edge(START, "plan")
    g.add_edge("plan", "write_tb")
    g.add_edge("write_tb", "simulate")
    g.add_conditional_edges("simulate", after_sim)
    g.add_conditional_edges("triage", after_triage)
    g.add_edge("report", END)
    return g.compile()
