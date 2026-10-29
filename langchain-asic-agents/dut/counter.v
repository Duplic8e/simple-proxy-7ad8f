// 4-bit up counter, synchronous active-high reset, count enable, wraps at 15.
module counter (
    input  wire       clk,
    input  wire       rst,
    input  wire       en,
    output reg  [3:0] count
);
    always @(posedge clk) begin
        if (rst)      count <= 4'd0;
        else if (en)  count <= count + 4'd1;
    end
endmodule
