# LangChain agents: 0 → hero, aimed at ASIC design verification

Goal: an agentic flow that reads a spec, writes a self-checking testbench, runs a real simulator,
triages failures (testbench bug vs. DUT bug), and reports. Everything runs locally with Icarus Verilog.

## Setup
```bash
sudo apt install iverilog          # or brew install icarus-verilog
python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
export ANTHROPIC_API_KEY=...       # lessons only; the tests need no key
pytest -q                          # offline: real simulator + scripted fake LLM
```

## Roadmap
| Stage | You learn | In this repo |
|---|---|---|
| 0. Mental model | LLM = stateless function; agent = LLM in a loop with tools; graph = fixed skeleton with LLM at decision points | this README |
| 1. Models & prompts | `init_chat_model`, prompt templates, `prompt \| model` chains, **structured output** (Pydantic) | `lessons/01_model_prompt_chain.py` |
| 2. Tools | `@tool`, docstrings are the API the model sees, sandboxing file access | `asic_verif/tools.py`, `asic_verif/sim.py` |
| 3. First agent | `create_agent`, the think→act→observe loop, reading message traces | `lessons/02_tools_and_agent.py` |
| 4. Orchestration | LangGraph: state, nodes, conditional edges, retry caps; deterministic code for deterministic work | `asic_verif/graph.py`, `lessons/03_langgraph_flow.py` |
| 5. Testing agents | Fake LLMs + real tools; test routing and loop bounds, not prose | `tests/test_flow.py` |
| 6. Next steps (exercises below) | memory/checkpointers, human-in-the-loop, RAG over specs, coverage, tracing | — |

## Run the capstone
```bash
python -m asic_verif.run dut/counter.v       dut/counter_spec.md   # expect: RESULT: pass
python -m asic_verif.run dut/counter_buggy.v dut/counter_spec.md   # expect: RESULT: dut_bug (stuck at 14)
```

## Design principles worth internalising
1. **Never let the LLM "simulate in its head."** Pass/fail comes from the simulator; the LLM only writes and interprets.
2. **Route deterministically when you can.** Compile errors go straight back to the writer; only genuine sim failures need an LLM triage.
3. **Bound every loop** (`max_iters`) and make "unresolved" a first-class outcome.
4. **Self-checking testbench contract** (`FAIL:`/`PASS` lines) is what makes tool output machine-judgeable.
5. **Triage is the hard part**: a failing test is evidence, not a verdict; the LLM must cite the spec clause.

## Exercises (the road to hero)
1. Add a golden-reference-model node: LLM writes a Python model of the spec, compare against sim traces.
2. Swap the simple FIFO of scenarios for constrained-random stimulus + a coverage report (Verilator `--coverage`, or cocotb).
3. Add a LangGraph checkpointer + `interrupt()` so a human approves a "DUT bug" before it files a ticket.
4. RAG: index a real multi-page spec (vector store) and let the planner retrieve clauses per scenario.
5. Move to SystemVerilog/UVM or cocotb; add formal (SymbiYosys) assertions as another tool.
6. Add LangSmith tracing and build an eval set: N buggy DUT mutants, measure bug-detection rate per prompt/model.
7. Multi-agent: separate Planner, Writer, Triager with their own prompts/models; compare vs the single graph.
