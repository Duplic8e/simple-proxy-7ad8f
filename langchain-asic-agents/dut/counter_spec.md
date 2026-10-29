# counter spec
- Ports: clk, rst (sync, active high), en, count[3:0].
- rst=1 on a rising clk edge -> count becomes 0 (rst has priority over en).
- en=1 on a rising clk edge -> count increments by 1; wraps 15 -> 0.
- en=0 -> count holds.
