// Same spec as counter.v, but with a planted bug: saturates at 14 instead of wrapping 15 -> 0.
module counter (
    input  wire       clk,
    input  wire       rst,
    input  wire       en,
    output reg  [3:0] count
);
    always @(posedge clk) begin
        if (rst)                       count <= 4'd0;
        else if (en && count != 4'd14) count <= count + 4'd1;
    end
endmodule
