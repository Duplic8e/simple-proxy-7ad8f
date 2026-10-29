"""Lesson 1 - Models, prompts, structured output, and the | (LCEL) operator.
Run: ANTHROPIC_API_KEY=... python lessons/01_model_prompt_chain.py
Concept: an LLM call is just a function. Structured output turns prose into typed data you can code against.
"""
from langchain.chat_models import init_chat_model
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

llm = init_chat_model("anthropic:claude-sonnet-5-5", temperature=0)

# 1) plain call
print(llm.invoke("In one sentence: what is a UVM scoreboard?").content)


# 2) prompt | model | typed output
class Requirements(BaseModel):
    requirements: list[str] = Field(description="Atomic, testable requirements")


prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an ASIC design verification engineer."),
    ("human", "Extract atomic testable requirements from this spec:\n{spec}"),
])
chain = prompt | llm.with_structured_output(Requirements)
print(chain.invoke({"spec": open("dut/counter_spec.md").read()}).requirements)
