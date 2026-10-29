"""Offline tests: real iverilog, scripted fake LLM. Run: pytest -q (from langchain-asic-agents/)."""
import shutil

import pytest
from langchain_core.runnables import RunnableLambda

from asic_verif.graph import TbCode, VerifPlan, Triage, build_graph
from asic_verif.sim import run_simulation

pytestmark = pytest.mark.skipif(shutil.which("iverilog") is None, reason="needs iverilog (apt install iverilog)")

GOOD_TB = """module tb; reg clk=0,rst=1,en=0; wire [3:0] count; integer i;
counter d(.clk(clk),.rst(rst),.en(en),.count(count)); always #5 clk=~clk;
initial begin
  @(posedge clk); #1 rst=0; en=1;
  for (i=1;i<=17;i=i+1) begin @(posedge clk); #1;
    if (count !== i[3:0]) $display("FAIL: i=%0d count=%0d", i, count); end
  $display("PASS"); $finish; end endmodule"""
BAD_SYNTAX_TB = "module tb; this is not verilog; endmodule"


class FakeLLM:
    """with_structured_output(schema) -> runnable popping the next scripted answer for that schema."""
    def __init__(self, script): self.script = {k: list(v) for k, v in script.items()}
    def with_structured_output(self, schema):
        return RunnableLambda(lambda _: self.script[schema.__name__].pop(0))


def run(dut, script, **kw):
    return build_graph(FakeLLM(script)).invoke(
        {"dut_path": dut, "spec": "s", "workdir": "build_test", "max_iters": 3, **kw})


def test_sim_tool_pass_and_fail(tmp_path):
    (tmp_path / "tb.v").write_text(GOOD_TB)
    assert run_simulation(["dut/counter.v", str(tmp_path / "tb.v")], "tb")["status"] == "pass"
    assert run_simulation(["dut/counter_buggy.v", str(tmp_path / "tb.v")], "tb")["status"] == "fail"


def test_good_dut_passes():
    out = run("dut/counter.v", {"VerifPlan": [VerifPlan(scenarios=["wrap"])], "TbCode": [TbCode(code=GOOD_TB)]})
    assert out["verdict"] == "pass"


def test_buggy_dut_found():
    out = run("dut/counter_buggy.v", {
        "VerifPlan": [VerifPlan(scenarios=["wrap"])], "TbCode": [TbCode(code=GOOD_TB)],
        "Triage": [Triage(verdict="dut_bug", explanation="stuck at 14, spec says wrap 15->0")]})
    assert out["verdict"] == "dut_bug" and out["iters"] == 1


def test_tb_compile_error_is_repaired():
    out = run("dut/counter.v", {"VerifPlan": [VerifPlan(scenarios=["x"])],
                                "TbCode": [TbCode(code=BAD_SYNTAX_TB), TbCode(code=GOOD_TB)]})
    assert out["verdict"] == "pass" and out["iters"] == 2


def test_gives_up_after_max_iters():
    out = run("dut/counter.v", {"VerifPlan": [VerifPlan(scenarios=["x"])],
                                "TbCode": [TbCode(code=BAD_SYNTAX_TB)] * 3}, max_iters=3)
    assert out["verdict"] == "unresolved" and out["iters"] == 3
