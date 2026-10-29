"""Lesson 3 - Deterministic orchestration with LangGraph (the capstone flow).
Agents are flexible but unpredictable. For verification you want a fixed skeleton
(plan -> write -> simulate -> triage -> report) with LLMs only at the judgment steps.
"""
from langchain.chat_models import init_chat_model

from asic_verif.graph import build_graph

graph = build_graph(init_chat_model("anthropic:claude-sonnet-5-5", temperature=0))
for dut in ("dut/counter.v", "dut/counter_buggy.v"):
    out = graph.invoke({"dut_path": dut, "spec": open("dut/counter_spec.md").read(),
                        "workdir": "build", "max_iters": 3})
    print(f"=== {dut} ===\n{out['report']}\n")
