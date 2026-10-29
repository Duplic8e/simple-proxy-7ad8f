"""CLI: python -m asic_verif.run dut/counter_buggy.v dut/counter_spec.md"""
import sys

from langchain.chat_models import init_chat_model

from .graph import build_graph

if __name__ == "__main__":
    dut, spec = sys.argv[1], sys.argv[2]
    llm = init_chat_model("anthropic:claude-sonnet-5-5", temperature=0)
    out = build_graph(llm).invoke(
        {"dut_path": dut, "spec": open(spec).read(), "workdir": "build", "max_iters": 3})
    print(out["report"])
