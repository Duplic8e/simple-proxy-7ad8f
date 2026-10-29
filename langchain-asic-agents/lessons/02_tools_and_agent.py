"""Lesson 2 - Tools + your first agent.
An agent = a model in a loop: think -> call tool -> observe -> repeat until done.
Here the agent writes a testbench, runs the real simulator, reads the log, and iterates by itself.
"""
from langchain.agents import create_agent

from asic_verif.tools import make_tools

SYSTEM = """You are a DV engineer. Using the tools: write a self-checking Verilog testbench (module `tb`)
for the DUT, simulate it with run_simulation, and fix problems you find in the TESTBENCH.
The testbench must print 'FAIL: <detail>' on mismatch and 'PASS' at the end, then $finish.
If it fails and the testbench is right, the DUT has a bug: report it with evidence."""

agent = create_agent("anthropic:claude-sonnet-5-5", tools=make_tools("build"), system_prompt=SYSTEM)

if __name__ == "__main__":
    import os, shutil
    os.makedirs("build", exist_ok=True)
    shutil.copy("dut/counter_buggy.v", "build/counter.v")   # the agent's sandbox is ./build
    spec = open("dut/counter_spec.md").read()
    result = agent.invoke({"messages": [("user",
        f"Spec:\n{spec}\nDUT is at counter.v in the workspace. Verify it, write tb.v, report findings.")]})
    for m in result["messages"]:
        m.pretty_print()   # watch the loop: AI tool call -> Tool result -> AI ...
